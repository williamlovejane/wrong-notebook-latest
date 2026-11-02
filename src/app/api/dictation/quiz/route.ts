import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { generateWordCandidates, WordGenError } from "@/lib/ai/word-gen";
import { findTextbookCandidates, type WordCandidate } from "@/lib/dictation/word-source";
import { lookupCharSemester } from "@/lib/yuwen/db";
import {
    maskWord,
    validateWord,
    poolCharSet,
    splitPinyin,
} from "@/lib/dictation/pool";
import type { QuizPrompt } from "@/lib/dictation/types";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:quiz");

/** 把答案文本编码后交给前端做 TTS，避免在响应里明文出现答案 */
function encodeTts(text: string): string {
    return Buffer.from(text, "utf-8").toString("base64");
}

export async function POST(req: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const body = await req.json();
        const cardId = typeof body?.cardId === "string" ? body.cardId : "";
        if (!cardId) return badRequest("缺少 cardId");

        const card = await prisma.reviewCard.findUnique({
            where: { id: cardId },
            include: {
                entry: {
                    include: { pool: true },
                },
            },
        });

        if (!card || card.userId !== user.id) return notFound("复习卡不存在");

        const entry = card.entry;
        let prompt: QuizPrompt;
        let promptWord: string;

        if (entry.kind === "chinese_char") {
            const poolChars = entry.pool?.chars ?? "";
            const poolSet = poolCharSet(poolChars);

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
                if (!poolChars || !validateWord(c.word, entry.text, poolSet).ok) {
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
            if (!chosen && poolChars) {
                try {
                    const candidates = findTextbookCandidates(entry.text, poolChars);
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
                if (!poolChars) {
                    fallbackHint = "未绑定备选字库或字库为空，已降级为单字考察";
                } else {
                    try {
                        const targetSemester = lookupCharSemester(entry.text);
                        const candidates = await generateWordCandidates({
                            target: entry.text,
                            poolChars,
                            count: 6,
                            gradeSemester: targetSemester
                                ? `${targetSemester.grade}年级${targetSemester.semester}册`
                                : null,
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
                prompt = {
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
                };
                promptWord = chosen.word;
            } else {
                // 3) 降级：直接考这个字本身，用已录入的拼音做提示
                if (!entry.pinyin) {
                    return badRequest(
                        fallbackHint
                            ? `${fallbackHint}，但该生字没有拼音，请先补充拼音或配置 AI`
                            : "无法生成题目：请补充生字拼音或配置 AI 组词"
                    );
                }

                const syllables = splitPinyin(entry.pinyin);
                prompt = {
                    type: "chinese_word",
                    cardId: card.id,
                    entryId: entry.id,
                    pinyin: entry.pinyin,
                    maskedWord: "○".repeat(targetLength),
                    syllables:
                        syllables.length === targetLength ? syllables : [],
                    maskedFrom: 0,
                    maskedLength: targetLength,
                    targetLength,
                    stage: card.stage,
                    fallbackSingleChar: true,
                    hint: fallbackHint,
                };
                promptWord = entry.text;
            }
        } else {
            // 英语：朗读 → 默写
            prompt = {
                type: entry.kind === "english_word" ? "english_word" : "english_sentence",
                cardId: card.id,
                entryId: entry.id,
                meaning: entry.meaning,
                phonetic: entry.pinyin,
                ttsPayload: encodeTts(entry.text),
                ttsLang: "en-US",
                stage: card.stage,
                wordCount:
                    entry.kind === "english_sentence"
                        ? entry.text.split(/\s+/).filter(Boolean).length
                        : undefined,
            };
            promptWord = entry.text;
        }

        // 建一条待判分记录，判分只认这个 token
        const log = await prisma.reviewLog.create({
            data: {
                cardId: card.id,
                result: "pending",
                stageBefore: card.stage,
                stageAfter: card.stage,
                promptWord,
            },
        });

        return NextResponse.json({ prompt, quizToken: log.id });
    } catch (error) {
        logger.error({ error }, "出题失败");
        return internalError("Failed to generate quiz");
    }
}
