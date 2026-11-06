import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-message";
import { scheduleAfterReview } from "@/lib/dictation/schedule";
import { resumeIfStalled } from "@/lib/dictation/submission-processor";
import { AWAITING_REVIEW } from "@/lib/dictation/handwriting-types";

const logger = createLogger("api:dictation:submissions:detail");

const reviewSchema = z.object({
    itemId: z.string().min(1).max(100),
    correct: z.boolean(),
});

interface RouteContext {
    params: Promise<{ id: string }>;
}

/** 提交详情：逐字书写轨迹与动图；顺带把旧版本残留的判分中状态归一为待人工审核。
 *  brief=1 只返回状态与统计，供旧详情页轮询使用。 */
export async function GET(req: Request, { params }: RouteContext) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");
    const { id } = await params;

    const owned = await prisma.dictationSubmission.findUnique({
        where: { id },
        select: { userId: true },
    });
    if (!owned || owned.userId !== user.id) return notFound("提交记录不存在");

    try {
        await resumeIfStalled(id);
    } catch (error) {
        logger.warn({ submissionId: id, error: getErrorMessage(error) }, "归一历史提交状态失败");
    }

    const brief = new URL(req.url).searchParams.get("brief") === "1";
    if (brief) {
        const row = await prisma.dictationSubmission.findUnique({
            where: { id },
            select: {
                id: true,
                status: true,
                totalCount: true,
                skippedCount: true,
                gradedCount: true,
                correctCount: true,
                judgedBy: true,
                error: true,
                finishedAt: true,
            },
        });
        return NextResponse.json({ submission: row });
    }

    const submission = await prisma.dictationSubmission.findUnique({
        where: { id },
        select: {
            id: true,
            userId: true,
            status: true,
            mode: true,
            totalCount: true,
            skippedCount: true,
            gradedCount: true,
            correctCount: true,
            judgedBy: true,
            error: true,
            gradingNow: true,
            heartbeatAt: true,
            createdAt: true,
            finishedAt: true,
            items: { orderBy: [{ position: "asc" }] },
        },
    });
    return NextResponse.json({ submission });
}

/**
 * 人工判卷：对单个字（题目）判对 / 判错，并同步结算复习计划。
 *
 * 自动判卷停用后，这里是唯一的判定入口，因此要同时处理两种情况：
 * - 首次判定：ReviewLog 仍是 pending，按首次复习结算计数与排程；
 * - 改判：ReviewLog 已有结果，用新旧差值修正 correctCount / wrongCount，避免重复累加。
 * 排程始终基于出题时记录的 stageBefore 重算，重复点击同一个结论不会把阶段越推越远。
 */
export async function PATCH(req: Request, { params }: RouteContext) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");
    const { id } = await params;

    let body: z.infer<typeof reviewSchema>;
    try {
        body = reviewSchema.parse(await req.json());
    } catch {
        return badRequest("复核数据格式不正确");
    }

    try {
        const submission = await prisma.dictationSubmission.findUnique({
            where: { id },
            select: { userId: true, gradingNow: true },
        });
        if (!submission || submission.userId !== user.id) return notFound("提交记录不存在");

        const item = await prisma.dictationSubmissionItem.findUnique({
            where: { id: body.itemId },
            select: {
                id: true,
                submissionId: true,
                logId: true,
                recognized: true,
            },
        });
        if (!item || item.submissionId !== id) return notFound("该字不在本次提交中");

        // 调试模式下沿用交卷时的模拟时间，避免人工判卷把复习计划排到真实今天
        const reviewNow = submission.gradingNow ?? new Date();

        await prisma.$transaction(async (tx) => {
            await tx.dictationSubmissionItem.update({
                where: { id: item.id },
                data: {
                    correct: body.correct,
                    manualCorrect: body.correct,
                    judgedBy: "manual",
                    confidence: "high",
                    gradedAt: reviewNow,
                },
            });

            const log = await tx.reviewLog.findUnique({
                where: { id: item.logId },
                include: { card: true },
            });
            if (log) {
                const wasPending = log.result === "pending";
                const oldCorrect = log.result === "correct";
                const newCorrectCount = body.correct ? 1 : 0;
                const newWrongCount = body.correct ? 0 : 1;
                // 首次判定直接累加；改判时用新旧差值修正，重复点同一结论不会重复计数
                const correctDelta = newCorrectCount - (wasPending ? 0 : oldCorrect ? 1 : 0);
                const wrongDelta = newWrongCount - (wasPending ? 0 : oldCorrect ? 0 : 1);
                const next = scheduleAfterReview(log.stageBefore, body.correct, reviewNow);
                await tx.reviewCard.update({
                    where: { id: log.cardId },
                    data: {
                        stage: next.stage,
                        status: next.status,
                        dueAt: next.dueAt,
                        correctCount: { increment: correctDelta },
                        wrongCount: { increment: wrongDelta },
                        lastReviewedAt: reviewNow,
                    },
                });
                await tx.reviewLog.update({
                    where: { id: log.id },
                    data: {
                        result: body.correct ? "correct" : "wrong",
                        stageAfter: next.stage,
                        mode: "handwriting",
                        // 历史自动判卷留下的识别字保留；纯人工判卷没有 OCR 结果，不编造
                        answerText: item.recognized ?? undefined,
                    },
                });
            }

            // 按「已人工判定」重算批次进度，避免并发审核时计数器漂移
            const all = await tx.dictationSubmissionItem.findMany({
                where: { submissionId: id },
                select: { judgedBy: true, manualCorrect: true, correct: true },
            });
            const judged = all.filter((row) => row.judgedBy === "manual");
            const correctCount = judged.filter((row) => (row.manualCorrect ?? row.correct) === true).length;
            const allDone = all.length > 0 && judged.length === all.length;
            await tx.dictationSubmission.update({
                where: { id },
                data: {
                    gradedCount: judged.length,
                    correctCount,
                    judgedBy: judged.length > 0 ? "manual" : null,
                    status: allDone ? "completed" : AWAITING_REVIEW,
                    finishedAt: allDone ? reviewNow : null,
                },
            });
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        logger.error({ error: getErrorMessage(error) }, "人工判卷失败");
        return internalError("Failed to review submission");
    }
}
