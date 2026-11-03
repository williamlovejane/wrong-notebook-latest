/**
 * 手写内容 AI 识别复核：把手写画布截图交给视觉模型，判断写的是不是期望的字。
 * AI 未配置或调用失败时返回 null，由调用方降级到本地笔顺匹配结果。
 */
import { getAIService } from "@/lib/ai";
import { createLogger } from "@/lib/logger";

const logger = createLogger("dictation:handwriting-grade");

export interface HandwritingAiResult {
    recognized: string;
    correct: boolean;
}

function parseAiJson(text: string): HandwritingAiResult | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const data = JSON.parse(match[0]) as { recognized?: unknown; correct?: unknown };
        if (typeof data.recognized !== "string" || typeof data.correct !== "boolean") return null;
        return { recognized: data.recognized.trim(), correct: data.correct };
    } catch {
        return null;
    }
}

/** 期望字串（如 "花" 或 "花园"），image 为画布截图 dataURL 或纯 base64 */
export async function recognizeHandwriting(
    imageBase64: string,
    mimeType: string,
    expected: string
): Promise<HandwritingAiResult | null> {
    const prompt = [
        "你在批改小学生汉字听写作业。图中是一个或多个田字格里手写的汉字，可能写得歪斜、比例不一。",
        `标准答案是：「${expected}」`,
        "请判断图中手写的内容是否就是这个（这几个）字：写对了就算对；写成了别的字、多字少字或明显乱画算错。",
        '只输出一个 JSON 对象，不要输出其他内容，格式：{"recognized":"你读出的字","correct":true或false}',
    ].join("\n");

    try {
        const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const text = await getAIService().analyzeImageWithPrompt(base64, mimeType, prompt);
        const parsed = parseAiJson(text);
        if (!parsed) {
            logger.warn({ text: text.slice(0, 200) }, "手写识别返回格式异常");
            return null;
        }
        return parsed;
    } catch (error) {
        logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            "手写 AI 复核不可用"
        );
        return null;
    }
}
