/**
 * 当前学期推导：由注册信息（educationStage + enrollmentYear）
 * 算出孩子现在读到几年级第几学期。
 *
 * 独立成纯函数模块，供客户端组件（dictation 页面提示文案）和
 * 服务端（quiz 出题）共用；不要在客户端导入 lib/yuwen/db.ts
 * （内含 better-sqlite3 原生模块）。
 */

export interface SemesterRef {
    grade: number;
    semester: "上" | "下";
}

/**
 * 中国学制：9 月开学。2025 年 9 月入学 → 2025.9-2026.1 为一年级上，
 * 2026 春季学期为一年级下，2026 年 9 月升二年级上。
 * 学段非小学或缺入学年份时返回大年级（9下）——组词范围即库内全部字。
 */
export function currentSemesterFromProfile(
    educationStage?: string | null,
    enrollmentYear?: number | null
): SemesterRef {
    if (!educationStage || educationStage !== "primary" || !enrollmentYear) {
        return { grade: 9, semester: "下" };
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    if (month >= 9) {
        // 秋季学期：9-12 月
        return { grade: year - enrollmentYear + 1, semester: "上" };
    }
    // 春季学期（1-6 月）与暑假（7-8 月，视为刚结束的春季学期）
    return { grade: year - enrollmentYear, semester: "下" };
}
