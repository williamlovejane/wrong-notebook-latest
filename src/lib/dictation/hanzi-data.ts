import "server-only";

/**
 * 服务端按需读取 hanzi-writer-data 的标准笔顺数据。
 *
 * 数据包不会被 Next standalone 自动追踪，Dockerfile 已显式 COPY 到
 * node_modules，这里统一从 process.cwd()/node_modules 读取，避免运行时依赖外部 CDN。
 * 生僻字或数据损坏时返回 null，前端降级为「无标准笔顺」，不影响判卷。
 */
import { readFile } from "fs/promises";
import path from "path";
import { createLogger } from "@/lib/logger";
import { isStandardStrokeChar, type HanziCharacterData } from "./handwriting-types";

const logger = createLogger("dictation:hanzi-data");

/** 常驻内存的字形缓存：一个字只有几 KB，判卷页同屏多字会反复请求 */
const cache = new Map<string, HanziCharacterData | null>();

export async function loadHanziData(char: string): Promise<HanziCharacterData | null> {
    if (!isStandardStrokeChar(char)) return null;
    const cached = cache.get(char);
    if (cached !== undefined) return cached;

    const file = path.join(process.cwd(), "node_modules", "hanzi-writer-data", `${char}.json`);
    try {
        const parsed = JSON.parse(await readFile(file, "utf-8")) as Partial<HanziCharacterData>;
        if (!Array.isArray(parsed.strokes) || parsed.strokes.length === 0 || !Array.isArray(parsed.medians)) {
            throw new Error("笔顺数据格式不完整");
        }
        const data: HanziCharacterData = {
            strokes: parsed.strokes,
            medians: parsed.medians,
            ...(Array.isArray(parsed.radStrokes) ? { radStrokes: parsed.radStrokes } : {}),
        };
        cache.set(char, data);
        return data;
    } catch (error) {
        logger.warn(
            { char, reason: error instanceof Error ? error.message : String(error) },
            "该字没有可用的标准笔顺数据"
        );
        cache.set(char, null);
        return null;
    }
}
