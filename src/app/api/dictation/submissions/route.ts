import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { resolveDebugNow } from "@/lib/dictation/debug-time";
import { unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-message";
import { AWAITING_REVIEW, type PadSnapshot, type ReviewListResponse } from "@/lib/dictation/handwriting-types";

const logger = createLogger("api:dictation:submissions");

const pointSchema = z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    t: z.number().min(0).max(3_600_000),
});
const padSchema = z.object({
    strokes: z.array(z.array(pointSchema).min(1).max(512)).min(1).max(32),
    image: z.string().max(1_500_000),
    animation: z.string().max(1_500_000),
});
/** 题面故意不返回答案，所以交卷请求也不能带 expected：由服务端从 pending 日志反查 */
const answerSchema = z.object({
    cardId: z.string().min(1).max(100),
    quizToken: z.string().min(1).max(100),
    pads: z.array(padSchema).max(8),
});
const submitSchema = z.object({
    /**
     * 本轮已浏览过的题目：已写题 pads 非空，未写题 pads 为空数组。
     * 未写题不判分、不推进复习计划，只清理出题时留下的 pending 记录。
     * 没翻到过的题不在此列，由 skippedCount 计入展示统计。
     */
    answers: z.array(answerSchema).max(50),
    /** 本轮未作答的题数（含未翻到的题），仅用于展示 */
    skippedCount: z.number().int().min(0).max(200).optional(),
    /** @deprecated 自动判卷已停用，仅为兼容旧版前端保留，服务端忽略 */
    gridImage: z.string().max(4_000_000).optional(),
});

/** 只允许位图 dataURL，避免把 SVG 之类可执行内容存进库再渲染到页面 */
function isSafeImage(value: string, mime: "png" | "gif"): boolean {
    return value.startsWith(`data:image/${mime};base64,`);
}

/**
 * 交卷被校验拒绝时统一打日志。
 * Next.js 生产模式不会把 4xx 记进容器日志，之前这些分支全部静默返回，
 * 线上出现「点了交卷但没有记录」时完全无法区分请求没到还是被拒。
 * 只记长度与前缀，绝不把笔迹图片内容写进日志。
 */
function rejectSubmission(userId: string, reason: string, detail: Record<string, unknown> = {}) {
    logger.warn({ userId, ...detail }, `交卷被拒绝：${reason}`);
    return badRequest(reason);
}

type SubmitBody = z.infer<typeof submitSchema>;

interface WrittenAnswer {
    cardId: string;
    quizToken: string;
    pads: PadSnapshot[];
}

interface QuestionMeta {
    expected: string;
    promptWord: string | null;
    pinyin: string | null;
}

/**
 * 整轮统一交卷：只保存笔迹与书写过程，立即返回。
 * 自动判卷已停用，批次直接落成「待人工审核」，复习计划等人工判定那一题时再结算。
 */
