import { describe, expect, it } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { matchStrokeOrder, type StrokePoint, type StandardMedians } from "@/lib/dictation/stroke-match";

/** 从本机安装的 hanzi-writer-data 读真实标准数据 */
async function loadMedians(char: string): Promise<StandardMedians> {
    const file = path.join(process.cwd(), "node_modules", "hanzi-writer-data", `${char}.json`);
    const data = JSON.parse(await readFile(file, "utf-8")) as { medians: StandardMedians };
    return data.medians;
}

/** 标准笔画 → 画布坐标（0~1，y 向下）：完整可用作"标准写法"的用户输入 */
function mediansToUserStrokes(medians: StandardMedians, jitter = 0): StrokePoint[][] {
    // 先算整体包围盒，把标准坐标缩放回 0~1 画布（模拟孩子写满格子）
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of medians) {
        for (const [x, y] of m) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
    }
    const size = Math.max(maxX - minX, maxY - minY);
    const toCanvas = ([x, y]: number[]): StrokePoint => {
        const nx = (x - minX) / size;
        // 标准 y 向上，画布 y 向下
        const ny = 1 - (y - minY) / size;
        return {
            x: Math.min(1, Math.max(0, nx + (Math.random() * 2 - 1) * jitter)),
            y: Math.min(1, Math.max(0, ny + (Math.random() * 2 - 1) * jitter)),
        };
    };
    return medians.map((m) => m.map(toCanvas));
}

/** 简单可复现的伪随机数，避免测试抖动 */
let seed = 42;
function rand(): number {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
}

function withJitter(strokes: StrokePoint[][], amount: number): StrokePoint[][] {
    return strokes.map((s) => s.map((p) => ({ x: p.x + (rand() * 2 - 1) * amount, y: p.y + (rand() * 2 - 1) * amount })));
}

function swapStrokes(strokes: StrokePoint[][], i: number, j: number): StrokePoint[][] {
    const copy = strokes.map((s) => [...s]);
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
}

function reverseStroke(strokes: StrokePoint[][], i: number): StrokePoint[][] {
    return strokes.map((s, k) => (k === i ? [...s].reverse() : s));
}

describe("matchStrokeOrder", () => {
    it("标准写法（含抖动）判为笔顺正确", async () => {
        for (const char of ["中", "花", "我", "园"]) {
            const medians = await loadMedians(char);
            seed = 42;
            const strokes = withJitter(mediansToUserStrokes(medians), 0.015);
            const r = matchStrokeOrder(strokes, medians);
            expect(r.ok, `${char} score=${r.score.toFixed(4)} per=${r.perStroke.map((v) => v.toFixed(3)).join(",")}`).toBe(true);
            expect(r.strokeCountOk).toBe(true);
        }
    });

    it("缩小 + 平移不影响判定", async () => {
        const medians = await loadMedians("回");
        const strokes = mediansToUserStrokes(medians).map((s) =>
            s.map((p) => ({ x: p.x * 0.45 + 0.3, y: p.y * 0.45 + 0.35 }))
        );
        const r = matchStrokeOrder(strokes, medians);
        expect(r.ok).toBe(true);
    });

    it("两笔交换顺序：字形匹配仍可但笔顺判错", async () => {
        const medians = await loadMedians("花");
        const strokes = mediansToUserStrokes(medians);
        const swapped = swapStrokes(strokes, 0, 1);
        const r = matchStrokeOrder(swapped, medians);
        expect(r.strokeCountOk).toBe(true);
        expect(r.ok).toBe(false);
        // 忽略顺序的最优配对仍然不差 → 属于"笔顺不对"而非"字形不对"
        expect(r.bestScore).toBeLessThan(0.25);
    });

    it("单笔写反方向：笔顺判错", async () => {
        const medians = await loadMedians("中");
        const strokes = reverseStroke(mediansToUserStrokes(medians), 2);
        const r = matchStrokeOrder(strokes, medians);
        expect(r.ok).toBe(false);
    });

    it("缺一笔：笔画数不匹配，判错", async () => {
        const medians = await loadMedians("花");
        const strokes = mediansToUserStrokes(medians).slice(1);
        const r = matchStrokeOrder(strokes, medians);
        expect(r.strokeCountOk).toBe(false);
        expect(r.ok).toBe(false);
    });

    it("多笔画字缺半截（乱画）：顺序匹配与最优匹配都差", async () => {
        const medians = await loadMedians("我");
        const strokes = mediansToUserStrokes(medians);
        // 把第一笔整个挪到格子右下角，模拟笔画位置完全错误
        const broken = strokes.map((s, i) =>
            i === 0 ? s.map((p) => ({ x: 0.7 + p.x * 0.1, y: 0.7 + p.y * 0.1 })) : s
        );
        const r = matchStrokeOrder(broken, medians);
        expect(r.ok).toBe(false);
        expect(r.bestScore).toBeGreaterThan(0.18);
    });

    it("空输入或空标准数据：不可判定", () => {
        const r = matchStrokeOrder([], []);
        expect(r.ok).toBe(false);
        expect(r.strokeCountOk).toBe(false);
    });
});
