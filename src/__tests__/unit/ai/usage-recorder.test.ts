import { describe, it, expect } from "vitest";
import { extractUsage } from "@/lib/ai/fetch-recorder";
import { currentAiCall, runInAiCall } from "@/lib/ai/call-context";

describe("extractUsage", () => {
    it("OpenAI 格式：含缓存明细", () => {
        const r = extractUsage({
            model: "gpt-test",
            usage: {
                prompt_tokens: 100,
                completion_tokens: 20,
                prompt_tokens_details: { cached_tokens: 64 },
            },
        });
        expect(r).toEqual({ inputTokens: 100, outputTokens: 20, cachedTokens: 64, model: "gpt-test" });
    });

    it("Anthropic 格式：缓存读写合并", () => {
        const r = extractUsage({
            usage: {
                input_tokens: 50,
                output_tokens: 10,
                cache_read_input_tokens: 30,
                cache_creation_input_tokens: 5,
            },
        });
        expect(r?.inputTokens).toBe(50);
        expect(r?.outputTokens).toBe(10);
        expect(r?.cachedTokens).toBe(35);
    });

    it("Gemini 格式：usageMetadata", () => {
        const r = extractUsage({
            usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 40, cachedContentTokenCount: 100 },
        });
        expect(r).toEqual({ inputTokens: 200, outputTokens: 40, cachedTokens: 100 });
    });

    it("无 usage 字段返回 null，但保留 model", () => {
        expect(extractUsage({ model: "m-1" })).toEqual({ model: "m-1" });
        expect(extractUsage({})).toBeNull();
        expect(extractUsage("not json")).toBeNull();
    });
});

describe("call-context", () => {
    it("runInAiCall 内可读到上下文，外与非 AI 调用读不到", async () => {
        expect(currentAiCall()).toBeNull();
        await runInAiCall({ reason: "gradeAnswer", provider: "openai", model: "gpt-test" }, async () => {
            expect(currentAiCall()?.reason).toBe("gradeAnswer");
            expect(currentAiCall()?.provider).toBe("openai");
            // 模拟 SDK 内部再发请求：异步链中上下文仍在
            await Promise.resolve();
            expect(currentAiCall()?.reason).toBe("gradeAnswer");
        });
        expect(currentAiCall()).toBeNull();
    });
});
