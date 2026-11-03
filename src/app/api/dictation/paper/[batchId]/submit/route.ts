import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { applyReviewResult } from "@/lib/dictation/grading";
import { resolveDebugNow } from "@/lib/dictation/debug-time";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:paper:submit");

const PAPER_MODES = new Set(["paper_ai", "paper_manual"]);

/** 试卷批量判分提交：逐题写复习卡与日志，接入遗忘曲线 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ batchId: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");
    const { batchId } = await params;

    try {
        const body = await req.json();
        const mode = typeof body?.mode === "string" && PAPER_MODES.has(body.mode) ? body.mode : null;
        if (!mode) return badRequest("缺少判分方式");
        if (!Array.isArray(body?.results) || body.results.length === 0) {
            return badRequest("缺少判分结果");
        }

        const logs = await prisma.reviewLog.findMany({
            where: { batchId, card: { userId: user.id } },
            include: { card: { select: { id: true, stage: true, entry: { select: { text: true } } } } },
        });
        if (logs.length === 0) return notFound("试卷不存在");

        const byLogId = new Map(logs.map((l) => [l.id, l]));
        const now = resolveDebugNow(req, user.role) ?? new Date();

        const graded: { logId: string; cardId: string; correct: boolean; dueAt: Date; stageLabel: string }[] = [];
        const invalid: string[] = [];

        for (const raw of body.results) {
            const logId = typeof raw?.logId === "string" ? raw.logId : "";
            const correct = raw?.correct;
            if (typeof correct !== "boolean") {
                invalid.push(logId);
                continue;
            }
            const log = byLogId.get(logId);
            if (!log || log.result !== "pending") {
                invalid.push(logId);
                continue;
            }
            const recognized = typeof raw?.recognized === "string" ? raw.recognized : null;
            const updated = await applyReviewResult({
                cardId: log.card.id,
                logId: log.id,
                stage: log.card.stage,
                correct,
                now,
                mode,
                answerText: recognized ?? log.card.entry.text,
            });
            graded.push({
                logId: log.id,
                cardId: log.card.id,
                correct,
                dueAt: updated.dueAt,
                stageLabel: updated.stageLabel,
            });
        }

        if (graded.length === 0) return badRequest("没有可判分的题目（可能已判过分）");

        return NextResponse.json({
            gradedCount: graded.length,
            correctCount: graded.filter((g) => g.correct).length,
            wrongCount: graded.filter((g) => !g.correct).length,
            invalidCount: invalid.length,
            items: graded,
        });
    } catch (error) {
        logger.error({ error }, "试卷判分提交失败");
        return internalError("Failed to submit paper grading");
    }
}
