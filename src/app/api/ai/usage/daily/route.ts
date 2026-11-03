import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-utils";
import { forbidden, internalError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { formatDateTime, getDayRange } from "@/lib/date-time";

const logger = createLogger("api:ai:usage");

/**
 * 大模型用量报表：每日 token 消耗与请求次数、按调用原因汇总、总计。
 * 天数为查询范围（含今天），数据在内存里按应用时区的日历日聚合。
 */
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return forbidden("Authentication required");
    if (!requireAdmin(session)) return forbidden("Admin access required");

    try {
        const url = new URL(req.url);
        const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 14, 1), 90);

        const range = getDayRange(new Date(), undefined, -(days - 1));
        const logs = await prisma.aiCallLog.findMany({
            where: { createdAt: { gte: range.start } },
            select: {
                createdAt: true,
                reason: true,
                status: true,
                inputTokens: true,
                outputTokens: true,
                cachedTokens: true,
            },
        });

        interface Stat {
            calls: number;
            errors: number;
            inputTokens: number;
            outputTokens: number;
            cachedTokens: number;
        }
        interface DayStat extends Stat {
            date: string;
        }
        interface ReasonStat extends Stat {
            reason: string;
        }

        const dayMap = new Map<string, DayStat>();
        const reasonMap = new Map<string, ReasonStat>();
        const summary: Stat = { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0 };

        const bump = (stat: Stat, log: (typeof logs)[number]) => {
            stat.calls += 1;
            if (log.status === null || log.status >= 400) stat.errors += 1;
            stat.inputTokens += log.inputTokens ?? 0;
            stat.outputTokens += log.outputTokens ?? 0;
            stat.cachedTokens += log.cachedTokens ?? 0;
        };

        for (const log of logs) {
            const date = formatDateTime(log.createdAt, "yyyy-MM-dd");
            let day = dayMap.get(date);
            if (!day) {
                day = { date, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
                dayMap.set(date, day);
            }
            bump(day, log);

            const reason = log.reason ?? "unknown";
            let rs = reasonMap.get(reason);
            if (!rs) {
                rs = { reason, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
                reasonMap.set(reason, rs);
            }
            bump(rs, log);

            bump(summary, log);
        }

        // 补齐没有调用的日期，图表连续
        const daily: DayStat[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = getDayRange(new Date(), undefined, -i).start;
            const date = formatDateTime(d, "yyyy-MM-dd");
            daily.push(dayMap.get(date) ?? { date, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0 });
        }

        const byReason = Array.from(reasonMap.values()).sort((a, b) => b.calls - a.calls);

        return NextResponse.json({ days: daily, byReason, summary });
    } catch (e) {
        logger.error({ err: e }, "查询 AI 用量报表失败");
        return internalError(e instanceof Error ? e.message : "查询 AI 用量报表失败");
    }
}
