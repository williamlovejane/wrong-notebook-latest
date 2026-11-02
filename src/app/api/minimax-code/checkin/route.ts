import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { forbidden, internalError, unauthorized } from "@/lib/api-errors";
import { authOptions } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-utils";
import { createLogger } from "@/lib/logger";
import { runCheckin } from "@/lib/minimax-code/checkin";

const logger = createLogger('api:minimax-code:checkin');

export const dynamic = 'force-dynamic';

/** POST /api/minimax-code/checkin：立即签到一次，返回签到记录（仅管理员） */
export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorized();
    if (!requireAdmin(session)) return forbidden("Admin access required");

    try {
        return NextResponse.json(await runCheckin('manual'));
    } catch (error) {
        logger.error({ error }, 'Failed to check in MiniMax Code');
        return internalError("Failed to check in");
    }
}
