import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-utils";
import { forbidden, internalError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { getDayRange } from "@/lib/date-time";
import type { Prisma } from "@prisma/client";

const logger = createLogger("api:ai:calls");

/**
 * 大模型调用明细：按时间倒序分页，可按天数/原因/渠道/结果筛选。
 */
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return forbidden("Authentication required");
    if (!requireAdmin(session)) return forbidden("Admin access required");

    try {
        const url = new URL(req.url);
        const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 90);
        const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
        const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize")) || 50, 10), 200);
        const reason = url.searchParams.get("reason") || undefined;
        const provider = url.searchParams.get("provider") || undefined;
        const outcome = url.searchParams.get("outcome"); // ok | error

        const where: Prisma.AiCallLogWhereInput = {
            createdAt: { gte: getDayRange(new Date(), undefined, -(days - 1)).start },
            ...(reason ? { reason } : {}),
            ...(provider ? { provider } : {}),
            ...(outcome === "error"
                ? { OR: [{ status: { gte: 400 } }, { status: null }] }
                : outcome === "ok"
                  ? { status: { lt: 400, not: null } }
                  : {}),
        };

        const [items, total] = await Promise.all([
            prisma.aiCallLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.aiCallLog.count({ where }),
        ]);

        return NextResponse.json({ items, total, page, pageSize });
    } catch (e) {
        logger.error({ err: e }, "查询 AI 调用明细失败");
        return internalError(e instanceof Error ? e.message : "查询 AI 调用明细失败");
    }
}
