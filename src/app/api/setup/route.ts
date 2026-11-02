import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-utils";
import { getAppConfig, updateAppConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { forbidden, internalError, unauthorized } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:setup');

export const dynamic = 'force-dynamic';

/**
 * GET /api/setup
 * 安装向导状态：未完成向导且还没有任何错题本时需要进入向导，
 * 已在使用的旧实例（已有错题本）升级后不会被打扰
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorized("Authentication required");
    if (!requireAdmin(session)) return forbidden("Admin access required");

    try {
        const setupCompleted = !!getAppConfig().setupCompletedAt;
        const needsSetup = !setupCompleted && (await prisma.subject.count()) === 0;
        return NextResponse.json({ setupCompleted, needsSetup });
    } catch (error) {
        logger.error({ error }, 'Failed to get setup status');
        return internalError("Failed to get setup status");
    }
}

/**
 * POST /api/setup
 * 完成或跳过安装向导，之后不再自动进入
 */
export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorized("Authentication required");
    if (!requireAdmin(session)) return forbidden("Admin access required");

    try {
        const setupCompletedAt = new Date().toISOString();
        updateAppConfig({ setupCompletedAt });
        logger.info({ userId: session.user.id }, 'Setup wizard completed');
        return NextResponse.json({ setupCompleted: true, setupCompletedAt });
    } catch (error) {
        logger.error({ error }, 'Failed to complete setup');
        return internalError("Failed to complete setup");
    }
}
