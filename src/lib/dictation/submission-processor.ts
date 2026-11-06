import "server-only";

/**
 * 手写听写已改为「全部人工判卷」，不再有后台自动判分任务。
 *
 * 因此这里不再调用视觉模型、不再做笔迹轨迹比对、也不消耗 AI 额度：
 * 交卷时批次直接落成 awaiting_review，复习计划只在人工判定那一题时由
 * `api/dictation/submissions/[id]` 的 PATCH 结算。
 *
 * 本模块只保留一个状态归一函数：旧版本备份或历史数据里可能残留
 * pending / grading 批次，它们不会再有后台任务来推进，统一归到
 * awaiting_review，让这些字也能出现在「今日提交」里被人工审核。
 */
import { prisma } from "@/lib/prisma";
import { AWAITING_REVIEW } from "./handwriting-types";

/** 历史中断任务归一为待人工审核；不再调度任何后台判分 */
export async function resumeIfStalled(id: string): Promise<void> {
    await prisma.dictationSubmission.updateMany({
        where: { id, status: { in: ["pending", "grading"] } },
        data: { status: AWAITING_REVIEW, heartbeatAt: null, error: null },
    });
}
