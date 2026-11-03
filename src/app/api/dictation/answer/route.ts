import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { checkAnswer, diffSentence } from "@/lib/dictation/answer";
import { scheduleAfterReview, describeStage } from "@/lib/dictation/schedule";
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
        const next = scheduleAfterReview(card.stage, result.correct, now);

        const [updatedCard, updatedLog] = await prisma.$transaction([
            prisma.reviewCard.update({
                where: { id: card.id },
                data: {
                    stage: next.stage,
                    status: next.status,
                    dueAt: next.dueAt,
                    correctCount: result.correct ? { increment: 1 } : undefined,
                    wrongCount: result.correct ? undefined : { increment: 1 },
                    lastReviewedAt: now,
                },
            }),
            prisma.reviewLog.update({
                where: { id: log.id },
                data: {
                    result: result.correct ? "correct" : "wrong",
                    stageAfter: next.stage,
                    answerText: answer.slice(0, 500),
                },
            }),
        ]);

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
                id: updatedCard.id,
                stage: updatedCard.stage,
                status: updatedCard.status,
                dueAt: updatedCard.dueAt,
                correctCount: updatedCard.correctCount,
                wrongCount: updatedCard.wrongCount,
                stageLabel: describeStage(updatedCard.stage, updatedCard.status as any).label,
            },
            logId: updatedLog.id,
        });
    } catch (error) {
        logger.error({ error }, "判分失败");
        return internalError("Failed to check answer");
    }
}
