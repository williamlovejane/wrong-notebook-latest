import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:entries:id");

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const existing = await prisma.dictationEntry.findUnique({ where: { id } });
        if (!existing || existing.userId !== user.id) return notFound("词条不存在");

        const body = await req.json();
        const data: Record<string, string | null> = {};

        for (const field of ["pinyin", "meaning", "note"] as const) {
            if (typeof body?.[field] === "string") {
                data[field] = body[field].trim() || null;
            }
        }

        // 改了生字文本，之前缓存的组词可能不再适用，清掉重新生成
        if (typeof body?.text === "string" && body.text.trim() && body.text.trim() !== existing.text) {
            await prisma.dictationWord.deleteMany({ where: { entryId: id } });
        }

        const entry = await prisma.dictationEntry.update({ where: { id }, data });

        return NextResponse.json({ entry });
    } catch (error) {
        logger.error({ error }, "更新词条失败");
        return internalError("Failed to update entry");
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
        const existing = await prisma.dictationEntry.findUnique({ where: { id } });
        if (!existing || existing.userId !== user.id) return notFound("词条不存在");

        await prisma.dictationEntry.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error({ error }, "删除词条失败");
        return internalError("Failed to delete entry");
    }
}
