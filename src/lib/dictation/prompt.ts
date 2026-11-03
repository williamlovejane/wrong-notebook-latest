/**
 * 语文生字考察题面生成：课本组词链 → 缓存 → AI 组词 → 单字降级。
 * 在线答题与纸质出卷共用，保证两种考察方式的题面一致。
 */
import { prisma } from "@/lib/prisma";
import { generateWordCandidates, WordGenError } from "@/lib/ai/word-gen";
import { findTextbookCandidates } from "./word-source";
import { isTextbookAvailable, currentSemesterFromProfile, learnedCharSets, lookupCharSemester } from "@/lib/yuwen/db";
import { maskWord, validateWord, splitPinyin } from "./pool";
import type { ChineseQuizPrompt } from "./types";
import { createLogger } from "@/lib/logger";

const logger = createLogger("dictation:prompt");

/** 题面生成失败（调用方转 badRequest） */
export class PromptError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PromptError";
    }
}

export interface PromptUser {
    educationStage?: string | null;
    enrollmentYear?: number | null;
}

export interface PromptEntry {
    id: string;
    kind: string;
    text: string;
    pinyin: string | null;
}

export interface PromptCard {
    id: string;
    stage: number;
}

/** 为一张语文生字复习卡生成题面（含组词缓存写入等副作用） */
export async function buildChinesePrompt(
    user: PromptUser,
    card: PromptCard,
    entry: PromptEntry
): Promise<{ prompt: ChineseQuizPrompt; promptWord: string }> {
    // 学过的字直接由课本权威库推导：截至"注册信息推算出的当前学期"
    const textbookOk = isTextbookAvailable();
    const cur = currentSemesterFromProfile(user.educationStage ?? null, user.enrollmentYear ?? null);
    const learned = learnedCharSets(cur.grade, cur.semester);
    const hasLearned = textbookOk && learned.all.size > 0;

    // 1) 优先用缓存词；若缓存词已不符合当前字库则丢弃
    let chosen: {
        word: string;
        pinyin: string | null;
        maskedAt: number;
        sourceLabel: string | null;
    } | null = null;
    const cached = await prisma.dictationWord.findMany({
        where: { entryId: entry.id },
        orderBy: [{ usedCount: "asc" }, { createdAt: "asc" }],
    });

    for (const c of cached) {
        if (!hasLearned || !validateWord(c.word, entry.text, learned.all).ok) {
            await prisma.dictationWord.delete({ where: { id: c.id } }).catch(() => {});
            continue;
        }
        chosen = {
            word: c.word,
            pinyin: c.pinyin,
            maskedAt: c.maskedAt,
            sourceLabel: c.sourceLabel,
        };
        await prisma.dictationWord.update({
            where: { id: c.id },
            data: { usedCount: { increment: 1 } },
        });
        break;
    }

    // 2) 缓存没有 → 课内组词链：教材词语表 → 课内字组合（jieba 词表验证）
    let fallbackHint: string | undefined;
    if (!chosen && hasLearned) {
        try {
            const candidates = findTextbookCandidates(entry.text, learned);
            for (const cand of candidates) {
                await prisma.dictationWord
                    .create({
                        data: {
                            entryId: entry.id,
                            word: cand.word,
                            pinyin: cand.pinyin || null,
                            maskedAt: cand.maskedAt,
                            source: cand.source,
                            sourceLabel: cand.sourceLabel,
                            usedCount: 0,
                        },
                    })
                    .catch(() => {});
            }
            // 首次抽取随机一个，后续走缓存按 usedCount 轮换
            if (candidates.length > 0) {
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                const stored = await prisma.dictationWord.findFirst({
                    where: { entryId: entry.id, word: pick.word },
                });
                if (stored) {
                    chosen = {
                        word: stored.word,
                        pinyin: stored.pinyin,
                        maskedAt: stored.maskedAt,
                        sourceLabel: stored.sourceLabel,
                    };
                    await prisma.dictationWord.update({
                        where: { id: stored.id },
                        data: { usedCount: { increment: 1 } },
                    });
                }
            }
        } catch (error) {
            logger.warn({ error }, "课内组词链失败，降级 AI 组词");
        }
    }

    // 3) 课内链也没找到 → AI 现场组词
    if (!chosen) {
        if (!hasLearned) {
            fallbackHint = textbookOk
                ? "课本字词库中无可用生字，已降级为单字考察"
                : "课内字词库不可用，已降级为单字考察";
        } else {
            try {
                const targetSemester = lookupCharSemester(entry.text);
                const candidates = await generateWordCandidates({
                    target: entry.text,
                    poolChars: learned.poolString,
                    count: 6,
                    gradeSemester: targetSemester
                        ? `${targetSemester.grade}年级${targetSemester.semester}册`
                        : `${cur.grade}年级${cur.semester}册`,
                });

                for (const cand of candidates) {
                    await prisma.dictationWord
                        .create({
                            data: {
                                entryId: entry.id,
                                word: cand.word,
                                pinyin: cand.pinyin || null,
                                maskedAt: cand.maskedAt,
                                source: "ai",
                                sourceLabel: "AI生成",
                                usedCount: 0,
                            },
                        })
                        .catch(() => {});
                }

                const first = candidates[0];
                const stored = await prisma.dictationWord.findFirst({
                    where: { entryId: entry.id, word: first.word },
                });
                if (stored) {
                    chosen = {
                        word: stored.word,
                        pinyin: stored.pinyin,
                        maskedAt: stored.maskedAt,
                        sourceLabel: stored.sourceLabel,
                    };
                    await prisma.dictationWord.update({
                        where: { id: stored.id },
                        data: { usedCount: { increment: 1 } },
                    });
                }
            } catch (error) {
                if (error instanceof WordGenError) {
                    fallbackHint =
                        error.code === "AI_NOT_CONFIGURED"
                            ? "AI 未配置，已降级为单字考察"
                            : `${error.message}，已降级为单字考察`;
                    logger.info({ code: error.code }, "组词失败，降级单字考察");
                } else {
                    throw error;
                }
            }
        }
    }

    const targetLength = Array.from(entry.text).length;

    if (chosen) {
        const syllables = splitPinyin(chosen.pinyin || "");
        return {
            prompt: {
                type: "chinese_word",
                cardId: card.id,
                entryId: entry.id,
                pinyin: chosen.pinyin || "",
                maskedWord: maskWord(chosen.word, entry.text),
                syllables: syllables.length === Array.from(chosen.word).length ? syllables : [],
                maskedFrom: chosen.maskedAt,
                maskedLength: targetLength,
                targetLength,
                stage: card.stage,
                sourceLabel: chosen.sourceLabel ?? undefined,
            },
            promptWord: chosen.word,
        };
    }

    // 降级：直接考这个字本身，用已录入的拼音做提示
    if (!entry.pinyin) {
        throw new PromptError(
            fallbackHint
                ? `${fallbackHint}，但该生字没有拼音，请先补充拼音或配置 AI`
                : "无法生成题目：请补充生字拼音或配置 AI 组词"
        );
    }

    const syllables = splitPinyin(entry.pinyin);
    return {
        prompt: {
            type: "chinese_word",
            cardId: card.id,
            entryId: entry.id,
            pinyin: entry.pinyin,
            maskedWord: "○".repeat(targetLength),
            syllables: syllables.length === targetLength ? syllables : [],
            maskedFrom: 0,
            maskedLength: targetLength,
            targetLength,
            stage: card.stage,
            fallbackSingleChar: true,
            hint: fallbackHint,
        },
        promptWord: entry.text,
    };
}
