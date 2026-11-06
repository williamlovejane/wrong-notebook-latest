// @vitest-environment node
/** 真实数据包的冒烟测试：Docker standalone 里数据包是显式 COPY 的，路径错了判卷页会整片空白 */
import { describe, expect, it } from "vitest";

import { loadHanziData } from "@/lib/dictation/hanzi-data";

describe("本地 hanzi-writer-data 数据包", () => {
    it("能按字读到标准笔顺", async () => {
        const data = await loadHanziData("年");
        expect(data).not.toBeNull();
        expect(data?.strokes.length).toBeGreaterThan(0);
        expect(data?.medians.length).toBe(data?.strokes.length);
    });

    it("非汉字直接返回 null，不拼文件路径", async () => {
        expect(await loadHanziData("年级")).toBeNull();
        expect(await loadHanziData("../package")).toBeNull();
    });
});
