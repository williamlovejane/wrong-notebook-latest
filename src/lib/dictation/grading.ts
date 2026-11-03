/**
 * 复习判分的公共落库逻辑：算排程、更新复习卡、回写复习日志。
 * 键盘答题、手写答题、试卷判分共用，保证遗忘曲线行为一致。
 */
import { prisma } from "@/lib/prisma";
import { scheduleAfterReview, describeStage } from "./schedule";
import type { CardStatus } from "./schedule";

export interface ReviewOutcomeCard {
    id: string;
    stage: number;
    status: string;
    dueAt: Date;
    correctCount: number;
    wrongCount: number;
    stageLabel: string;
}

export interface ApplyReviewInput {
    cardId: string;
    logId: string;
    stage: number;
    correct: boolean;
    now: Date;
    /** 考察方式：typing | handwriting | paper_ai | paper_manual */
    mode: string;
    answerText?: string | null;
    strokeCorrect?: boolean | null;
}

export async function applyReviewResult(input: ApplyReviewInput): Promise<ReviewOutcomeCard> {
    const next = scheduleAfterReview(input.stage, input.correct, input.now);

    const [updatedCard] = await prisma.$transaction([
        prisma.reviewCard.update({
            where: { id: input.cardId },
            data: {
                stage: next.stage,
                status: next.status,
                dueAt: next.dueAt,
                correctCount: input.correct ? { increment: 1 } : undefined,
                wrongCount: input.correct ? undefined : { increment: 1 },
                lastReviewedAt: input.now,
            },
        }),
        prisma.reviewLog.update({
            where: { id: input.logId },
            data: {
                result: input.correct ? "correct" : "wrong",
                stageAfter: next.stage,
                mode: input.mode,
                answerText: input.answerText?.slice(0, 500),
                strokeCorrect: input.strokeCorrect ?? null,
            },
        }),
    ]);

    return {
        id: updatedCard.id,
        stage: updatedCard.stage,
        status: updatedCard.status,
        dueAt: updatedCard.dueAt,
        correctCount: updatedCard.correctCount,
        wrongCount: updatedCard.wrongCount,
        stageLabel: describeStage(updatedCard.stage, updatedCard.status as CardStatus).label,
    };
}
