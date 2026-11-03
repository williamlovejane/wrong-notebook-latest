import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { checkAnswer, diffSentence } from "@/lib/dictation/answer";
import { applyReviewResult } from "@/lib/dictation/grading";
import { resolveDebugNow } from "@/lib/dictation/debug-time";
import type { DictationKind } from "@/lib/dictation/types";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:answer");

export async function POST(req: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const body = await req.json();
        const quizToken = typeof body?.quizToken === "string" ? body.quizToken : "";
        const answer = typeof body?.answer === "string" ? body.answer : "";

        if (!quizToken) return badRequest("缺少 quizToken");

        const log = await prisma.reviewLog.findUnique({
            where: { id: quizToken },
            include: {
                card: {
                    include: { entry: { select: { kind: true, text: true, pinyin: true } } },
                },
            },
        });

        if (!log) return notFound("题目不存在或已过期");
        if (log.card.userId !== user.id) return notFound("题目不存在或已过期");
        if (log.result !== "pending") return badRequest("这道题已经判过分了");

        const card = log.card;
        const kind = card.entry.kind as DictationKind;
        const expected = card.entry.text;

        const result = checkAnswer(kind, expected, answer);
        // 调试模式下用模拟时间排程，让"任意一天"的复习闭环可测
        const now = resolveDebugNow(req, user.role) ?? new Date();

        const updated = await applyReviewResult({
            cardId: card.id,
            logId: log.id,
            stage: card.stage,
            correct: result.correct,
            now,
            mode: "typing",
            answerText: answer,
        });

        return NextResponse.json({
            correct: result.correct,
            expected,
            pinyin: card.entry.pinyin,
            promptWord: log.promptWord,
            answerText: answer,
            diff:
                kind === "english_sentence"
                    ? diffSentence(expected, answer)
                    : undefined,
            card: {
                id: updated.id,
                stage: updated.stage,
                status: updated.status,
                dueAt: updated.dueAt,
                correctCount: updated.correctCount,
                wrongCount: updated.wrongCount,
                stageLabel: updated.stageLabel,
            },
            logId: log.id,
        });
    } catch (error) {
        logger.error({ error }, "判分失败");
        return internalError("Failed to check answer");
    }
}
