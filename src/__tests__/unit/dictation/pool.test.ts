import { describe, it, expect } from "vitest";
import {
    normalizePoolChars,
    poolCharsArray,
    poolCharSet,
    validateWord,
    maskWord,
    splitPinyin,
    isAllHanzi,
} from "@/lib/dictation/pool";

const POOL = poolCharSet("花草树木园天地人");

describe("备选字库", () => {
    it("去重且剔除标点与空白", () => {
        expect(normalizePoolChars("花 花，草。天\t地")).toBe("花草天地");
    });

    it("只保留汉字", () => {
        expect(normalizePoolChars("abc花1草！")).toBe("花草");
    });

    it("字符数组与集合一致", () => {
        expect(poolCharsArray("天地天")).toEqual(["天", "地"]);
        expect(POOL.has("花")).toBe(true);
        expect(POOL.has("风")).toBe(false);
    });
});

describe("组词校验", () => {
    it("其余字都在字库内时通过", () => {
        const r = validateWord("花园", "园", POOL);
        expect(r.ok).toBe(true);
        expect(r.maskedAt).toBe(1);
    });

    it("出现字库外的字时拒绝", () => {
        const r = validateWord("公园", "园", poolCharSet("花"));
        expect(r.ok).toBe(false);
        expect(r.illegalChars).toContain("公");
    });

    it("词中不含待考字时拒绝", () => {
        const r = validateWord("花草", "园", POOL);
        expect(r.ok).toBe(false);
        expect(r.reason).toContain("不含");
    });

    it("支持多字词语作为待考内容", () => {
        // 「园地」整体是待考内容，剩下的「学习」都在字库里 -> 通过
        const ok = validateWord("学习园地", "园地", poolCharSet("学习"));
        expect(ok.ok).toBe(true);
        expect(ok.maskedAt).toBe(2);

        // 「美丽」不在字库，且不是待考内容 -> 拒绝
        const bad = validateWord("美丽花园", "园", poolCharSet("花"));
        expect(bad.ok).toBe(false);
        expect(bad.illegalChars).toEqual(["美", "丽"]);
    });

    it("单字成词也算合法", () => {
        const r = validateWord("园", "园", POOL);
        expect(r.ok).toBe(true);
        expect(r.maskedAt).toBe(0);
    });
});

describe("遮蔽与拼音", () => {
    it("把待考字替换为遮蔽符", () => {
        expect(maskWord("花园", "园")).toBe("花○");
        expect(maskWord("校园里", "园")).toBe("校○里");
        expect(maskWord("园", "园")).toBe("○");
    });

    it("拼音按音节拆分", () => {
        expect(splitPinyin("huā yuán")).toEqual(["huā", "yuán"]);
        expect(splitPinyin("  huā   yuán ")).toEqual(["huā", "yuán"]);
    });

    it("汉字判断", () => {
        expect(isAllHanzi("园")).toBe(true);
        expect(isAllHanzi("花园")).toBe(true);
        expect(isAllHanzi("园1")).toBe(false);
        expect(isAllHanzi("apple")).toBe(false);
    });
});
