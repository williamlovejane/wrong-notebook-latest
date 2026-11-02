import { getDayRange, shiftCalendarDate } from "@/lib/date-time";

/** 艾宾浩斯复习间隔（天）：连续做对一次进入下一档，做错回到第一档 */
export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30] as const;

export interface ReviewRecord {
    result: string | null;
    createdAt: Date;
}

export interface ReviewPlan {
    /** 当前所在档位，等于末尾连续做对的次数 */
    stage: number;
    /** 下次复习时间；已完成全部间隔时为 null */
    nextReviewAt: Date | null;
}

/**
 * 根据作答历史推算复习计划：以最近一次作答（没有作答时以录入时间）为起点，
 * 加上当前档位的间隔。未作答（not_attempted）的记录不影响计划。
 */
export function getReviewPlan(itemCreatedAt: Date, records: ReviewRecord[], timeZone: string): ReviewPlan {
    const answered = records
        .filter((record) => record.result === "correct" || record.result === "wrong")
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let stage = 0;
    for (let i = answered.length - 1; i >= 0 && answered[i].result === "correct"; i--) {
        stage++;
    }

    if (stage >= REVIEW_INTERVALS.length) {
        return { stage, nextReviewAt: null };
    }

    const last = answered.at(-1)?.createdAt ?? itemCreatedAt;
    // 按日历日安排：到期当天的零点起即可复习
    const nextReviewAt = getDayRange(shiftCalendarDate(last, timeZone, REVIEW_INTERVALS[stage]), timeZone).start;
    return { stage, nextReviewAt };
}

/** 下次复习时间不晚于今天（应用时区）即为到期 */
export function isReviewDue(plan: ReviewPlan, timeZone: string, now = new Date()): boolean {
    return plan.nextReviewAt !== null && plan.nextReviewAt < getDayRange(now, timeZone).end;
}
