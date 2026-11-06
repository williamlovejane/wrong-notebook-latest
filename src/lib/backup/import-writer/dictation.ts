/**
 * 导入步骤：整轮手写听写的提交记录（version 12 起）。
 *
 * 提交记录自带 expected / promptWord / pinyin、书写轨迹、成品图、GIF 动图、
 * 判定结果与人工复核结论，还原后即可在「今日提交」里回看，不依赖 ReviewLog / ReviewCard。
 * 手写听写已改为全部人工判卷：导出时残留的 pending / grading / failed 批次
 * 统一还原成「待人工审核」，不再标记为中断失败，也不会再启动后台判分任务。
 *
 * 以原提交 ID 作为来源标识：同一用户重复导入同一备份不会重复创建；
 * 若该 ID 已被其他账户占用则改由数据库生成新 ID。
 */
import { z } from "zod";
import { AWAITING_REVIEW } from "@/lib/dictation/handwriting-types";
import type { ImportContext } from "./types";

const IMAGE_DATA_PATTERN = /^data:image\/(?:png|gif|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_IMAGE_LIST_LENGTH = 20 * 1024 * 1024;
const MAX_JSON_LENGTH = 20 * 1024 * 1024;

const dateString = z.string().max(40).nullish();
const nullableText = (max: number) => z.string().max(max).nullish();

const itemSchema = z.object({
    id: z.string().min(1).max(100).optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    logId: z.string().min(1).max(100),
    cardId: z.string().min(1).max(100),
    expected: z.string().min(1).max(200),
    promptWord: nullableText(500),
    pinyin: nullableText(500),
    /** JSON 数组：带时间戳的笔迹轨迹 */
    pads: z.string().max(MAX_JSON_LENGTH),
    /** JSON 数组：每字成品图 dataURL */
    images: z.string().max(MAX_IMAGE_LIST_LENGTH),
    /** JSON 数组：每字书写过程 GIF dataURL */
    animations: z.string().max(MAX_IMAGE_LIST_LENGTH).nullish(),
    correct: z.boolean().nullish(),
    recognized: nullableText(200),
    confidence: nullableText(20),
    judgedBy: nullableText(20),
    strokeCorrect: z.boolean().nullish(),
    detail: nullableText(100_000),
    error: nullableText(500),
    gradedAt: dateString,
    manualCorrect: z.boolean().nullish(),
});

const submissionSchema = z.object({
    id: z.string().min(1).max(100),
    userId: z.string().max(100).nullish(),
    status: z.string().max(40).nullish(),
    mode: z.string().max(40).nullish(),
    totalCount: z.number().int().min(0).max(1000).optional(),
    skippedCount: z.number().int().min(0).max(1000).optional(),
    gradedCount: z.number().int().min(0).max(1000).optional(),
    correctCount: z.number().int().min(0).max(1000).optional(),
    judgedBy: nullableText(40),
    error: nullableText(500),
    gridImage: z.string().max(15 * 1024 * 1024).nullish(),
    gradingNow: dateString,
    heartbeatAt: dateString,
    createdAt: dateString,
    finishedAt: dateString,
    items: z.array(itemSchema).max(200).optional(),
});

function parseDate(value: string | null | undefined): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/** 只保留合法的图片 dataURL，避免备份文件被塞入脚本或其他协议内容 */
function safeImageList(raw: string | null | undefined): string {
    if (!raw) return "[]";
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return "[]";
        return JSON.stringify(parsed.filter((value): value is string => typeof value === "string" && IMAGE_DATA_PATTERN.test(value)));
    } catch {
        return "[]";
    }
}

/** 轨迹必须是 JSON 数组，非法内容丢弃但不影响提交记录本身 */
function safePads(raw: string): string {
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? JSON.stringify(parsed) : "[]";
    } catch {
        return "[]";
    }
}

function safeDetail(raw: string | null | undefined): string | null {
    if (!raw) return null;
    try {
        JSON.parse(raw);
        return raw;
    } catch {
        return null;
    }
}

function safeGridImage(raw: string | null | undefined): string | null {
    return raw && IMAGE_DATA_PATTERN.test(raw) ? raw : null;
}

/** 返回新建的提交批次数 */
export async function importDictationSubmissions(ctx: ImportContext): Promise<number> {
    const { tx, user, importAll, normalized, stats } = ctx;
    const raw = normalized.data.dictationSubmissions;
    if (!Array.isArray(raw)) return 0;

    let created = 0;
    const knownUsers = new Map<string, boolean>();
    for (const entry of raw) {
        const parsed = submissionSchema.safeParse(entry);
        if (!parsed.success) continue;
        const submission = parsed.data;
        const userId = importAll ? (submission.userId ?? "") : user.id;
        if (!knownUsers.has(userId)) {
            knownUsers.set(userId, (await tx.user.count({ where: { id: userId } })) > 0);
        }
        if (!knownUsers.get(userId)) continue;

        // 重复导入（或再次导出后导入）不重复创建
        const existing = await tx.dictationSubmission.findFirst({
            where: { userId, id: submission.id },
            select: { id: true },
        });
        if (existing) continue;
        const idTaken = (await tx.dictationSubmission.count({ where: { id: submission.id } })) > 0;

        // 已全部人工判完的批次保留完成态；其余（含旧版 pending/grading/failed）都回到待判
        const status = submission.status === "completed" ? "completed" : AWAITING_REVIEW;
        const items = submission.items ?? [];
        // 旧版自动判卷留下的 ai/local 结果不算「已判」：非完成批次按人工判定重算统计，避免进度虚高
        const manualItems = items.filter((item) => item.judgedBy === "manual");
        const gradedCount = status === "completed" ? submission.gradedCount ?? items.length : manualItems.length;
        const correctCount = status === "completed"
            ? submission.correctCount ?? 0
            : manualItems.filter((item) => (item.manualCorrect ?? item.correct) === true).length;
        const judgedBy = status === "completed"
            ? submission.judgedBy ?? null
            : manualItems.length > 0 ? "manual" : null;

        await tx.dictationSubmission.create({
            data: {
                ...(idTaken ? {} : { id: submission.id }),
                userId,
                status,
                mode: submission.mode || "handwriting",
                totalCount: submission.totalCount ?? items.length,
                skippedCount: submission.skippedCount ?? 0,
                gradedCount,
                correctCount,
                judgedBy,
                error: status === "completed" ? submission.error ?? null : null,
                gridImage: safeGridImage(submission.gridImage),
                gradingNow: parseDate(submission.gradingNow) ?? null,
                heartbeatAt: null,
                createdAt: parseDate(submission.createdAt),
                finishedAt: status === "completed" ? parseDate(submission.finishedAt) ?? null : null,
                items: {
                    create: items.map((item, index) => ({
                        position: item.position ?? index,
                        logId: item.logId,
                        cardId: item.cardId,
                        expected: item.expected,
                        promptWord: item.promptWord ?? null,
                        pinyin: item.pinyin ?? null,
                        pads: safePads(item.pads),
                        images: safeImageList(item.images),
                        animations: item.animations ? safeImageList(item.animations) : null,
                        correct: item.correct ?? null,
                        recognized: item.recognized ?? null,
                        confidence: item.confidence ?? null,
                        judgedBy: item.judgedBy ?? null,
                        strokeCorrect: item.strokeCorrect ?? null,
                        detail: safeDetail(item.detail),
                        error: item.error ?? null,
                        gradedAt: parseDate(item.gradedAt) ?? null,
                        manualCorrect: item.manualCorrect ?? null,
                    })),
                },
            },
        });
        stats.dictationSubmissionsCreated++;
        created++;
    }
    return created;
}
