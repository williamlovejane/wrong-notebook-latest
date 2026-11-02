/**
 * 课内组词链：为待考生字按教学价值从高到低找考察用词。
 *
 * 优先级：
 *   1. 缓存词（quiz route 已处理，不在本模块）
 *   2. 教材词语表（ciyu）：教材原文收词，教学价值最高
 *   3. 课内字组合：目标字 × 学过的字（先写字表后识字表），
 *      组合必须能在 jieba 词表中找到，避免组出假词
 *   4. AI 生成（quiz route 的现有兜底）
 *
 * 所有候选都经过 validateWord 校验：词语中除目标字外，
 * 每个字都必须在备选字库（学生已认识的字）里。
 */

import { pinyin } from "pinyin-pro";
import {
    validateWord,
    poolCharSet,
    type WordValidation,
} from "./pool";
import {
    findWordsInCiyu,
    findWordsInDict,
    learnedChars,
    lookupCharSemester,
} from "@/lib/yuwen/db";

export interface WordCandidate {
    word: string;
    pinyin: string; // 空格分隔带声调，如 "huā yuán"
    maskedAt: number;
    source: "ciyu" | "xiezi" | "shizi";
    sourceLabel: string; // 如 "二上·词语表" / "二上·写字表组词"
}

function semLabel(grade: number, semester: string): string {
    return `${grade}${semester}`;
}

function toCandidate(
    word: string,
    validation: WordValidation,
    sourceLabel: string,
    source: WordCandidate["source"]
): WordCandidate | null {
    if (!validation.ok) return null;
    const py = pinyin(word, { toneType: "symbol", type: "array" })
        .join(" ")
        .trim();
    return {
        word,
        pinyin: py,
        maskedAt: validation.maskedAt,
        source,
        sourceLabel,
    };
}

/**
 * 教材词语表匹配：词含目标字、其余字都在备选字库。
 * 同学期内按词语表原顺序（教材编排即难度序）。
 */
export function findCiyuCandidates(
    target: string,
    poolChars: string,
    targetSemester?: { grade: number; semester: "上" | "下" } | null
): WordCandidate[] {
    const pool = poolCharSet(poolChars);
    if (pool.size === 0) return [];

    const hits = findWordsInCiyu(target, 24);
    const out: WordCandidate[] = [];

    // 若知道目标字的课内学期，优先返回该学期及之前的词
    const rank = (grade: number, semester: string): number => {
        if (!targetSemester) return grade * 2 + (semester === "上" ? 0 : 1);
        const tgt =
            targetSemester.grade * 2 +
            (targetSemester.semester === "上" ? 0 : 1);
        const cur = grade * 2 + (semester === "上" ? 0 : 1);
        return cur <= tgt ? cur : 100 + cur; // 未学学期的词靠后
    };

    const scored = hits
        .map((h) => ({
            hit: h,
            v: validateWord(h.word, target, pool),
            r: rank(h.grade, h.semester),
        }))
        .filter((x) => x.hit.word !== target && x.v.ok)
        .sort((a, b) => a.r - b.r);

    for (const s of scored) {
        const cand = toCandidate(
            s.hit.word,
            s.v,
            `${semLabel(s.hit.grade, s.hit.semester)}·词语表`,
            "ciyu"
        );
        if (cand) out.push(cand);
        if (out.length >= 6) break;
    }
    return out;
}

/**
 * 课内字组合：从 jieba 词表取含目标字的常用词，
 * 要求词中其余字全部来自"学过的写字表字"（优先）或"学过的识字表字"。
 */
export function findComposedCandidates(
    target: string,
    poolChars: string,
    targetSemester?: { grade: number; semester: "上" | "下" } | null
): WordCandidate[] {
    const pool = poolCharSet(poolChars);
    if (pool.size === 0) return [];

    const sem = targetSemester || lookupCharSemester(target);
    if (!sem) return [];
    const { xiezi, shizi } = learnedChars(sem.grade, sem.semester);
    const xieziSet = new Set(xiezi);
    const shiziSet = new Set(shizi);

    const dictWords = findWordsInDict(target, 80);
    const out: WordCandidate[] = [];

    for (const word of dictWords) {
        if (word === target) continue;
        const v = validateWord(word, target, pool);
        if (!v.ok) continue;

        // 分类搭档字来源：全在写字表 → xiezi；否则全在识字表 → shizi
        const others = Array.from(word).filter(
            (_, i) => i < v.maskedAt || i >= v.maskedAt + Array.from(target).length
        );
        const inXiezi = others.every((c) => xieziSet.has(c));
        const inShizi = others.every((c) => shiziSet.has(c));
        if (!inXiezi && !inShizi) continue;

        const cand = toCandidate(
            word,
            v,
            `${semLabel(sem.grade, sem.semester)}·${inXiezi ? "写字表" : "识字表"}组词`,
            inXiezi ? "xiezi" : "shizi"
        );
        if (cand) out.push(cand);
        if (out.length >= 6) break;
    }
    return out;
}

/**
 * 完整课内链：词语表 → 课内字组合。返回空数组表示都没找到，交给 AI 兜底。
 */
export function findTextbookCandidates(
    target: string,
    poolChars: string
): WordCandidate[] {
    const sem = lookupCharSemester(target);
    const ciyu = findCiyuCandidates(target, poolChars, sem);
    if (ciyu.length > 0) return ciyu;
    return findComposedCandidates(target, poolChars, sem);
}
