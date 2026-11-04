/**
 * 课内组词链集成测试。
 * 依赖 data/yuwen/ 下的参考库（textbook.sqlite / words.db），
 * 参考库不存在时整组跳过（CI 环境无此数据）。
 *
 * 学过的字不再来自手工字库，而是按学期从课本权威库推导
 * （learnedCharSets），与线上 quiz route 的取数方式一致。
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
    findCiyuCandidates,
    findComposedCandidates,
    findTextbookCandidates,
} from "@/lib/dictation/word-source";
import {
    isTextbookAvailable,
    isWordsDictAvailable,
    learnedCharSets,
    type LearnedSets,
} from "@/lib/yuwen/db";
import { currentSemesterFromProfile } from "@/lib/yuwen/semester";

const hasData =
    fs.existsSync(path.join(process.cwd(), "data", "yuwen", "textbook.sqlite")) &&
    fs.existsSync(path.join(process.cwd(), "data", "yuwen", "words.db"));

/** 构造一个受控的小学期字集，模拟"只学过这几个字"的场景 */
function fakeLearned(chars: string): LearnedSets {
    const arr = Array.from(new Set(Array.from(chars)));
    const set = new Set(arr);
    return { xiezi: set, shizi: set, all: set, poolString: arr.join("") };
}

describe.skipIf(!hasData)("word-source 课内组词链", () => {
    it("参考库可用性探测", () => {
        expect(isTextbookAvailable()).toBe(true);
        expect(isWordsDictAvailable()).toBe(true);
    });

    it("learnedCharSets 按学期推导学过的字（截至二上）", () => {
        const sets = learnedCharSets(2, "上");
        // 五册库里截至二上必然有几百个字
        expect(sets.all.size).toBeGreaterThan(300);
        // 低年级范围严格小于高年级
        const yi1 = learnedCharSets(1, "上");
        expect(yi1.all.size).toBeLessThan(sets.all.size);
        const san3 = learnedCharSets(3, "上");
        expect(san3.all.size).toBeGreaterThanOrEqual(sets.all.size);
    });

    it("词语表匹配：含目标字且其余字是学过的字", () => {
        // 「园」在多个学期的词语表里都有词（花园/公园等）
        const learned = fakeLearned("大小天地上学花园水公");
        const cands = findCiyuCandidates("园", learned);
        expect(cands.length).toBeGreaterThan(0);
        for (const c of cands) {
            expect(c.word).toContain("园");
            expect(c.sourceLabel).toMatch(/词语表$/);
            expect(c.pinyin).not.toBe("");
        }
    });

    it("词语表不收录的字走课内字组合", () => {
        // 「滴」不在任何教材词语表中，应从 jieba 词表组合出 点滴/水滴 等
        const learned = fakeLearned("一水几雨点串珠汗泪墨");
        const cands = findComposedCandidates("滴", learned);
        expect(cands.length).toBeGreaterThan(0);
        expect(cands.every((c) => c.word.includes("滴"))).toBe(true);
        expect(
            cands.some((c) => c.source === "xiezi" || c.source === "shizi")
        ).toBe(true);
    });

    it("完整链：学过的字以外的字不会出现在候选词里", () => {
        const learned = fakeLearned("水喝大口");
        const cands = findTextbookCandidates("喝", learned);
        for (const c of cands) {
            for (const ch of c.word) {
                if (ch === "喝") continue;
                expect(learned.all.has(ch)).toBe(true);
            }
        }
    });

    it("真实学期范围：二上学过的字给「喝」组词无报错", () => {
        const sets = learnedCharSets(2, "上");
        const cands = findTextbookCandidates("喝", sets);
        for (const c of cands) {
            expect(c.word).toContain("喝");
        }
    });

    it("字集为空时返回空数组而非报错", () => {
        const empty: LearnedSets = {
            xiezi: new Set(),
            shizi: new Set(),
            all: new Set(),
            poolString: "",
        };
        expect(findTextbookCandidates("靓", empty)).toEqual([]);
    });
});

describe("currentSemesterFromProfile 学期推导", () => {
    // 固定时钟测试：mock Date 到 2026-03（一年级下，2025 年 9 月入学）
    const fixedMarch = new Date("2026-03-15T10:00:00");
    const realDate = Date;
    const fixedSep = new Date("2026-10-15T10:00:00");

    function withDate(d: Date, fn: () => void) {
        const Orig = globalThis.Date;
        globalThis.Date = class extends realDate {
            // args 放宽为 unknown[]：ConstructorParameters 只给出单参重载，
            // 其 length 是字面量 1，与 0 比较会被 TS 判为 no overlap
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Date 构造器重载与 rest 参数不兼容，测试替身需要 any[]
            constructor(...args: any[]) {
                if (args.length === 0) {
                    super(d.getTime());
                } else {
                    super(...(args as ConstructorParameters<typeof realDate>));
                }
            }
            static now() {
                return d.getTime();
            }
        } as unknown as typeof Date;
        try {
            fn();
        } finally {
            globalThis.Date = Orig;
        }
    }

    it("2025年9月入学，2026年3月为一年级下", () => {
        withDate(fixedMarch, () => {
            expect(
                currentSemesterFromProfile("primary", 2025)
            ).toEqual({ grade: 1, semester: "下" });
        });
    });

    it("2025年9月入学，2026年10月为二年级上", () => {
        withDate(fixedSep, () => {
            expect(
                currentSemesterFromProfile("primary", 2025)
            ).toEqual({ grade: 2, semester: "上" });
        });
    });

    it("非小学学段返回大年级（组词范围=全部库内字）", () => {
        expect(currentSemesterFromProfile("junior_high", 2024).grade).toBeGreaterThanOrEqual(7);
        expect(currentSemesterFromProfile(null, 2025).grade).toBeGreaterThanOrEqual(7);
        expect(currentSemesterFromProfile("primary", null).grade).toBeGreaterThanOrEqual(7);
    });
});
