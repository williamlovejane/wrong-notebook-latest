import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { unauthorized, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { scheduleMasteryEvaluation } from "@/lib/mastery";

const logger = createLogger('api:practice:record:id');

/**
 * DELETE /api/practice/record/:id
 * 删除一条举一反三记录（用于更正录错的结果），并重新评估原题掌握概率
 */
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const user = await getCurrentUser();
        if (!user) {
            return unauthorized("Authentication required");
        }

        const record = await prisma.practiceRecord.findUnique({ where: { id }, select: { userId: true, errorItemId: true } });
        if (!record || record.userId !== user.id) {
            return notFound("Practice record not found");
        }

        await prisma.practiceRecord.delete({ where: { id } });
        if (record.errorItemId) {
            scheduleMasteryEvaluation([record.errorItemId]);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error({ error }, 'Error deleting practice record');
        return internalError("Failed to delete practice record");
    }
}
