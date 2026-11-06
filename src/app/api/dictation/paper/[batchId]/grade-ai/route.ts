import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { getAIService } from "@/lib/ai";
import { consumeAiQuota } from "@/lib/ai-quota";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:paper:grade-ai");

const MAX_IMAGE_CHARS = 8_000_000; // dataURL 上限，约 6MB 照片

interface GradedItem {
    logId: string;
    n: number;
    expected: string;
    pinyin: string;
    recognized: string | null;
    correct: boolean | null;
}

function parseGradeResponse(text: string): { n: number; recognized: string; correct: boolean }[] {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return [];
    try {
        const raw = JSON.parse(match[0]) as unknown;
        const list = Array.isArray(raw) ? raw : (raw as { results?: unknown[] }).results;
        if (!Array.isArray(list)) return [];
        return list
            .map((item) => item as { n?: unknown; recognized?: unknown; correct?: unknown })
            .filter(
                (item): item is { n: number; recognized: string; correct: boolean } =>
                    typeof item.n === "number" &&
                    typeof item.recognized === "string" &&
                    typeof item.correct === "boolean"
            );
    } catch {
        return [];
    }
}

/** 整卷拍照 AI 判分：返回每题判定结果供确认修改，不直接写库 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ batchId: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");
    const { batchId } = await params;

    try {
        const body = await req.json();
        const image = typeof body?.image === "string" ? body.image : "";
        if (!image) return badRequest("缺少试卷照片");
        if (image.length > MAX_IMAGE_CHARS) return badRequest("照片过大，请压缩后重试");

        const logs = await prisma.reviewLog.findMany({
            where: { batchId, result: "pending", card: { userId: user.id } },
            include: { card: { select: { entry: { select: { text: true } } } } },
            orderBy: [{ id: "asc" }],
        });
        if (logs.length === 0) return notFound("没有待判分的题目");

        const questions = logs.map((log, i) => {
            let snapshot: { pinyin?: string; promptWord?: string } = {};
            try {
                snapshot = log.promptJson ? JSON.parse(log.promptJson) : {};
            } catch {
                // 快照缺失时用词条信息兜底
            }
            const n = i + 1;
            return {
                n,
                logId: log.id,
                expected: log.card.entry.text,
                pinyin: snapshot.pinyin ?? "",
                promptWord: snapshot.promptWord ?? "",
            };
        });

        const questionList = questions
            .map((q) => `第${q.n}题：拼音 ${q.pinyin || "（无）"}，正确答案「${q.expected}」`)
            .join("\n");

        const prompt = [
            "你在批改一张小学生「看拼音写汉字」听写试卷的照片。试卷上每道题有题号、拼音，孩子在田字格里手写了汉字。",
            "题目清单（题号、拼音、标准答案）：",
            questionList,
            "",
            "请逐题在照片中找到对应题号的手写内容并判定：写对了算对；写成别的字、空着、或明显乱画算错。",
            "照片可能拍歪、有阴影，请仔细辨认。",
            '只输出一个 JSON 对象，不要输出其他内容，格式：{"results":[{"n":题号,"recognized":"你读出的字","correct":true或false}]}，results 必须覆盖清单里的每一题。',
        ].join("\n");

        const base64 = image.replace(/^data:image\/\w+;base64,/, "");
        // 与上游其它 AI 路由一致：先校验数据授权与额度，再向服务商发送数据
        const limited = await consumeAiQuota(user, "grade");
        if (limited) return limited;
        const ai = await getAIService({ userId: user.id, kind: "grade" });
        const text = await ai.analyzeImageWithPrompt(base64, "image/jpeg", prompt);
        const parsed = parseGradeResponse(text);
        if (parsed.length === 0) {
            logger.warn({ text: text.slice(0, 300) }, "整卷判分返回格式异常");
            return badRequest("AI 判分结果无法解析，请重试或改用人工录入");
        }

        const byN = new Map(parsed.map((p) => [p.n, p]));
        const items: GradedItem[] = questions.map((q) => {
            const hit = byN.get(q.n);
            return {
                logId: q.logId,
                n: q.n,
                expected: q.expected,
                pinyin: q.pinyin,
                recognized: hit?.recognized ?? null,
                correct: hit ? hit.correct : null,
            };
        });

        return NextResponse.json({ items });
    } catch (error) {
        logger.error({ error }, "整卷 AI 判分失败");
        return internalError("Failed to grade paper");
    }
}
