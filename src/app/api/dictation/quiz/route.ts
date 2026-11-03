import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { buildChinesePrompt, PromptError } from "@/lib/dictation/prompt";
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
                entry: true,
            },
        });

        if (!card || card.userId !== user.id) return notFound("复习卡不存在");

        const entry = card.entry;
        let prompt: QuizPrompt;
        let promptWord: string;

        if (entry.kind === "chinese_char") {
            const built = await buildChinesePrompt(user, card, entry);
            prompt = built.prompt;
            promptWord = built.promptWord;
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
        if (error instanceof PromptError) return badRequest(error.message);
        logger.error({ error }, "出题失败");
        return internalError("Failed to generate quiz");
    }
}
