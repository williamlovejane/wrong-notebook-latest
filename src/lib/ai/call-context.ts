/**
 * AI 调用上下文：并发包装层为每次 AIService 方法调用挂上
 * 「调用原因 + 渠道 + 模型」，底层 HTTP 请求（fetch 记录器）
 * 据此给每条 AiCallLog 归因。
 *
 * AsyncLocalStorage 实例挂到 globalThis，避免 Next 热重载时
 * 出现两个模块实例导致上下文对不上。
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface AiCallContext {
    /** 调用原因：AIService 方法名，如 analyzeImage、gradeAnswer */
    reason: string;
    /** 渠道名：gemini | openai | azure | anthropic | minimax-code | vendor 名 */
    provider: string;
    /** 并发 key 中解析出的默认模型名（请求体里的 model 更准，作兜底） */
    model?: string;
}

const globalStore = globalThis as typeof globalThis & {
    __aiCallAls?: AsyncLocalStorage<AiCallContext>;
};

const als = (globalStore.__aiCallAls ??= new AsyncLocalStorage<AiCallContext>());

/** 在 AI 调用上下文中执行任务（内部 SDK 发出的 HTTP 请求都能读到） */
export function runInAiCall<T>(ctx: AiCallContext, task: () => Promise<T>): Promise<T> {
    return als.run(ctx, task);
}

/** 当前 HTTP 请求是否处于某次 AI 调用中；不在则返回 null（fetch 记录器据此透传） */
export function currentAiCall(): AiCallContext | null {
    return als.getStore() ?? null;
}
