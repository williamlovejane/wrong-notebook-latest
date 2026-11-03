/**
 * 备选字库与组词校验。
 *
 * 核心约束：考察语文生字时，组出的词语里除了待考生字之外，
 * 其余每个字都必须来自备选字库（学生已认识的字），
 * 这样考察才是"用认识的字去带不认识的字"。
 */

const HANZI_RE = /[\u4e00-\u9fa5]/;

/** 遮蔽占位符：考察时替换掉待考生字 */
export const MASK_CHAR = "○";

/**
 * 归一化字库输入：只保留汉字，去重，保持首次出现顺序。
 * 允许用户粘贴 "天地人你我他" 或 "天 地 人" 或带标点的句子。
 */
export function normalizePoolChars(input: string): string {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const ch of input) {
        if (!HANZI_RE.test(ch)) continue;
        if (seen.has(ch)) continue;
        seen.add(ch);
        result.push(ch);
    }

    return result.join("");
}

/** 字库字符串 -> 字符数组 */
export function poolCharsArray(chars: string): string[] {
    return Array.from(normalizePoolChars(chars));
}

/** 字库字符串 -> 集合，便于 O(1) 判断 */
export function poolCharSet(chars: string): Set<string> {
    return new Set(poolCharsArray(chars));
}

export interface WordValidation {
    ok: boolean;
    /** 被遮蔽字在词中的起始下标 */
    maskedAt: number;
    /** 词中不属于字库、也不属于目标字的字符，用于排查 */
    illegalChars: string[];
    reason?: string;
}

/**
 * 校验一个候选词能否用于考察。
 *
 * @param word       候选词，如 "花园"
 * @param target     待考内容，如 "园"（支持多字词语）
 * @param pool       备选字库字符集合
 * @param allowTargetInPool 目标字本身是否允许出现在字库里（通常允许）
 */
export function validateWord(
    word: string,
    target: string,
    pool: Set<string>,
    allowTargetInPool = true
): WordValidation {
    const cleanWord = word.trim();
    const cleanTarget = target.trim();

    if (!cleanWord) {
        return { ok: false, maskedAt: -1, illegalChars: [], reason: "空词" };
    }
    if (!cleanTarget) {
        return { ok: false, maskedAt: -1, illegalChars: [], reason: "空目标字" };
    }
    if (cleanWord.length < cleanTarget.length) {
        return { ok: false, maskedAt: -1, illegalChars: [], reason: "词短于目标字" };
    }

    const maskedAt = cleanWord.indexOf(cleanTarget);
    if (maskedAt < 0) {
        return {
            ok: false,
            maskedAt: -1,
            illegalChars: [],
            reason: `词中不含「${cleanTarget}」`,
        };
    }

    // 待考生字在词中只能出现一次：出现两次时，遮蔽只会盖住第一处
    // （如「茸」考「绿茸茸」会显示成「绿○茸」，第二处「茸」直接泄露答案）
    const occurrenceCount = cleanWord.split(cleanTarget).length - 1;
    if (occurrenceCount > 1) {
        return {
            ok: false,
            maskedAt,
            illegalChars: [],
            reason: `「${cleanTarget}」在词中出现 ${occurrenceCount} 次，遮蔽无法覆盖全部`,
        };
    }

    // 目标字占用的下标区间，其余字符都要在字库里
    const targetEnd = maskedAt + cleanTarget.length;
    const illegalChars: string[] = [];

    for (let i = 0; i < cleanWord.length; i++) {
        const ch = cleanWord[i];
        if (i >= maskedAt && i < targetEnd) {
            // 目标字本身
            if (!allowTargetInPool) continue;
            continue;
        }
        if (!pool.has(ch)) {
            illegalChars.push(ch);
        }
    }

    if (illegalChars.length > 0) {
        return {
            ok: false,
            maskedAt,
            illegalChars,
            reason: `「${illegalChars.join("")}」不在备选字库中`,
        };
    }

    return { ok: true, maskedAt, illegalChars: [] };
}

/** 把待考字替换为遮蔽符，其余字保留 */
export function maskWord(word: string, target: string): string {
    const idx = word.indexOf(target);
    if (idx < 0) return word;
    const before = word.slice(0, idx);
    const after = word.slice(idx + target.length);
    return `${before}${MASK_CHAR.repeat(target.length)}${after}`;
}

/** 词语拼音拆成音节数组，便于高亮被遮蔽字对应的音节 */
export function splitPinyin(pinyin: string): string[] {
    return pinyin
        .trim()
        .split(/[\s·]+/)
        .filter(Boolean);
}

/**
 * 渲染考察用的拼音：整词拼音全显示（这是提示），
 * 但把被遮蔽字对应的音节标记出来，前端可以加粗。
 */
export function buildPinyinDisplay(
    pinyin: string,
    maskedAt: number,
    targetLength: number
): { syllables: string[]; maskedFrom: number; maskedTo: number } {
    const syllables = splitPinyin(pinyin);
    return {
        syllables,
        maskedFrom: maskedAt,
        maskedTo: maskedAt + targetLength,
    };
}

/** 该字/词是否全为汉字（用于判断语文录入是否合法） */
export function isAllHanzi(text: string): boolean {
    const chars = Array.from(text.trim());
    return chars.length > 0 && chars.every((ch) => HANZI_RE.test(ch));
}
