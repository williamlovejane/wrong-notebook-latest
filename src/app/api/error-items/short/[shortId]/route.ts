import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { unauthorized, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { isShortId } from "@/lib/short-id";

const logger = createLogger('api:error-items:short');

/**
 * GET /api/error-items/short/:shortId
 * 按短 ID 定位当前用户的题目
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ shortId: string }> }
) {
    const { shortId } = await params;

    try {
        const user = await getCurrentUser();
        if (!user) {
            return unauthorized("Authentication required");
        }
        if (!isShortId(shortId)) {
            return notFound("Item not found");
        }

        const item = await prisma.errorItem.findUnique({
            where: { shortId },
            select: { id: true, userId: true, subjectId: true, shortId: true },
        });
        if (!item || item.userId !== user.id) {
            return notFound("Item not found");
        }

        return NextResponse.json({ id: item.id, subjectId: item.subjectId, shortId: item.shortId });
    } catch (error) {
        logger.error({ error }, 'Error locating item by short ID');
        return internalError("Failed to locate error item");
    }
}
