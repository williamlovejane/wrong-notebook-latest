import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { unauthorized, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:paper:detail");

interface PaperPromptSnapshot {
    pinyin: string;
    maskedWord: string;
    syllables: string[];
    maskedFrom: number;
    maskedLength: number;
    fallbackSingleChar?: boolean;
    hint?: string;
    sourceLabel?: string;
    promptWord: string;
    expected: string;
}

/** 按 batchId 拉取试卷（含每题判分状态），判分页刷新恢复用 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ batchId: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");
    const { batchId } = await params;

    try {
        const logs = await prisma.reviewLog.findMany({
            where: { batchId, card: { userId: user.id } },
            include: {
                card: {
                    select: {
                        id: true,
                        entry: { select: { text: true, pinyin: true } },
                    },
                },
            },
            orderBy: [{ reviewedAt: "asc" }, { id: "asc" }],
        });

        if (logs.length === 0) return notFound("试卷不存在");

        const items = logs.map((log) => {
            let snapshot: PaperPromptSnapshot | null = null;
            try {
                snapshot = log.promptJson ? (JSON.parse(log.promptJson) as PaperPromptSnapshot) : null;
            } catch {
                snapshot = null;
            }
            return {
                logId: log.id,
                cardId: log.card.id,
                expected: snapshot?.expected ?? log.card.entry.text,
                pinyin: snapshot?.pinyin ?? log.card.entry.pinyin ?? "",
                maskedWord: snapshot?.maskedWord ?? "○",
                syllables: snapshot?.syllables ?? [],
                maskedFrom: snapshot?.maskedFrom ?? 0,
                maskedLength: snapshot?.maskedLength ?? 1,
                promptWord: snapshot?.promptWord ?? log.promptWord ?? "",
                sourceLabel: snapshot?.sourceLabel,
                status: log.result, // pending | correct | wrong
                mode: log.mode,
                strokeCorrect: log.strokeCorrect,
                answerText: log.answerText,
            };
        });

        return NextResponse.json({
            paperId: batchId,
            items,
            pendingCount: items.filter((i) => i.status === "pending").length,
        });
    } catch (error) {
        logger.error({ error }, "拉取试卷失败");
        return internalError("Failed to load paper");
    }
}
