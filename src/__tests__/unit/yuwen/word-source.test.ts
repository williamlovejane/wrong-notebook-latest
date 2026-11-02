/**
 * 课内组词链集成测试。
 * 依赖 data/yuwen/ 下的参考库（textbook.sqlite / words.db），
 * 参考库不存在时整组跳过（CI 环境无此数据）。
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
    findCiyuCandidates,
    findComposedCandidates,
    findTextbookCandidates,
} from "@/lib/dictation/word-source";
import { isTextbookAvailable, isWordsDictAvailable } from "@/lib/yuwen/db";

const hasData =
    fs.existsSync(path.join(process.cwd(), "data", "yuwen", "textbook.sqlite")) &&
    fs.existsSync(path.join(process.cwd(), "data", "yuwen", "words.db"));

describe.skipIf(!hasData)("word-source 课内组词链", () => {
    it("参考库可用性探测", () => {
        expect(isTextbookAvailable()).toBe(true);
        expect(isWordsDictAvailable()).toBe(true);
    });

    it("词语表匹配：含目标字且其余字在字库", () => {
        // 「园」在多个学期的词语表里都有词（花园/公园等）
        const pool = "大小天地上学花园水公";
        const cands = findCiyuCandidates("园", pool);
        expect(cands.length).toBeGreaterThan(0);
        for (const c of cands) {
            expect(c.word).toContain("园");
            expect(c.sourceLabel).toMatch(/词语表$/);
            expect(c.pinyin).not.toBe("");
        }
    });

    it("词语表不收录的字走课内字组合", () => {
        // 「滴」不在任何教材词语表中，应从 jieba 词表组合出 点滴/水滴 等
        const pool = "一水几雨点串珠汗泪墨";
        const cands = findComposedCandidates("滴", pool);
        expect(cands.length).toBeGreaterThan(0);
        expect(cands.every((c) => c.word.includes("滴"))).toBe(true);
        expect(
            cands.some((c) => c.source === "xiezi" || c.source === "shizi")
        ).toBe(true);
    });

    it("完整链：备选字库外的字不会出现在候选词里", () => {
        const pool = "水喝大口";
        const cands = findTextbookCandidates("喝", pool);
        for (const c of cands) {
            for (const ch of c.word) {
                if (ch === "喝") continue;
                expect(pool).toContain(ch);
            }
        }
    });

    it("AI 兜底场景：字库太小时返回空数组而非报错", () => {
        const cands = findTextbookCandidates("靓", "一");
        expect(Array.isArray(cands)).toBe(true);
    });
});
