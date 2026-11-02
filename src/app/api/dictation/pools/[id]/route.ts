import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { normalizePoolChars, poolCharsArray } from "@/lib/dictation/pool";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:pools:id");

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const existing = await prisma.charPool.findUnique({ where: { id } });
        if (!existing) return notFound("字库不存在");
        if (existing.userId !== user.id) return notFound("字库不存在");

        const body = await req.json();
        const data: { name?: string; chars?: string; isDefault?: boolean } = {};

        if (typeof body?.name === "string") {
            const name = body.name.trim();
            if (!name) return badRequest("字库名称不能为空");
            data.name = name;
        }

        if (typeof body?.chars === "string") {
            data.chars = normalizePoolChars(body.chars);
        }

        if (typeof body?.isDefault === "boolean") {
            data.isDefault = body.isDefault;
        }

        const pool = await prisma.$transaction(async (tx) => {
            if (data.isDefault) {
                await tx.charPool.updateMany({
                    where: { userId: user.id, isDefault: true, NOT: { id } },
                    data: { isDefault: false },
                });
            }
            return tx.charPool.update({ where: { id }, data });
        });

        return NextResponse.json({
            pool: {
                id: pool.id,
                name: pool.name,
                chars: pool.chars,
                charCount: poolCharsArray(pool.chars).length,
                isDefault: pool.isDefault,
            },
        });
    } catch (error) {
        logger.error({ error }, "更新字库失败");
        return internalError("Failed to update pool");
    }
}

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const existing = await prisma.charPool.findUnique({ where: { id } });
        if (!existing) return notFound("字库不存在");
        if (existing.userId !== user.id) return notFound("字库不存在");

        // 词条上的 poolId 由外键 ON DELETE SET NULL 自动置空
        await prisma.charPool.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error({ error }, "删除字库失败");
        return internalError("Failed to delete pool");
    }
}
