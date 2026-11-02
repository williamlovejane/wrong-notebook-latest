import type { DictationKind } from "./types";

const HANZI_ONLY = /[^\u4e00-\u9fa5]/g;
const PUNCT = /[.,;:!?"'`。，；：！？、"'（）()《》]/g;

/** 语文作答归一化：只保留汉字，忽略空格与标点 */
export function normalizeChinese(text: string): string {
    return (text || "").replace(HANZI_ONLY, "");
}

/** 英语作答归一化：小写、去标点、压缩空白 */
export function normalizeEnglish(text: string): string {
    return (text || "")
        .toLowerCase()
        .replace(PUNCT, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function normalizeAnswer(kind: DictationKind, text: string): string {
    if (kind === "chinese_char") return normalizeChinese(text);
    return normalizeEnglish(text);
}

export interface AnswerCheck {
    correct: boolean;
    expected: string;
    normalizedActual: string;
}

/**
 * 服务端判分。答案不下发前端，只能在这里比对。
 */
export function checkAnswer(
    kind: DictationKind,
    expected: string,
    actual: string
): AnswerCheck {
    const normalizedExpected = normalizeAnswer(kind, expected);
    const normalizedActual = normalizeAnswer(kind, actual);

    return {
        correct:
            normalizedActual.length > 0 && normalizedActual === normalizedExpected,
        expected: normalizedExpected,
        normalizedActual,
    };
}

/**
 * 英语句子逐词对比，返回错词位置，用于给用户更细的反馈。
 */
export function diffSentence(
    expected: string,
    actual: string
): { word: string; correct: boolean }[] {
    const exp = normalizeEnglish(expected).split(" ").filter(Boolean);
    const act = normalizeEnglish(actual).split(" ").filter(Boolean);

    return exp.map((word, i) => ({
        word,
        correct: act[i] === word,
    }));
}
