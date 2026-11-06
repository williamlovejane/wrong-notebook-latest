// @vitest-environment node
/**
 * 标准笔顺数据接口回归测试。
 * 数据从本地 hanzi-writer-data 包按字读取，既不能拼出越界路径，也不能回落到外部 CDN。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    readFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
// 鉴权包装器在测试里直接放行，专注验证数据读取与校验
vi.mock("@/lib/api-handler", () => ({
    withUser: (handler: (req: Request, ctx: { params: Promise<{ char: string }> }) => Promise<Response>) => handler,
}));

import { GET } from "@/app/api/dictation/hanzi-data/[char]/route";
import { isStandardStrokeChar } from "@/lib/dictation/handwriting-types";

const validData = {
    strokes: ["M 1 1 L 9 9"],
    medians: [[[1, 1], [9, 9]]],
    radStrokes: [0],
};

const call = (char: string) =>
    GET(new Request(`http://localhost/api/dictation/hanzi-data/${encodeURIComponent(char)}`), {
        params: Promise.resolve({ char }),
    });

describe("isStandardStrokeChar", () => {
    it("只接受单个汉字", () => {
        expect(isStandardStrokeChar("年")).toBe(true);
        expect(isStandardStrokeChar("年级")).toBe(false);
        expect(isStandardStrokeChar("A")).toBe(false);
        expect(isStandardStrokeChar("1")).toBe(false);
        expect(isStandardStrokeChar("")).toBe(false);
        expect(isStandardStrokeChar("，")).toBe(false);
    });
});

describe("GET /api/dictation/hanzi-data/[char]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.readFile.mockResolvedValue(JSON.stringify(validData));
    });

    it("返回标准笔顺数据并设置长期私有缓存", async () => {
        const response = await call("年");
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            strokes: validData.strokes,
            medians: validData.medians,
            radStrokes: [0],
        });
        expect(response.headers.get("Cache-Control")).toContain("immutable");
        expect(mocks.readFile.mock.calls[0][0]).toContain("hanzi-writer-data");
        expect(mocks.readFile.mock.calls[0][0]).toMatch(/年\.json$/);
    });

    it.each(["年级", "A", "1", "../package", "年.json", "，", ""])(
        "拒绝非单字或带路径的字符 %j，不读文件",
        async (char) => {
            expect((await call(char)).status).toBe(400);
            expect(mocks.readFile).not.toHaveBeenCalled();
        }
    );

    it("数据包里没有该字时返回 404", async () => {
        mocks.readFile.mockRejectedValue(new Error("ENOENT"));
        expect((await call("花")).status).toBe(404);
    });

    it("笔顺数据格式不完整时返回 404", async () => {
        mocks.readFile.mockResolvedValue(JSON.stringify({ strokes: ["M 1 1"] }));
        expect((await call("草")).status).toBe(404);
    });

    it("同一个字只读一次盘，后续命中内存缓存", async () => {
        await call("园");
        await call("园");
        expect(mocks.readFile).toHaveBeenCalledTimes(1);
    });
});
