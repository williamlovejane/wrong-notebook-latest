import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import { loadHanziData } from "@/lib/dictation/hanzi-data";
import { isStandardStrokeChar } from "@/lib/dictation/handwriting-types";
import { badRequest, notFound } from "@/lib/api-errors";

type RouteContext = {
    params: Promise<{ char: string }>;
};

/**
 * 单字标准笔顺数据：hanzi-writer 的 charDataLoader 走这里读本地数据包，
 * 不走默认的 cdn.jsdelivr.net，内网/离线部署也能显示标准笔顺。
 */
export const GET = withUser<RouteContext>(async (_req, { params }) => {
    const { char } = await params;
    if (!isStandardStrokeChar(char)) return badRequest("只支持查询单个汉字的笔顺");

    const data = await loadHanziData(char);
    if (!data) return notFound("没有这个字的标准笔顺数据");

    // 字形数据不会变；接口需登录，用 private 缓存避免跨账号共享
    return NextResponse.json(data, {
        headers: { "Cache-Control": "private, max-age=86400, immutable" },
    });
});
