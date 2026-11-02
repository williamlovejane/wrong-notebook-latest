import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { forbidden, internalError, unauthorized } from "@/lib/api-errors";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-utils";
import { createLogger } from "@/lib/logger";
import { pollLogin, startLogin } from "@/lib/minimax-code/auth";

const logger = createLogger('api:minimax-code:login');

export const dynamic = 'force-dynamic';

/** POST /api/minimax-code/login：发起网页登录（OAuth 设备码），返回授权地址（仅管理员） */
export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorized();
    if (!requireAdmin(session)) return forbidden("Admin access required");

    try {
        return NextResponse.json(await startLogin());
    } catch (error) {
        logger.error({ error }, 'Failed to start MiniMax Code login');
        return internalError("Failed to start MiniMax Code login");
    }
}

/** GET /api/minimax-code/login：轮询一次授权结果（仅管理员） */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorized();
    if (!requireAdmin(session)) return forbidden("Admin access required");

    try {
        return NextResponse.json(await pollLogin());
    } catch (error) {
        logger.error({ error }, 'Failed to poll MiniMax Code login');
        return internalError("Failed to poll MiniMax Code login");
    }
}
