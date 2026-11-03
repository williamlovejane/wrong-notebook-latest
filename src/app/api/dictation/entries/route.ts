import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { isAllHanzi } from "@/lib/dictation/pool";
import { isDictationKind, type DictationKind } from "@/lib/dictation/types";
import { initialDueDate, describeStage } from "@/lib/dictation/schedule";
import { resolveDebugNow } from "@/lib/dictation/debug-time";
import { unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { lookupCharOrigin } from "@/lib/yuwen/db";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:entries");

interface EntryInput {
    text: string;
    pinyin?: string;
    meaning?: string;
    note?: string;
}

function validateEntry(kind: DictationKind, input: EntryInput): string | null {
    const text = (input.text || "").trim();

    if (!text) return "内容不能为空";
    if (text.length > 200) return "内容过长";

    if (kind === "chinese_char") {
        if (!isAllHanzi(text)) return `「${text}」含有非汉字字符`;
        if (Array.from(text).length > 4) return `「${text}」超过 4 个字，生字请逐字录入`;
    }

    if (kind === "english_word" && text.length > 60) {
        return `「${text}」过长，请使用「英语句子」类型`;
    }

    return null;
}

export async function GET(req: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const url = new URL(req.url);
        const kindParam = url.searchParams.get("kind");
        const kind = isDictationKind(kindParam) ? kindParam : undefined;

        const entries = await prisma.dictationEntry.findMany({
            where: { userId: user.id, ...(kind ? { kind } : {}) },
            orderBy: { createdAt: "desc" },
            include: {
                card: true,
                _count: { select: { words: true } },
            },
        });

        return NextResponse.json({
            entries: entries.map((e) => ({
                id: e.id,
                kind: e.kind,
                text: e.text,
                pinyin: e.pinyin,
                meaning: e.meaning,
                note: e.note,
                wordCount: e._count.words,
                card: e.card
                    ? {
                          id: e.card.id,
                          stage: e.card.stage,
                          status: e.card.status,
                          dueAt: e.card.dueAt,
                          correctCount: e.card.correctCount,
                          wrongCount: e.card.wrongCount,
                          stageLabel: describeStage(e.card.stage, e.card.status as any).label,
                      }
                    : null,
                createdAt: e.createdAt,
            })),
        });
    } catch (error) {
        logger.error({ error }, "列出词条失败");
        return internalError("Failed to list entries");
    }
}

export async function POST(req: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const body = await req.json();
        const kind = body?.kind;

        if (!isDictationKind(kind)) return badRequest("无效的类型");

        const rawItems: EntryInput[] = Array.isArray(body?.items)
            ? body.items
            : body?.text
              ? [{ text: body.text, pinyin: body.pinyin, meaning: body.meaning, note: body.note }]
              : [];

        if (rawItems.length === 0) return badRequest("没有要录入的内容");
        if (rawItems.length > 200) return badRequest("单次最多录入 200 条");

        const created: string[] = [];
        const skipped: { text: string; reason: string }[] = [];
        const now = resolveDebugNow(req, user.role) ?? new Date();
        const due = initialDueDate(now);

        for (const item of rawItems) {
            const text = (item.text || "").trim();
            const problem = validateEntry(kind, item);
            if (problem) {
                skipped.push({ text: text || "(空)", reason: problem });
                continue;
            }

            const dup = await prisma.dictationEntry.findFirst({
                where: { userId: user.id, kind, text },
                select: { id: true },
            });
            if (dup) {
                skipped.push({ text, reason: "已存在" });
                continue;
            }

            // 语文生字：拼音/出处未填时，反查课内字词库自动补全
            let autoPinyin = item.pinyin?.trim() || null;
            let autoNote = item.note?.trim() || null;
            if (kind === "chinese_char" && Array.from(text).length === 1 && (!autoPinyin || !autoNote)) {
                try {
                    const origin = lookupCharOrigin(text);
                    if (origin) {
                        if (!autoPinyin) autoPinyin = origin.pinyin;
                        if (!autoNote) {
                            autoNote = `${origin.grade}${origin.semester}·${origin.list}·${origin.label}·页${origin.pagePrint}`;
                        }
                    }
                } catch {
                    // 参考库不可用时静默跳过，不影响录入
                }
            }

            const entry = await prisma.dictationEntry.create({
                data: {
                    userId: user.id,
                    kind,
                    text,
                    pinyin: autoPinyin,
                    meaning: item.meaning?.trim() || null,
                    note: autoNote,
                    card: {
                        create: {
                            userId: user.id,
                            stage: 0,
                            status: "active",
                            dueAt: due,
                        },
                    },
                },
            });

            created.push(entry.id);
        }

        return NextResponse.json({
            createdCount: created.length,
            skippedCount: skipped.length,
            skipped,
        });
    } catch (error) {
        logger.error({ error }, "录入词条失败");
        return internalError("Failed to create entries");
    }
}
