// @vitest-environment node
/**
 * 回归：已交卷但还没人工判卷的字，不再重复出现在「今日待复习」和新试卷里。
 *
 * 交卷只保存笔迹，复习卡的到期时间要等人工判卷才推进；若不加过滤，
 * 这些字会一直算「到期」，点「继续手写默写」又被写一遍。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    currentUser: { id: "user-1", role: "user", educationStage: null, enrollmentYear: null } as
        | { id: string; role: string; educationStage: string | null; enrollmentYear: number | null }
        | null,
    reviewCardFindMany: vi.fn(),
    submissionItemFindMany: vi.fn(),
    reviewLogDeleteMany: vi.fn(),
    reviewLogCreate: vi.fn(),
    buildChinesePrompt: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        reviewCard: { findMany: mocks.reviewCardFindMany },
        dictationSubmissionItem: { findMany: mocks.submissionItemFindMany },
        reviewLog: {
            deleteMany: mocks.reviewLogDeleteMany,
            create: mocks.reviewLogCreate,
        },
    },
}));
vi.mock("@/lib/dictation/auth", () => ({
    getCurrentUser: vi.fn(async () => mocks.currentUser),
}));
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/dictation/prompt", () => ({
    buildChinesePrompt: mocks.buildChinesePrompt,
    PromptError: class PromptError extends Error {},
}));

import { GET } from "@/app/api/dictation/today/route";
import { POST as createPaper } from "@/app/api/dictation/paper/route";
import { findAwaitingReviewCardIds } from "@/lib/dictation/awaiting-review";
import { AWAITING_REVIEW } from "@/lib/dictation/handwriting-types";

const card = (id: string, text: string, dueAt: string) => ({
    id,
    userId: "user-1",
    stage: 0,
    status: "active",
    dueAt: new Date(dueAt),
    entry: { id: `entry-${id}`, kind: "chinese_char", text, pinyin: "xīn", meaning: null },
});

const todayReq = (qs = "") => new Request(`http://localhost/api/dictation/today${qs}`);
const paperReq = () => new Request("http://localhost/api/dictation/paper", { method: "POST" });

interface TodayItemRow {
    cardId: string;
    text: string | null;
}

describe("已交卷待判卷的字不再重复出题", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser = { id: "user-1", role: "user", educationStage: null, enrollmentYear: null };
        mocks.reviewCardFindMany.mockResolvedValue([
            card("card-awaiting", "新", "2020-01-01"),
            card("card-due", "花", "2020-01-02"),
            card("card-future", "草", "2999-01-01"),
        ]);
        mocks.submissionItemFindMany.mockResolvedValue([{ cardId: "card-awaiting" }]);
        mocks.reviewLogDeleteMany.mockResolvedValue({ count: 1 });
        mocks.reviewLogCreate.mockResolvedValue({ id: "log-new" });
        mocks.buildChinesePrompt.mockResolvedValue({
            prompt: {
                pinyin: "huā",
                maskedWord: "○",
                syllables: ["huā"],
                maskedFrom: 0,
                maskedLength: 1,
            },
            promptWord: "花",
        });
    });

    it("今日待复习剔除待判卷的字，并回传待判数量", async () => {
        const response = await GET(todayReq("?kind=chinese_char"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.items.map((row: TodayItemRow) => row.cardId)).toEqual(["card-due"]);
        expect(body.totalDue).toBe(1);
        expect(body.byKind.chinese_char).toBe(1);
        expect(body.awaitingReviewCount).toBe(1);
    });

    it("all=1 查看全部卡片时同样剔除待判卷的字", async () => {
        const body = await (await GET(todayReq("?all=1"))).json();
        expect(body.items.map((row: TodayItemRow) => row.cardId)).toEqual(["card-due", "card-future"]);
        expect(body.awaitingReviewCount).toBe(1);
    });

    it("没有待判卷记录时，到期的字照常出现", async () => {
        mocks.submissionItemFindMany.mockResolvedValue([]);
        const body = await (await GET(todayReq())).json();
        expect(body.items.map((row: TodayItemRow) => row.cardId)).toEqual(["card-awaiting", "card-due"]);
        expect(body.awaitingReviewCount).toBe(0);
        expect(body.totalDue).toBe(2);
    });

    it("打印试卷也不再出待判卷的字，悬空日志只清理真正出题的卡", async () => {
        const response = await createPaper(paperReq());
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.items.map((row: { cardId: string }) => row.cardId)).toEqual(["card-due"]);
        expect(mocks.reviewLogDeleteMany).toHaveBeenCalledWith({
            where: { cardId: { in: ["card-due"] }, result: "pending" },
        });
    });

    it("待判查询按用户隔离，且只认待判卷批次（已完成的历史批次不挡复习）", async () => {
        await GET(todayReq());
        const query = mocks.submissionItemFindMany.mock.calls[0][0] as {
            where: { submission: { userId: string; status: { in: string[] } }; OR: unknown[] };
            distinct: string[];
        };
        expect(query.where.submission.userId).toBe("user-1");
        expect(query.where.submission.status.in).toContain(AWAITING_REVIEW);
        expect(query.where.submission.status.in).not.toContain("completed");
        expect(query.distinct).toEqual(["cardId"]);
    });

    it("同一个字多次交卷只算一张待判卡", async () => {
        mocks.submissionItemFindMany.mockResolvedValue([
            { cardId: "card-awaiting" },
            { cardId: "card-awaiting" },
        ]);
        await expect(findAwaitingReviewCardIds("user-1")).resolves.toEqual(new Set(["card-awaiting"]));
    });

    it("未登录返回 401", async () => {
        mocks.currentUser = null;
        expect((await GET(todayReq())).status).toBe(401);
    });
});
