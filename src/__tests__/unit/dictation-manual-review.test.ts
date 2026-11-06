// @vitest-environment node
/**
 * 手写听写「全部人工判卷」回归测试。
 *
 * 覆盖三件事：交卷不再要求/保存判分网格图；当天多次交卷的字被平铺成一层待判清单；
 * 人工判定（含改判、重复点同一结论）只结算一次复习计划并使用交卷时的模拟时间。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const tx = {
        dictationSubmission: {
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        dictationSubmissionItem: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
        },
        reviewLog: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            deleteMany: vi.fn(),
        },
        reviewCard: { update: vi.fn() },
        user: { findUnique: vi.fn() },
    };
    return {
        tx,
        currentUser: { id: "user-1", email: "u@example.com", role: "user" } as
            | { id: string; email: string; role: string }
            | null,
    };
});

vi.mock("@/lib/prisma", () => ({
    prisma: {
        ...mocks.tx,
        $transaction: vi.fn(async (fn: (client: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx)),
    },
}));
vi.mock("@/lib/dictation/auth", () => ({
    getCurrentUser: vi.fn(async () => mocks.currentUser),
}));
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { GET, POST } from "@/app/api/dictation/submissions/route";
import { PATCH } from "@/app/api/dictation/submissions/[id]/route";
import { AWAITING_REVIEW } from "@/lib/dictation/handwriting-types";

const png = "data:image/png;base64,iVBORw0KGgo=";
const gif = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const strokes = [[{ x: 0.2, y: 0.3, t: 0 }, { x: 0.6, y: 0.7, t: 30 }]];

const request = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);
const jsonPost = (path: string, body: unknown) =>
    request(path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

const item = (id: string, judgedBy: string | null, manualCorrect: boolean | null = null) => ({
    id,
    position: 0,
    expected: "新",
    promptWord: "新年",
    pinyin: "xīn",
    images: JSON.stringify([png]),
    animations: JSON.stringify([gif]),
    correct: manualCorrect,
    judgedBy,
    manualCorrect,
});

describe("POST /api/dictation/submissions：交卷只存笔迹", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser = { id: "user-1", email: "u@example.com", role: "user" };
        mocks.tx.reviewLog.findMany.mockResolvedValue([
            {
                id: "log-1",
                cardId: "card-1",
                result: "pending",
                promptWord: "新年",
                stageBefore: 1,
                card: { userId: "user-1", entry: { kind: "chinese_char", text: "新", pinyin: "xīn" } },
            },
        ]);
        mocks.tx.dictationSubmission.create.mockResolvedValue({ id: "sub-1" });
    });

    const validAnswers = () => [
        {
            cardId: "card-1",
            quizToken: "log-1",
            pads: [{ strokes, image: png, animation: gif }],
        },
    ];

    it("不带 gridImage 也能交卷，批次直接落成待人工审核且不写判分图", async () => {
        const response = await POST(jsonPost("/api/dictation/submissions", {
            answers: validAnswers(),
            skippedCount: 0,
        }));
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ submissionId: "sub-1", totalCount: 1 });

        const created = mocks.tx.dictationSubmission.create.mock.calls[0][0] as {
            data: Record<string, unknown> & { items: { create: Record<string, unknown>[] } };
        };
        expect(created.data.status).toBe(AWAITING_REVIEW);
        expect(created.data.gridImage).toBeUndefined();
        expect(created.data.items.create).toHaveLength(1);
        expect(created.data.items.create[0].expected).toBe("新");
        expect(mocks.tx.reviewLog.deleteMany).not.toHaveBeenCalled();
    });

    it("没写任何字时拒绝交卷", async () => {
        const response = await POST(jsonPost("/api/dictation/submissions", {
            answers: [{ cardId: "card-1", quizToken: "log-1", pads: [] }],
        }));
        expect(response.status).toBe(400);
        expect(mocks.tx.dictationSubmission.create).not.toHaveBeenCalled();
    });

    it("旧前端带上 gridImage 也只忽略，不写进库", async () => {
        const response = await POST(jsonPost("/api/dictation/submissions", {
            answers: validAnswers(),
            gridImage: png,
        }));
        expect(response.status).toBe(200);
        const created = mocks.tx.dictationSubmission.create.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(created.data.gridImage).toBeUndefined();
    });
});

describe("GET /api/dictation/submissions：当天多次交卷平铺成一层", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser = { id: "user-1", email: "u@example.com", role: "user" };
        mocks.tx.dictationSubmission.findMany.mockResolvedValue([
            {
                id: "sub-1",
                createdAt: new Date("2026-11-05T09:00:00.000Z"),
                items: [item("a1", null), item("a2", "manual", true)],
            },
            {
                id: "sub-2",
                createdAt: new Date("2026-11-05T10:00:00.000Z"),
                items: [item("b1", "ai", false), item("b2", "manual", false)],
            },
        ]);
    });

    it("跨批次只返回未人工判过的字，历史 ai 判定也进入待人工审核", async () => {
        const response = await GET(request("/api/dictation/submissions?date=2026-11-05"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.batchCount).toBe(2);
        expect(body.pending.map((row: { id: string }) => row.id)).toEqual(["a1", "b1"]);
        expect(body.pending.every((row: { submissionId: string }) => row.submissionId)).toBe(true);
        expect(body.reviewedCount).toBe(2);
        expect(body.reviewed).toBeUndefined();
    });

    it("includeReviewed=1 才回传已判记录，避免反复下载动图", async () => {
        const response = await GET(request("/api/dictation/submissions?date=2026-11-05&includeReviewed=1"));
        const body = await response.json();
        expect(body.reviewed.map((row: { id: string }) => row.id)).toEqual(["b2", "a2"]);
    });

    it("未登录返回 401", async () => {
        mocks.currentUser = null;
        expect((await GET(request("/api/dictation/submissions"))).status).toBe(401);
    });
});

describe("PATCH /api/dictation/submissions/[id]：唯一的人工判定入口", () => {
    const gradingNow = new Date("2026-11-11T09:00:00.000Z");
    const params = { params: Promise.resolve({ id: "sub-1" }) };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser = { id: "user-1", email: "u@example.com", role: "user" };
        mocks.tx.dictationSubmission.findUnique.mockResolvedValue({ userId: "user-1", gradingNow });
        mocks.tx.dictationSubmissionItem.findUnique.mockResolvedValue({
            id: "item-1",
            submissionId: "sub-1",
            logId: "log-1",
            recognized: null,
        });
        mocks.tx.reviewLog.findUnique.mockResolvedValue({
            id: "log-1",
            cardId: "card-1",
            result: "pending",
            stageBefore: 2,
            card: { id: "card-1" },
        });
        mocks.tx.dictationSubmissionItem.findMany.mockResolvedValue([
            { judgedBy: "manual", manualCorrect: true, correct: true },
        ]);
    });

    const patch = (correct: boolean) =>
        PATCH(
            request("/api/dictation/submissions/sub-1", {
                method: "PATCH",
                body: JSON.stringify({ itemId: "item-1", correct }),
                headers: { "Content-Type": "application/json" },
            }),
            params
        );

    it("首次判对：写人工结论、按交卷模拟时间结算复习计划、批次转为已完成", async () => {
        expect((await patch(true)).status).toBe(200);

        expect(mocks.tx.dictationSubmissionItem.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    correct: true,
                    manualCorrect: true,
                    judgedBy: "manual",
                    gradedAt: gradingNow,
                }),
            })
        );
        expect(mocks.tx.reviewCard.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    stage: 3,
                    correctCount: { increment: 1 },
                    wrongCount: { increment: 0 },
                    lastReviewedAt: gradingNow,
                }),
            })
        );
        expect(mocks.tx.reviewLog.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ result: "correct", stageAfter: 3, mode: "handwriting" }),
            })
        );
        expect(mocks.tx.dictationSubmission.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    gradedCount: 1,
                    correctCount: 1,
                    status: "completed",
                    finishedAt: gradingNow,
                }),
            })
        );
    });

    it("改判：用新旧差值修正计数，不重复累加", async () => {
        mocks.tx.reviewLog.findUnique.mockResolvedValue({
            id: "log-1",
            cardId: "card-1",
            result: "wrong",
            stageBefore: 2,
            card: { id: "card-1" },
        });
        expect((await patch(true)).status).toBe(200);
        expect(mocks.tx.reviewCard.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    correctCount: { increment: 1 },
                    wrongCount: { increment: -1 },
                }),
            })
        );
    });

    it("重复点同一结论：计数不变化，阶段仍按出题时 stageBefore 重算", async () => {
        mocks.tx.reviewLog.findUnique.mockResolvedValue({
            id: "log-1",
            cardId: "card-1",
            result: "correct",
            stageBefore: 2,
            card: { id: "card-1" },
        });
        expect((await patch(true)).status).toBe(200);
        expect(mocks.tx.reviewCard.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    stage: 3,
                    correctCount: { increment: 0 },
                    wrongCount: { increment: 0 },
                }),
            })
        );
    });

    it("判错：复习计划回到第 0 阶，结果记为 wrong", async () => {
        expect((await patch(false)).status).toBe(200);
        expect(mocks.tx.reviewCard.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    stage: 0,
                    correctCount: { increment: 0 },
                    wrongCount: { increment: 1 },
                }),
            })
        );
        expect(mocks.tx.reviewLog.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ result: "wrong", stageAfter: 0 }),
            })
        );
    });

    it("还有未判字时批次保持待人工审核", async () => {
        mocks.tx.dictationSubmissionItem.findMany.mockResolvedValue([
            { judgedBy: "manual", manualCorrect: true, correct: true },
            { judgedBy: "ai", manualCorrect: null, correct: false },
        ]);
        expect((await patch(true)).status).toBe(200);
        expect(mocks.tx.dictationSubmission.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: AWAITING_REVIEW, gradedCount: 1, finishedAt: null }),
            })
        );
    });

    it("不是本人的提交返回 404，不写任何判定", async () => {
        mocks.tx.dictationSubmission.findUnique.mockResolvedValue({ userId: "someone-else", gradingNow });
        expect((await patch(true)).status).toBe(404);
        expect(mocks.tx.dictationSubmissionItem.update).not.toHaveBeenCalled();
    });
});
