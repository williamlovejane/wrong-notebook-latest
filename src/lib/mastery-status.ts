import type { Prisma } from "@prisma/client";

/**
 * 错题的复习状态，由举一反三记录与掌握概率推导：
 * - new（待复习）：还没有举一反三记录
 * - reviewing（复习中）：有记录，掌握概率低于阈值或尚未评估
 * - mastered（已掌握）：有记录，掌握概率达到阈值
 */
export type MasteryStatus = 'new' | 'reviewing' | 'mastered';

export const MASTERY_STATUSES: readonly MasteryStatus[] = ['new', 'reviewing', 'mastered'];

/** 默认已掌握阈值（百分比），每个用户可在设置中单独调整 */
export const DEFAULT_MASTERY_THRESHOLD = 50;
export const MIN_MASTERY_THRESHOLD = 1;
export const MAX_MASTERY_THRESHOLD = 100;

/** 阈值以百分比保存，掌握概率为 0~1 */
function probabilityOf(threshold: number): number {
    return threshold / 100;
}

export function isMastered(masteryProbability: number | null | undefined, threshold = DEFAULT_MASTERY_THRESHOLD): boolean {
    return typeof masteryProbability === 'number' && masteryProbability >= probabilityOf(threshold);
}

export function isMasteryStatus(value: unknown): value is MasteryStatus {
    return typeof value === 'string' && (MASTERY_STATUSES as readonly string[]).includes(value);
}

// 只有录入了结果的记录才算举一反三记录
const HAS_PRACTICE_RECORDS: Prisma.ErrorItemWhereInput = { practiceRecords: { some: { result: { not: null } } } };

/** 查询某一复习状态的错题条件，合并到其他条件时放进 AND；threshold 为错题所属用户的已掌握阈值 */
export function masteryStatusWhere(status: MasteryStatus, threshold = DEFAULT_MASTERY_THRESHOLD): Prisma.ErrorItemWhereInput {
    if (status === 'new') {
        return { practiceRecords: { none: { result: { not: null } } } };
    }
    if (status === 'mastered') {
        return { ...HAS_PRACTICE_RECORDS, masteryProbability: { gte: probabilityOf(threshold) } };
    }
    return {
        ...HAS_PRACTICE_RECORDS,
        OR: [{ masteryProbability: null }, { masteryProbability: { lt: probabilityOf(threshold) } }],
    };
}

/** 统计举一反三记录数，配合 masteryStatusOf 使用 */
export const PRACTICE_RECORD_COUNT = {
    select: { practiceRecords: { where: { result: { not: null } } } },
} satisfies Prisma.ErrorItemCountOutputTypeDefaultArgs;

export function masteryStatusOf(practiceRecordCount: number, masteryProbability: number | null | undefined, threshold = DEFAULT_MASTERY_THRESHOLD): MasteryStatus {
    if (practiceRecordCount === 0) {
        return 'new';
    }
    return isMastered(masteryProbability, threshold) ? 'mastered' : 'reviewing';
}

/** 与 schema 中 masteryLevel 的约定一致：0 待复习，1 复习中，2 已掌握 */
export function masteryLevelOf(status: MasteryStatus): number {
    return MASTERY_STATUSES.indexOf(status);
}
