import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { applyReviewResult } from "@/lib/dictation/grading";
import { matchStrokeOrder, SHAPE_TOLERANCE, type StrokePoint, type UserStroke } from "@/lib/dictation/stroke-match";
import { loadStandardMedians } from "@/lib/dictation/stroke-data";
import { recognizeHandwriting } from "@/lib/dictation/handwriting-grade";
import { resolveDebugNow } from "@/lib/dictation/debug-time";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:handwriting");

const MAX_PADS = 8;
const MAX_STROKES_PER_PAD = 32;
const MAX_POINTS_PER_STROKE = 512;
const MAX_IMAGE_CHARS = 3_000_000; // dataURL 长度上限，约 2MB 图片

/** 校验并规整一笔的轨迹点；非法时返回 null */
function sanitizeStroke(raw: unknown): UserStroke | null {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_POINTS_PER_STROKE) return null;
    const points: StrokePoint[] = [];
    for (const p of raw) {
        if (typeof p !== "object" || p === null) return null;
        const { x, y } = p as { x?: unknown; y?: unknown };
        if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }
        points.push({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
    }
    return points;
}

/** 校验各田字格的笔迹：pads[i] 为第 i 个格子的笔画列表 */
function sanitizePads(raw: unknown): UserStroke[][] | null {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PADS) return null;
    const pads: UserStroke[][] = [];
    for (const pad of raw) {
        if (!Array.isArray(pad) || pad.length === 0 || pad.length > MAX_STROKES_PER_PAD) return null;
        const strokes: UserStroke[] = [];
        for (const s of pad) {
            const clean = sanitizeStroke(s);
            if (!clean) return null;
            strokes.push(clean);
        }
        pads.push(strokes);
    }
    return pads;
}

export async function POST(req: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const body = await req.json();
        const quizToken = typeof body?.quizToken === "string" ? body.quizToken : "";
        const image = typeof body?.image === "string" ? body.image : "";
        if (!quizToken) return badRequest("缺少 quizToken");
        if (image && image.length > MAX_IMAGE_CHARS) return badRequest("图片过大");

        const pads = sanitizePads(body?.strokes);
        if (!pads) return badRequest("笔迹数据无效");

        const log = await prisma.reviewLog.findUnique({
            where: { id: quizToken },
            include: {
                card: {
                    include: { entry: { select: { kind: true, text: true, pinyin: true } } },
                },
            },
        });

        if (!log) return notFound("题目不存在或已过期");
        if (log.card.userId !== user.id) return notFound("题目不存在或已过期");
        if (log.result !== "pending") return badRequest("这道题已经判过分了");

        const card = log.card;
        const entry = card.entry;
        if (entry.kind !== "chinese_char") return badRequest("手写判分仅支持语文生字");

        const expectedChars = Array.from(entry.text);
        if (pads.length !== expectedChars.length) {
            return badRequest(`需要写 ${expectedChars.length} 个字，收到 ${pads.length} 个格子的笔迹`);
        }

        // 本地笔顺匹配：逐字与标准笔顺比对
        const matches = await Promise.all(
            expectedChars.map((ch, i) => loadStandardMedians(ch).then((m) => (m ? matchStrokeOrder(pads[i], m) : null)))
        );
        const allAvailable = matches.every((m) => m !== null);
        const strokeOk = allAvailable && matches.every((m) => m!.ok);
        const shapeOk = allAvailable && matches.every((m) => m!.bestScore < SHAPE_TOLERANCE);

        let correct = false;
        let strokeCorrect: boolean | null = allAvailable ? strokeOk : null;
        let recognized = expectedChars.join("");
        let judgedBy: "stroke" | "ai" | "fallback" = "stroke";

        if (strokeOk) {
            // 笔顺全对：字形基本不可能错，直接判对，不消耗 AI
            correct = true;
        } else if (image) {
            // AI 复核手写画布
            const ai = await recognizeHandwriting(image, "image/png", entry.text);
            if (ai) {
                correct = ai.correct;
                recognized = ai.recognized;
                judgedBy = "ai";
            } else {
                // AI 不可用：笔数齐且字形没问题 → 算对（笔顺提示另给）；明显乱画 → 判错
                correct = allAvailable && shapeOk;
                strokeCorrect = allAvailable ? false : null;
                judgedBy = "fallback";
            }
        } else {
            // 无图也不可用 AI：按本地匹配降级判定
            correct = allAvailable && shapeOk;
            judgedBy = "fallback";
        }

        const now = resolveDebugNow(req, user.role) ?? new Date();
        const updated = await applyReviewResult({
            cardId: card.id,
            logId: log.id,
            stage: card.stage,
            correct,
            now,
            mode: "handwriting",
            answerText: recognized,
            strokeCorrect,
        });

        return NextResponse.json({
            correct,
            strokeCorrect,
            judgedBy,
            expected: entry.text,
            pinyin: entry.pinyin,
            promptWord: log.promptWord,
            recognized,
            strokeCountOk: matches.every((m) => m?.strokeCountOk ?? false),
            card: {
                id: updated.id,
                stage: updated.stage,
                status: updated.status,
                dueAt: updated.dueAt,
                correctCount: updated.correctCount,
                wrongCount: updated.wrongCount,
                stageLabel: updated.stageLabel,
            },
            logId: log.id,
        });
    } catch (error) {
        logger.error({ error }, "手写判分失败");
        return internalError("Failed to grade handwriting");
    }
}
