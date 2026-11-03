import { describe, it, expect, vi, afterAll } from "vitest";
import { runInAiCall } from "@/lib/ai/call-context";

const createMock = vi.fn().mockResolvedValue({ id: "log1" });

vi.mock("@/lib/prisma", () => ({
    prisma: { aiCallLog: { create: createMock } },
}));

const originalFetch = globalThis.fetch;
const upstream = vi.fn();

afterAll(() => {
    globalThis.fetch = originalFetch;
});

/** 模拟 OpenAI 兼容响应 */
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("installAiFetchRecorder 接线", () => {
    it("非 AI 上下文的请求原样透传，不写日志", async () => {
        upstream.mockResolvedValue(jsonResponse({ ok: true }));
        globalThis.fetch = upstream as unknown as typeof fetch;

        const { installAiFetchRecorder } = await import("@/lib/ai/fetch-recorder");
        installAiFetchRecorder();

        await globalThis.fetch("https://api.example.com/v1/other");
        expect(createMock).not.toHaveBeenCalled();
    });

    it("AI 上下文内的请求提取 usage 并写入日志", async () => {
        upstream.mockResolvedValue(
            jsonResponse({
                model: "m1",
                usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 64 } },
            })
        );

        const res = await runInAiCall(
            { reason: "gradeAnswer", provider: "openai", model: "m1" },
            () =>
                globalThis.fetch("https://api.example.com/v1/chat/completions", {
                    method: "POST",
                    body: JSON.stringify({ model: "m1", messages: [] }),
                })
        );
        expect(res.status).toBe(200);
        expect(createMock).toHaveBeenCalledTimes(1);
        const arg = createMock.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(arg.data).toMatchObject({
            provider: "openai",
            reason: "gradeAnswer",
            model: "m1",
            status: 200,
            inputTokens: 100,
            outputTokens: 20,
            cachedTokens: 64,
        });
        expect(String(arg.data.endpoint)).toContain("/v1/chat/completions");
        expect(arg.data.durationMs).toBeTypeOf("number");
    });

    it("上游报错（HTTP 500）时也记一条失败日志", async () => {
        upstream.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

        await runInAiCall({ reason: "analyzeImage", provider: "gemini" }, () =>
            globalThis.fetch("https://gen.example.com/v1/models/m:generateContent")
        );
        const arg = createMock.mock.calls[createMock.mock.calls.length - 1][0] as { data: Record<string, unknown> };
        expect(arg.data).toMatchObject({ provider: "gemini", reason: "analyzeImage", status: 500, error: "HTTP 500" });
    });

    it("网络异常时记 status 0 并继续抛出", async () => {
        upstream.mockRejectedValue(new Error("ECONNRESET"));

        await expect(
            runInAiCall({ reason: "fixLatex", provider: "anthropic" }, () => globalThis.fetch("https://api.example.com/v1/messages"))
        ).rejects.toThrow("ECONNRESET");
        const arg = createMock.mock.calls[createMock.mock.calls.length - 1][0] as { data: Record<string, unknown> };
        expect(arg.data).toMatchObject({ status: 0 });
        expect(String(arg.data.error)).toContain("ECONNRESET");
    });
});
