import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { internalError, unauthorized } from "@/lib/api-errors";
import { authOptions } from "@/lib/auth";
import { getAppTimeZone } from "@/lib/config";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/lib/constants/pagination";
import { createLogger } from "@/lib/logger";
import { getMasteryThreshold } from "@/lib/mastery";
import { PRACTICE_RECORD_COUNT, masteryStatusOf } from "@/lib/mastery-status";
import { prisma } from "@/lib/prisma";
import { getReviewPlan, isReviewDue } from "@/lib/review-schedule";

const logger = createLogger('api:review:due');

/** 今日待复习：按作答历史推算到期的错题，最早到期的排在前面 */
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return unauthorized();
    }

    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get("subjectId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));

    try {
        const timeZone = getAppTimeZone();
        const now = new Date();
        // 先只取计算计划所需的字段，到期的再查询完整内容
        const candidates = await prisma.errorItem.findMany({
            where: { userId: session.user.id, ...(subjectId ? { subjectId } : {}) },
            select: {
                id: true,
                createdAt: true,
                practiceRecords: { where: { result: { not: null } }, select: { result: true, createdAt: true } },
            },
        });

        const masteryThreshold = await getMasteryThreshold(session.user.id);
        const due = candidates
            .map((item) => ({ id: item.id, plan: getReviewPlan(item.createdAt, item.practiceRecords, timeZone) }))
            .filter(({ plan }) => isReviewDue(plan, timeZone, now))
            .sort((a, b) => a.plan.nextReviewAt!.getTime() - b.plan.nextReviewAt!.getTime());

        const pageEntries = due.slice((page - 1) * pageSize, page * pageSize);
        const items = await prisma.errorItem.findMany({
            where: { id: { in: pageEntries.map(({ id }) => id) } },
            include: {
                subject: true,
                tags: true,
                _count: PRACTICE_RECORD_COUNT,
            },
        });
        const itemById = new Map(items.map((item) => [item.id, item]));

        return NextResponse.json({
            items: pageEntries.flatMap(({ id, plan }) => {
                const found = itemById.get(id);
                if (!found) return [];
                const { _count, ...item } = found;
                return [{
                    ...item,
                    masteryStatus: masteryStatusOf(_count.practiceRecords, item.masteryProbability, masteryThreshold),
                    reviewStage: plan.stage,
                    nextReviewAt: plan.nextReviewAt,
                }];
            }),
            total: due.length,
            page,
            pageSize,
            totalPages: Math.ceil(due.length / pageSize),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to list due reviews');
        return internalError("Failed to list due reviews");
    }
}
