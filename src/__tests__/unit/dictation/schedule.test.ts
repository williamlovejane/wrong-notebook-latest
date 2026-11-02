import { describe, it, expect } from "vitest";
import { addDays, differenceInCalendarDays } from "date-fns";
import {
    REVIEW_INTERVALS,
    MAX_STAGE,
    initialDueDate,
    intervalDays,
    scheduleAfterReview,
    describeStage,
    isDue,
    overdueDays,
} from "@/lib/dictation/schedule";

const NOW = new Date("2026-10-31T10:00:00Z");

describe("遗忘曲线调度", () => {
    it("间隔序列为 1/2/4/7/15/30 天", () => {
        expect([...REVIEW_INTERVALS]).toEqual([1, 2, 4, 7, 15, 30]);
        expect(MAX_STAGE).toBe(5);
    });

    it("新建词条 1 天后首次复习", () => {
        const due = initialDueDate(NOW);
        expect(differenceInCalendarDays(due, NOW)).toBe(1);
    });

    it("答对升一阶，按新阶段间隔安排", () => {
        const r = scheduleAfterReview(0, true, NOW);
        expect(r.stage).toBe(1);
        expect(r.status).toBe("active");
        expect(differenceInCalendarDays(r.dueAt, NOW)).toBe(2);
    });

    it("答对逐级递增到 30 天", () => {
        expect(intervalDays(0)).toBe(1);
        expect(intervalDays(1)).toBe(2);
        expect(intervalDays(2)).toBe(4);
        expect(intervalDays(3)).toBe(7);
        expect(intervalDays(4)).toBe(15);
        expect(intervalDays(5)).toBe(30);
    });

    it("最后一阶答对后进入已掌握，30 天维护", () => {
        const r = scheduleAfterReview(MAX_STAGE, true, NOW);
        expect(r.status).toBe("mastered");
        expect(r.stage).toBe(MAX_STAGE);
        expect(differenceInCalendarDays(r.dueAt, NOW)).toBe(30);
    });

    it("答错回到第一阶，1 天后重来", () => {
        const r = scheduleAfterReview(4, false, NOW);
        expect(r.stage).toBe(0);
        expect(r.status).toBe("active");
        expect(differenceInCalendarDays(r.dueAt, NOW)).toBe(1);
    });

    it("阶段描述可读", () => {
        expect(describeStage(0, "active").label).toContain("1 天后");
        expect(describeStage(2, "active").label).toContain("4 天后");
        expect(describeStage(5, "mastered").label).toContain("已掌握");
    });

    it("到期判断按自然日", () => {
        expect(isDue(addDays(NOW, -1), NOW)).toBe(true);
        expect(isDue(NOW, NOW)).toBe(true);
        expect(isDue(addDays(NOW, 1), NOW)).toBe(false);
        expect(overdueDays(addDays(NOW, -3), NOW)).toBe(3);
    });
});
