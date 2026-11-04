import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { isDictationKind } from "@/lib/dictation/types";
import { resolveDebugNow } from "@/lib/dictation/debug-time";
import { describeStage, isDue, overdueDays, REVIEW_INTERVALS, type CardStatus } from "@/lib/dictation/schedule";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:today");

/**
 * 今日待复习。
 * 默认不返回待考内容本身（那就是答案），只返回阶段与逾期信息；
 * 需要预览时带 reveal=1。
 */
export async function GET(req: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const url = new URL(req.url);
        const kindParam = url.searchParams.get("kind");
        const kind = isDictationKind(kindParam) ? kindParam : undefined;
        const reveal = url.searchParams.get("reveal") === "1";
        const includeFuture = url.searchParams.get("all") === "1";

        const cards = await prisma.reviewCard.findMany({
            where: {
                userId: user.id,
                status: { in: ["active", "mastered"] },
                ...(kind ? { entry: { kind } } : {}),
            },
            include: {
                entry: {
                    select: {
                        id: true,
                        kind: true,
                        text: true,
                        pinyin: true,
                        meaning: true,
                    },
                },
            },
            orderBy: [{ dueAt: "asc" }],
        });

        // 调试模式：admin 可用 debugNow 模拟任意一天的复习计划
        const now = resolveDebugNow(req, user.role) ?? new Date();
        const due = cards.filter((c) => isDue(c.dueAt, now));
        const list = includeFuture ? cards : due;

        const byKind: Record<string, number> = {
            chinese_char: 0,
            english_word: 0,
            english_sentence: 0,
        };
        for (const c of due) {
            byKind[c.entry.kind] = (byKind[c.entry.kind] ?? 0) + 1;
        }

        return NextResponse.json({
            totalDue: due.length,
            byKind,
            items: list.map((c) => ({
                cardId: c.id,
                entryId: c.entry.id,
                kind: c.entry.kind,
                stage: c.stage,
                status: c.status,
                dueAt: c.dueAt,
                overdueDays: overdueDays(c.dueAt, now),
                stageLabel: describeStage(c.stage, c.status as CardStatus).label,
                intervalDays: REVIEW_INTERVALS[Math.min(c.stage, REVIEW_INTERVALS.length - 1)],
                // 只有显式 reveal 才返回内容
                text: reveal ? c.entry.text : null,
                meaning: c.entry.kind === "english_word" ? c.entry.meaning : null,
                pinyin: reveal ? c.entry.pinyin : null,
            })),
        });
    } catch (error) {
        logger.error({ error }, "查询今日复习失败");
        return internalError("Failed to load today's reviews");
    }
}
