import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { normalizePoolChars, poolCharsArray } from "@/lib/dictation/pool";
import { unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:pools");

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const pools = await prisma.charPool.findMany({
            where: { userId: user.id },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            include: { _count: { select: { entries: true } } },
        });

        return NextResponse.json({
            pools: pools.map((p) => ({
                id: p.id,
                name: p.name,
                chars: p.chars,
                charCount: poolCharsArray(p.chars).length,
                isDefault: p.isDefault,
                entryCount: p._count.entries,
                updatedAt: p.updatedAt,
            })),
        });
    } catch (error) {
        logger.error({ error }, "列出字库失败");
        return internalError("Failed to list pools");
    }
}

export async function POST(req: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const body = await req.json();
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        const chars = normalizePoolChars(typeof body?.chars === "string" ? body.chars : "");

        if (!name) return badRequest("字库名称不能为空");
        if (name.length > 40) return badRequest("字库名称过长");

        const existing = await prisma.charPool.findFirst({
            where: { userId: user.id, name },
        });
        if (existing) return badRequest("已存在同名字库");

        const count = await prisma.charPool.count({ where: { userId: user.id } });

        const pool = await prisma.charPool.create({
            data: {
                userId: user.id,
                name,
                chars,
                isDefault: count === 0,
            },
        });

        return NextResponse.json({
            pool: {
                id: pool.id,
                name: pool.name,
                chars: pool.chars,
                charCount: poolCharsArray(pool.chars).length,
                isDefault: pool.isDefault,
                entryCount: 0,
            },
        });
    } catch (error) {
        logger.error({ error }, "创建字库失败");
        return internalError("Failed to create pool");
    }
}
