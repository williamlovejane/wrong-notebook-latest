/**
 * 大模型调用记录器：包装全局 fetch，在 AI 调用上下文内的每次
 * HTTP 请求结束后提取 usage 并写入 AiCallLog。
 *
 * - 三个 SDK（openai / @anthropic-ai/sdk / @google/genai）都走全局 fetch，
 *   在这里统一拦截即可覆盖所有渠道，无需改动任何 provider 调用点。
 * - 不在 AI 上下文中的请求（登录、图片下载等）原样透传，零开销。
 * - 流式响应（SSE）无法从响应体拿 usage，只记请求次数与耗时。
 */

import { prisma } from "@/lib/prisma";
import { currentAiCall } from "./call-context";
import { createLogger } from "../logger";

const logger = createLogger("ai:usage");

const globalStore = globalThis as typeof globalThis & {
    __aiFetchRecorderInstalled?: boolean;
};

interface ExtractedUsage {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    model?: string;
}

/** 兼容三种 API 格式的 usage 字段（导出供单测） */
export function extractUsage(json: unknown): ExtractedUsage | null {
    if (typeof json !== "object" || json === null) return null;
    const body = json as Record<string, unknown>;
    const out: ExtractedUsage = {};

    const model = body.model ?? body.modelVersion;
    if (typeof model === "string" && model) out.model = model;

    // OpenAI 兼容格式（openai/azure/vendor 渠道）
    const openaiUsage = body.usage as Record<string, unknown> | undefined;
    if (
        openaiUsage &&
        typeof openaiUsage === "object" &&
        (typeof (openaiUsage as Record<string, unknown>).prompt_tokens === "number" ||
            typeof (openaiUsage as Record<string, unknown>).completion_tokens === "number")
    ) {
        const u = openaiUsage as Record<string, unknown>;
        if (typeof u.prompt_tokens === "number") out.inputTokens = u.prompt_tokens;
        if (typeof u.completion_tokens === "number") out.outputTokens = u.completion_tokens;
        const details = u.prompt_tokens_details as Record<string, unknown> | undefined;
        const cached = details?.cached_tokens;
        if (typeof cached === "number") out.cachedTokens = cached;
        return Object.keys(out).length > 0 ? out : null;
    }

    // Anthropic 格式（错误响应体里 usage 在 message 下）
    const anthropicSource =
        (body.usage as Record<string, unknown> | undefined) ??
        ((body.message as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined);
    const anthropicUsage = anthropicSource;
    if (anthropicUsage && typeof anthropicUsage.input_tokens === "number") {
        out.inputTokens = anthropicUsage.input_tokens;
        const outTokens = anthropicUsage.output_tokens;
        if (typeof outTokens === "number") out.outputTokens = outTokens;
        const cacheRead = anthropicUsage.cache_read_input_tokens;
        const cacheWrite = anthropicUsage.cache_creation_input_tokens;
        let cached = 0;
        if (typeof cacheRead === "number") cached += cacheRead;
        if (typeof cacheWrite === "number") cached += cacheWrite;
        if (cached > 0) out.cachedTokens = cached;
        return Object.keys(out).length > 0 ? out : null;
    }

    // Gemini 格式
    const geminiUsage = body.usageMetadata as Record<string, unknown> | undefined;
    if (geminiUsage && typeof geminiUsage === "object") {
        const u = geminiUsage as Record<string, unknown>;
        if (typeof u.promptTokenCount === "number") out.inputTokens = u.promptTokenCount;
        if (typeof u.candidatesTokenCount === "number") out.outputTokens = u.candidatesTokenCount;
        if (typeof u.cachedContentTokenCount === "number" && u.cachedContentTokenCount > 0) {
            out.cachedTokens = u.cachedContentTokenCount;
        }
        return Object.keys(out).length > 0 ? out : null;
    }

    return Object.keys(out).length > 0 ? out : null;
}

/** 请求体里的 model 字段（Gemini 响应体没有 model 时兜底） */
async function extractRequestModel(input: string | Request | URL, init?: RequestInit): Promise<string | undefined> {
    try {
        let raw: string | undefined;
        if (typeof input === "string" || input instanceof URL) {
            if (init?.body && typeof init.body === "string") raw = init.body;
        } else if (typeof input.clone === "function") {
            raw = await input.clone().text();
        }
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as { model?: unknown };
        return typeof parsed.model === "string" ? parsed.model : undefined;
    } catch {
        return undefined;
    }
}

async function recordAiCall(
    url: string,
    ctx: { reason: string; provider: string; model?: string },
    startedAt: number,
    result: { status: number; usage: ExtractedUsage | null } | { error: string }
): Promise<void> {
    const durationMs = Date.now() - startedAt;
    let endpoint: string | undefined;
    try {
        endpoint = new URL(url).pathname;
    } catch {
        endpoint = undefined;
    }

    let data: {
        status: number | null;
        error: string | null;
        inputTokens: number | null;
        outputTokens: number | null;
        cachedTokens: number | null;
    };
    if ("error" in result) {
        data = {
            status: 0,
            error: result.error.slice(0, 500),
            inputTokens: null,
            outputTokens: null,
            cachedTokens: null,
        };
    } else {
        data = {
            status: result.status,
            error: result.status >= 400 ? `HTTP ${result.status}` : null,
            inputTokens: result.usage?.inputTokens ?? null,
            outputTokens: result.usage?.outputTokens ?? null,
            cachedTokens: result.usage?.cachedTokens ?? null,
        };
    }

    const model = "error" in result ? ctx.model : (result.usage?.model ?? ctx.model);

    try {
        await prisma.aiCallLog.create({
            data: {
                provider: ctx.provider,
                model,
                reason: ctx.reason,
                endpoint,
                status: data.status,
                error: data.error,
                durationMs,
                inputTokens: data.inputTokens,
                outputTokens: data.outputTokens,
                cachedTokens: data.cachedTokens,
            },
        });
    } catch (e) {
        // 记录失败不影响业务调用
        logger.warn({ err: e }, "写入 AiCallLog 失败");
    }
}

/** 幂等安装：包装全局 fetch，只为 AI 调用记录日志 */
export function installAiFetchRecorder(): void {
    if (globalStore.__aiFetchRecorderInstalled) return;
    globalStore.__aiFetchRecorderInstalled = true;

    const originalFetch = globalThis.fetch.bind(globalThis);

    type FetchParams = Parameters<typeof fetch>;
    globalThis.fetch = async (input: FetchParams[0], init?: FetchParams[1]): Promise<Response> => {
        const ctx = currentAiCall();
        if (!ctx) return originalFetch(input, init);

        const url =
            typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.href
                  : input.url;
        const startedAt = Date.now();

        try {
            const res = await originalFetch(input, init);
            // 流式响应跳过 usage 提取（SSE 无整体 usage）
            const contentType = res.headers.get("content-type") ?? "";
            if (contentType.includes("text/event-stream")) {
                void recordAiCall(url, ctx, startedAt, { status: res.status, usage: null });
            } else {
                const reqModel = await extractRequestModel(input, init);
                let usage: ExtractedUsage | null = null;
                try {
                    const cloned = res.clone();
                    const json = await cloned.json();
                    usage = extractUsage(json);
                    if (usage && !usage.model && reqModel) usage.model = reqModel;
                } catch {
                    // 响应体不是 JSON（异常页/空体）——只记状态与耗时
                }
                void recordAiCall(url, ctx, startedAt, { status: res.status, usage });
            }
            return res;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            void recordAiCall(url, ctx, startedAt, { error: message });
            throw err;
        }
    };
}
