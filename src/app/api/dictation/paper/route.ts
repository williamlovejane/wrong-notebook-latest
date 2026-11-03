import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dictation/auth";
import { buildChinesePrompt, PromptError, type PromptUser } from "@/lib/dictation/prompt";
import { isDue } from "@/lib/dictation/schedule";
import { resolveDebugNow } from "@/lib/dictation/debug-time";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:dictation:paper");

/** 单张试卷最多题数：太多打印排版失控，也拖慢组词 */
const MAX_PAPER_ITEMS = 50;

interface PaperPromptSnapshot {
    pinyin: string;
    maskedWord: string;
    syllables: string[];
    maskedFrom: number;
    maskedLength: number;
    fallbackSingleChar?: boolean;
    hint?: string;
    sourceLabel?: string;
    promptWord: string;
    expected: string;
}

export async function POST(req: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    try {
        const now = resolveDebugNow(req, user.role) ?? new Date();

        const cards = await prisma.reviewCard.findMany({
            where: {
                userId: user.id,
                status: { in: ["active", "mastered"] },
                entry: { kind: "chinese_char" },
            },
            include: {
                entry: {
                    select: { id: true, kind: true, text: true, pinyin: true },
                },
            },
            orderBy: [{ dueAt: "asc" }],
        });

        const due = cards.filter((c) => isDue(c.dueAt, now)).slice(0, MAX_PAPER_ITEMS);

        // 出新卷前清掉这批卡的悬空待判分记录（在线没答完/旧试卷）
        if (due.length > 0) {
            await prisma.reviewLog.deleteMany({
                where: { cardId: { in: due.map((c) => c.id) }, result: "pending" },
            });
        }

        const batchId = crypto.randomUUID();
        const promptUser: PromptUser = {
            educationStage: user.educationStage ?? null,
            enrollmentYear: user.enrollmentYear ?? null,
        };

        const items: {
            logId: string;
            cardId: string;
            snapshot: PaperPromptSnapshot;
        }[] = [];
        const skipped: { text: string; reason: string }[] = [];

        for (const card of due) {
            try {
                const built = await buildChinesePrompt(promptUser, card, card.entry);
                const snapshot: PaperPromptSnapshot = {
                    pinyin: built.prompt.pinyin,
                    maskedWord: built.prompt.maskedWord,
                    syllables: built.prompt.syllables,
                    maskedFrom: built.prompt.maskedFrom,
                    maskedLength: built.prompt.maskedLength,
                    fallbackSingleChar: built.prompt.fallbackSingleChar,
                    hint: built.prompt.hint,
                    sourceLabel: built.prompt.sourceLabel,
                    promptWord: built.promptWord,
                    expected: card.entry.text,
                };
                const log = await prisma.reviewLog.create({
                    data: {
                        cardId: card.id,
                        result: "pending",
                        stageBefore: card.stage,
                        stageAfter: card.stage,
                        promptWord: built.promptWord,
                        batchId,
                        promptJson: JSON.stringify(snapshot),
                    },
                });
                items.push({ logId: log.id, cardId: card.id, snapshot });
            } catch (error) {
                if (error instanceof PromptError) {
                    skipped.push({ text: card.entry.text, reason: error.message });
                } else {
                    throw error;
                }
            }
        }

        return NextResponse.json({
            paperId: batchId,
            createdAt: now.toISOString(),
            items: items.map(({ logId, cardId, snapshot }) => ({ logId, cardId, ...snapshot })),
            skipped,
        });
    } catch (error) {
        logger.error({ error }, "出卷失败");
        return internalError("Failed to create paper");
    }
}
