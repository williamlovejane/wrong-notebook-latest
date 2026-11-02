import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";

/**
 * 遗忘曲线复习间隔（天）。
 * 与 src/lib/scheduler.ts 的设计保持一致，但这里真正被调度逻辑调用。
 * stage 0 -> 1 天后首次复习，逐级递增，最后一阶之后进入维护期。
 */
export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30] as const;

export const MAX_STAGE = REVIEW_INTERVALS.length - 1;

export type CardStatus = "active" | "mastered" | "suspended";

export interface ScheduleResult {
    stage: number;
    status: CardStatus;
    dueAt: Date;
}

/** 新建词条时，首次复习安排在 1 天后 */
export function initialDueDate(now: Date = new Date()): Date {
    return addDays(now, REVIEW_INTERVALS[0]);
}

/** 某个阶段对应的间隔天数 */
export function intervalDays(stage: number): number {
    if (stage < 0) return REVIEW_INTERVALS[0];
    return REVIEW_INTERVALS[Math.min(stage, MAX_STAGE)];
}

/**
 * 判分后推进复习计划。
 * - 答对：升一阶，按新阶段的间隔安排下次复习；超过最后一阶则标记为已掌握（30 天维护）
 * - 答错：回到第一阶，1 天后再来
 */
export function scheduleAfterReview(
    currentStage: number,
    correct: boolean,
    now: Date = new Date()
): ScheduleResult {
    if (!correct) {
        return {
            stage: 0,
            status: "active",
            dueAt: addDays(now, REVIEW_INTERVALS[0]),
        };
    }

    const nextStage = currentStage + 1;

    if (nextStage > MAX_STAGE) {
        return {
            stage: MAX_STAGE,
            status: "mastered",
            dueAt: addDays(now, REVIEW_INTERVALS[MAX_STAGE]),
        };
    }

    return {
        stage: nextStage,
        status: "active",
        dueAt: addDays(now, REVIEW_INTERVALS[nextStage]),
    };
}

export interface StageDescription {
    label: string;
    intervalDays: number;
    isMaintenance: boolean;
}

export function describeStage(stage: number, status: CardStatus): StageDescription {
    if (status === "mastered") {
        return {
            label: "已掌握 · 30 天维护复习",
            intervalDays: REVIEW_INTERVALS[MAX_STAGE],
            isMaintenance: true,
        };
    }

    const safeStage = Math.max(0, Math.min(stage, MAX_STAGE));
    return {
        label: `第 ${safeStage + 1} 阶 · ${REVIEW_INTERVALS[safeStage]} 天后复习`,
        intervalDays: REVIEW_INTERVALS[safeStage],
        isMaintenance: false,
    };
}

/** 是否到期（按自然日判断，今天到期即算到期） */
export function isDue(dueAt: Date | string, now: Date = new Date()): boolean {
    const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
    return differenceInCalendarDays(startOfDay(due), startOfDay(now)) <= 0;
}

/** 逾期天数，用于在界面上标注"拖了几天" */
export function overdueDays(dueAt: Date | string, now: Date = new Date()): number {
    const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
    return Math.max(0, differenceInCalendarDays(startOfDay(now), startOfDay(due)));
}
