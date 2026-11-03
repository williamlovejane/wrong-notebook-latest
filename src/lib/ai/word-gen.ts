import { GoogleGenAI } from "@google/genai";
import OpenAI, { AzureOpenAI } from "openai";
import { getAppConfig, getActiveOpenAIConfig } from "../config";
import { createLogger } from "../logger";
import { validateWord, poolCharSet, normalizePoolChars } from "../dictation/pool";

const logger = createLogger("ai:word-gen");

export interface WordCandidate {
    word: string;
    pinyin: string;
    maskedAt: number;
}

export type WordGenErrorCode =
    | "AI_NOT_CONFIGURED"
    | "AI_CALL_FAILED"
    | "POOL_EMPTY"
    | "NO_VALID_WORD";

export class WordGenError extends Error {
    constructor(public code: WordGenErrorCode, message: string) {
        super(message);
        this.name = "WordGenError";
    }
}

export interface GenerateWordsOptions {
    /** 待考生字/词语 */
    target: string;
    /** 备选字库原始字符串 */
    poolChars: string;
    /** 期望生成数量 */
    count?: number;
    /** 年级学期，用于控制词语难度 */
    gradeSemester?: string | null;
}

function buildPrompt(target: string, poolChars: string[], count: number, gradeSemester?: string | null): string {
    const poolText = poolChars.join(" ");
    return [
        "你是一位小学语文老师，正在为学生准备生字默写题。",
        "",
        `待考生字：「${target}」`,
        `学生已经认识的字（备选字库）：${poolText}`,
        gradeSemester ? `学生年级：${gradeSemester}` : "",
        "",
        `请用「${target}」组 ${count} 个常用词语，严格遵守以下规则：`,
        `1. 每个词语必须包含「${target}」`,
        "2. 词语长度 2 到 3 个字",
        "3. 除了待考生字本身，词语中出现的每一个字都必须在上面「备选字库」列表里，不得出现字库以外的字",
        "4. 词语必须是现代汉语常用词，适合小学生认读",
        `5. 「${target}」在每个词语中只能出现一次，不要出叠词（例如「毛茸茸」「天天」这类待考字重复的词不要用）`,
        "6. 每个词语给出带声调的汉语拼音，音节之间用空格分隔",
        "",
        "只输出 JSON 数组，不要任何解释、不要 markdown 代码块，格式如下：",
        '[{"word":"花园","pinyin":"huā yuán"}]',
    ]
        .filter(Boolean)
        .join("\n");
}

function extractJsonArray(text: string): unknown {
    const cleaned = text
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start < 0 || end < start) {
        throw new WordGenError("AI_CALL_FAILED", "模型未返回 JSON 数组");
    }

    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
        throw new WordGenError("AI_CALL_FAILED", "模型返回的 JSON 无法解析");
    }
}

async function callGemini(prompt: string): Promise<string> {
    const config = getAppConfig();
    const apiKey = config.gemini?.apiKey;
    if (!apiKey) {
        throw new WordGenError("AI_NOT_CONFIGURED", "尚未配置 Gemini API Key");
    }

    const ai = new GoogleGenAI({
        apiKey,
        httpOptions: config.gemini?.baseUrl ? { baseUrl: config.gemini.baseUrl } : undefined,
    });

    const response = await ai.models.generateContent({
        model: config.gemini?.model || "gemini-2.0-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" },
    });

    return response.text || "";
}

async function callOpenAI(prompt: string): Promise<string> {
    const active = getActiveOpenAIConfig();
    if (!active?.apiKey) {
        throw new WordGenError("AI_NOT_CONFIGURED", "尚未配置 OpenAI API Key");
    }

    const client = new OpenAI({
        apiKey: active.apiKey,
        baseURL: active.baseUrl || undefined,
        defaultHeaders: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
    });

    const res = await client.chat.completions.create({
        model: active.model || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
    });

    return res.choices?.[0]?.message?.content || "";
}

async function callAzure(prompt: string): Promise<string> {
    const config = getAppConfig();
    const azure = config.azure;
    if (!azure?.apiKey || !azure.endpoint || !azure.deploymentName) {
        throw new WordGenError("AI_NOT_CONFIGURED", "Azure OpenAI 配置不完整");
    }

    const client = new AzureOpenAI({
        apiKey: azure.apiKey,
        endpoint: azure.endpoint,
        apiVersion: azure.apiVersion || "2024-02-15-preview",
        deployment: azure.deploymentName,
    });

    const res = await client.chat.completions.create({
        model: azure.deploymentName,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
    });

    return res.choices?.[0]?.message?.content || "";
}

async function callModel(prompt: string): Promise<string> {
    const provider = getAppConfig().aiProvider;

    try {
        if (provider === "openai") return await callOpenAI(prompt);
        if (provider === "azure") return await callAzure(prompt);
        return await callGemini(prompt);
    } catch (error) {
        if (error instanceof WordGenError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error, provider }, "组词调用失败");

        if (/API_KEY|api key|apiKey|auth|401|403/i.test(message)) {
            throw new WordGenError("AI_NOT_CONFIGURED", `AI 鉴权失败：${message}`);
        }
        throw new WordGenError("AI_CALL_FAILED", `AI 调用失败：${message}`);
    }
}

/**
 * 让模型按备选字库组词，并在本地做二次校验。
 * 校验不通过的候选词直接丢弃——宁可少几个词，也不出超纲题。
 */
export async function generateWordCandidates(
    options: GenerateWordsOptions
): Promise<WordCandidate[]> {
    const { target, poolChars, count = 6, gradeSemester } = options;

    const poolArray = Array.from(normalizePoolChars(poolChars));
    if (poolArray.length === 0) {
        throw new WordGenError("POOL_EMPTY", "备选字库为空，无法组词");
    }

    const poolSet = poolCharSet(poolChars);
    const prompt = buildPrompt(target, poolArray, count, gradeSemester);
    const raw = await callModel(prompt);
    const parsed = extractJsonArray(raw);

    if (!Array.isArray(parsed)) {
        throw new WordGenError("AI_CALL_FAILED", "模型返回格式不是数组");
    }

    const accepted: WordCandidate[] = [];
    const seen = new Set<string>();

    for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const word = typeof (item as any).word === "string" ? (item as any).word.trim() : "";
        const pinyin =
            typeof (item as any).pinyin === "string" ? (item as any).pinyin.trim() : "";

        if (!word || seen.has(word)) continue;

        const check = validateWord(word, target, poolSet);
        if (!check.ok) {
            logger.info(
                { word, target, reason: check.reason, illegal: check.illegalChars },
                "丢弃不合规组词"
            );
            continue;
        }

        seen.add(word);
        accepted.push({ word, pinyin, maskedAt: check.maskedAt });
    }

    if (accepted.length === 0) {
        throw new WordGenError(
            "NO_VALID_WORD",
            "模型给出的词语都超出了备选字库，请扩充字库后重试"
        );
    }

    logger.info(
        { target, requested: count, accepted: accepted.length },
        "组词生成完成"
    );

    return accepted;
}
