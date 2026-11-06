import "server-only";

import { prisma } from "@/lib/prisma";
import { AWAITING_REVIEW } from "./handwriting-types";

/**
 * 已交卷、还在等人工判卷的字对应的复习卡 id。
 *
 * 交卷时只保存笔迹，复习卡的 dueAt 要等人工判对 / 判错才推进，因此这些字在
 * 判卷前依然「到期」。若继续按到期时间出题，同一个字会被一遍遍默写。
 * 出题入口（今日待复习、手写默写、打印试卷）都要先剔除这批卡。
 *
 * 只认「待判卷」批次里尚未人工判定的题：历史自动判卷已完成（completed）的批次
 * 早已结算过复习计划，不能因为它们没人工判定过就把字永久挡在复习之外。
 */
export async function findAwaitingReviewCardIds(userId: string): Promise<Set<string>> {
    const rows = await prisma.dictationSubmissionItem.findMany({
        where: {
            submission: {
                userId,
                status: { in: [AWAITING_REVIEW, "pending", "grading", "failed"] },
            },
            // 与「今日提交」待判清单一致：null / 旧版 ai、local 等都算未人工判定
            OR: [{ judgedBy: null }, { judgedBy: { not: "manual" } }],
        },
        select: { cardId: true },
        distinct: ["cardId"],
    });
    return new Set(rows.map((row) => row.cardId));
}