export async function POST(req: Request) {
    const user = await getCurrentUser();
    const contentLength = Number.parseInt(req.headers.get("content-length") ?? "0", 10) || 0;
    if (!user) {
        logger.warn({ contentLength }, "交卷被拒绝：未登录");
        return unauthorized("Authentication required");
    }
    const userId = user.id;

    let body: SubmitBody;
    try {
        body = submitSchema.parse(await req.json());
    } catch {
        return rejectSubmission(userId, "交卷数据格式不正确", { contentLength });
    }

    const tokens = body.answers.map((a) => a.quizToken);
    if (new Set(tokens).size !== tokens.length) {
        return rejectSubmission(userId, "同一道题重复提交", { answers: tokens.length });
    }

    const written: WrittenAnswer[] = [];
    const skippedTokens: string[] = [];
    for (const answer of body.answers) {
        if (answer.pads.length === 0) {
            skippedTokens.push(answer.quizToken);
            continue;
        }
        const badIndex = answer.pads.findIndex(
            (p) => !isSafeImage(p.image, "png") || !isSafeImage(p.animation, "gif")
        );
        if (badIndex >= 0) {
            return rejectSubmission(userId, "笔迹图片格式不正确", {
                quizToken: answer.quizToken,
                padIndex: badIndex,
                imagePrefix: answer.pads[badIndex].image.slice(0, 32),
                animationPrefix: answer.pads[badIndex].animation.slice(0, 32),
            });
        }
        written.push(answer);
    }
    if (body.answers.length === 0 || written.length === 0) {
        return rejectSubmission(userId, "没有已作答的内容，请至少写 1 题再交卷", {
            visited: body.answers.length,
            contentLength,
        });
    }

    try {
        const logs = await prisma.reviewLog.findMany({
            where: { id: { in: tokens } },
            include: {
                card: {
                    include: { entry: { select: { kind: true, text: true, pinyin: true } } },
                },
            },
        });
        const byId = new Map(logs.map((log) => [log.id, log]));
        const metaByToken = new Map<string, QuestionMeta>();

        for (const answer of written) {
            const log = byId.get(answer.quizToken);
            if (
                !log ||
                log.card.userId !== userId ||
                log.result !== "pending" ||
                log.cardId !== answer.cardId ||
                log.card.entry.kind !== "chinese_char"
            ) {
                return rejectSubmission(userId, "题目已过期或作答与题目不匹配，请重新出题", {
                    quizToken: answer.quizToken,
                    cardId: answer.cardId,
                    matchedLogs: logs.length,
                    logFound: Boolean(log),
                    logResult: log?.result ?? null,
                    logCardId: log?.cardId ?? null,
                    ownerMatches: log ? log.card.userId === userId : null,
                    kind: log?.card.entry.kind ?? null,
                });
            }
            const expected = log.card.entry.text;
            const expectedLength = Array.from(expected).length;
            if (answer.pads.length !== expectedLength) {
                return rejectSubmission(userId, "书写格数与题目字数不一致", {
                    quizToken: answer.quizToken,
                    pads: answer.pads.length,
                    expectedLength,
                });
            }
            metaByToken.set(answer.quizToken, {
                expected,
                promptWord: log.promptWord,
                pinyin: log.card.entry.pinyin,
            });
        }

        // 调试模式下用模拟时间排程，与键盘答题链路保持一致；人工判卷时也沿用这个时间
        const gradingNow = resolveDebugNow(req, user.role);
        // 提交记录的日期也要跟着模拟时间走，否则调试模式下「今日提交」查不到刚交的卷
        const createdAt = gradingNow ?? new Date();
        const skippedCount = Math.max(skippedTokens.length, body.skippedCount ?? 0);

        const submission = await prisma.$transaction(async (tx) => {
            // 浏览过但没写的题：清掉出题时留下的 pending 记录，不推进复习计划
            if (skippedTokens.length > 0) {
                await tx.reviewLog.deleteMany({
                    where: { id: { in: skippedTokens }, result: "pending", card: { userId } },
                });
            }
            return tx.dictationSubmission.create({
                data: {
                    userId,
                    createdAt,
                    status: AWAITING_REVIEW,
                    totalCount: written.length,
                    skippedCount,
                    gradingNow,
                    items: {
                        create: written.map((answer, position) => {
                            const meta = metaByToken.get(answer.quizToken)!;
                            return {
                                position,
                                logId: answer.quizToken,
                                cardId: answer.cardId,
                                expected: meta.expected,
                                promptWord: meta.promptWord,
                                pinyin: meta.pinyin,
                                pads: JSON.stringify(answer.pads.map((p) => p.strokes)),
                                images: JSON.stringify(answer.pads.map((p) => p.image)),
                                animations: JSON.stringify(answer.pads.map((p) => p.animation)),
                            };
                        }),
                    },
                },
                select: { id: true },
            });
        });

        logger.info(
            {
                userId,
                submissionId: submission.id,
                totalCount: written.length,
                skippedCount,
                visited: body.answers.length,
                debugMode: Boolean(gradingNow),
                createdAt: createdAt.toISOString(),
            },
            "交卷成功，已创建待人工审核的提交"
        );
        return NextResponse.json({
            submissionId: submission.id,
            totalCount: written.length,
            skippedCount,
        });
    } catch (error) {
        logger.error(
            { userId, error: getErrorMessage(error), visited: body.answers.length, written: written.length },
            "交卷失败"
        );
        return internalError("Failed to submit dictation");
    }
}

/** 列表页会定期轮询，命中数没变化时不重复打日志 */
let lastListLogKey = "";

/**
 * 当天（或指定日期）的待人工判卷清单。
 * 把当天所有交卷批次里的字平铺成一层：多次交卷、多字题目都合并在同一个列表里，
 * 不再需要先点进某个批次再点进详情。默认只回传待判记录的笔迹，避免反复下载动图。
 */
export async function GET(req: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    const url = new URL(req.url);
    const rawDate = url.searchParams.get("date") ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? rawDate
        : new Date().toLocaleDateString("sv-SE");
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime())) return badRequest("日期格式不正确");
    const includeReviewed = url.searchParams.get("includeReviewed") === "1";

    const batches = await prisma.dictationSubmission.findMany({
        where: { userId: user.id, createdAt: { gte: start, lt: end } },
        orderBy: [{ createdAt: "asc" }],
        select: {
            id: true,
            createdAt: true,
            items: {
                orderBy: [{ position: "asc" }],
                select: {
                    id: true,
                    position: true,
                    expected: true,
                    promptWord: true,
                    pinyin: true,
                    images: true,
                    animations: true,
                    correct: true,
                    judgedBy: true,
                    manualCorrect: true,
                },
            },
        },
    });

    const flat = batches.flatMap((batch) =>
        batch.items.map((item) => ({
            ...item,
            submissionId: batch.id,
            createdAt: batch.createdAt.toISOString(),
        }))
    );
    // 只有人工判定过才算「已判」：历史上自动判卷留下的 ai/local/mixed 结果也允许重新审核
    const pending = flat.filter((row) => row.judgedBy !== "manual");
    const reviewed = flat.filter((row) => row.judgedBy === "manual").reverse();

    const key = `${user.id}:${date}:${pending.length}:${reviewed.length}`;
    if (lastListLogKey !== key) {
        lastListLogKey = key;
        logger.info(
            { userId: user.id, date, batches: batches.length, pending: pending.length, reviewed: reviewed.length },
            "查询当天待人工判卷清单"
        );
    }

    const response: ReviewListResponse = {
        date,
        batchCount: batches.length,
        pending,
        reviewedCount: reviewed.length,
        ...(includeReviewed ? { reviewed } : {}),
    };
    return NextResponse.json(response);
}
