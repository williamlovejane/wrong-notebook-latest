import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppVersion } from "@/lib/app-version";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json({
            status: "ok",
            version: getAppVersion(),
            revision: process.env.APP_REVISION || "unknown",
        }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return NextResponse.json({ status: "unavailable" }, {
            status: 503,
            headers: { "Cache-Control": "no-store" },
        });
    }
}
