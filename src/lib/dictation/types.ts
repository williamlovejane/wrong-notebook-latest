/** 默写复习的公共类型 */

export const DICTATION_KINDS = [
    "chinese_char",
    "english_word",
    "english_sentence",
] as const;

export type DictationKind = (typeof DICTATION_KINDS)[number];

export function isDictationKind(value: unknown): value is DictationKind {
    return (
        typeof value === "string" &&
        (DICTATION_KINDS as readonly string[]).includes(value)
    );
}

export const KIND_LABELS: Record<DictationKind, string> = {
    chinese_char: "语文生字",
    english_word: "英语单词",
    english_sentence: "英语句子",
};

/** 语文考察题面（答案不下发） */
export interface ChineseQuizPrompt {
    type: "chinese_word";
    cardId: string;
    entryId: string;
    /** 整词拼音，如 "huā yuán" */
    pinyin: string;
    /** 遮蔽后的词语，如 "花○" */
    maskedWord: string;
    /** 音节数组，与 maskedWord 字符大致对应 */
    syllables: string[];
    /** 被遮蔽起始位置 */
    maskedFrom: number;
    /** 被遮蔽长度 */
    maskedLength: number;
    /** 提示：本次考的是几个字 */
    targetLength: number;
    stage: number;
    /** 组词来源：ai 生成的词 / 降级为单字考察 */
    fallbackSingleChar?: boolean;
    hint?: string;
    /** 考察用词的出处标签，如 "二上·词语表" / "AI生成" */
    sourceLabel?: string;
}

/** 英语考察题面（文本用 base64 传给前端做 TTS，不直接明文下发） */
export interface EnglishQuizPrompt {
    type: "english_word" | "english_sentence";
    cardId: string;
    entryId: string;
    /** 中文释义 */
    meaning: string | null;
    /** 音标（可选） */
    phonetic: string | null;
    /** base64 编码的朗读文本，前端解码后交给 speechSynthesis */
    ttsPayload: string;
    /** 朗读语言 */
    ttsLang: "en-US";
    stage: number;
    /** 句子类考察时的词数提示 */
    wordCount?: number;
}

export type QuizPrompt = ChineseQuizPrompt | EnglishQuizPrompt;
