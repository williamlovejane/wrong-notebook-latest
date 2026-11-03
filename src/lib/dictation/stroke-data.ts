/**
 * 服务端按需读取 hanzi-writer-data 的标准笔顺数据。
 * 数据包不会被 Next standalone 自动追踪，Dockerfile 已显式 COPY 到
 * node_modules，这里统一从 process.cwd()/node_modules 读取。
 */
import { readFile } from "fs/promises";
import path from "path";
import { createLogger } from "@/lib/logger";
import type { StandardMedians } from "./stroke-match";

const logger = createLogger("dictation:stroke-data");

const cache = new Map<string, StandardMedians | null>();

/** 读取某字的标准笔顺；字不在标准库或读取失败时返回 null（调用方降级 AI 复核） */
export async function loadStandardMedians(char: string): Promise<StandardMedians | null> {
    if (cache.has(char)) return cache.get(char)!;
    if (!/^[\u4e00-\u9fff]$/.test(char)) {
        cache.set(char, null);
        return null;
    }

    const file = path.join(process.cwd(), "node_modules", "hanzi-writer-data", `${char}.json`);
    try {
        const raw = await readFile(file, "utf-8");
        const data = JSON.parse(raw) as { medians?: StandardMedians };
        const medians = Array.isArray(data.medians) ? data.medians : null;
        cache.set(char, medians);
        return medians;
    } catch {
        logger.warn({ char }, "hanzi-writer-data 中无该字的笔顺数据");
        cache.set(char, null);
        return null;
    }
}
