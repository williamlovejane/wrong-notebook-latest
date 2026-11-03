/**
 * 手写笔顺匹配：把用户在田字格里的笔画轨迹与 hanzi-writer-data 的标准
 * 笔画中心线（medians）做归一化比对，判定笔顺（含字形）是否正确。
 *
 * 坐标约定：
 * - 用户笔画：画布归一化坐标 0~1，y 向下（canvas 习惯）。
 * - 标准数据：1024×1024 字面，y 向上（Make Me a Hanzi 原始坐标系）。
 * 匹配前统一折算到标准坐标系，并按整体包围盒对齐（等比缩放 + 平移），
 * 因此写字偏大偏小、偏左偏右不影响判定。
 */

export interface StrokePoint {
    x: number;
    y: number;
}

/** 用户一笔的轨迹点（画布坐标 0~1，y 向下），抬笔分笔画 */
export type UserStroke = StrokePoint[];

export interface StrokeMatchResult {
    /** 笔画数与标准一致 */
    strokeCountOk: boolean;
    /** 按书写顺序逐笔匹配的平均误差（0~1，越小越准） */
    score: number;
    /** 忽略书写顺序、允许单笔反向时最优配对的最大单笔误差（区分"笔顺错"与"字形错"） */
    bestScore: number;
    /** 笔顺（含笔画形状与方向）是否正确 */
    ok: boolean;
    /** 每一笔与标准对应笔的平均误差（0~1） */
    perStroke: number[];
}

/** 标准数据：每个字一组笔画，每笔为标准坐标系下的中心线点阵 */
export type StandardMedians = number[][][];

const EM = 1024;
/** 每笔重采样点数 */
const RESAMPLE_N = 16;
/** 顺序匹配通过阈值：逐笔平均误差占字面比例上限 */
const MEAN_TOLERANCE = 0.08;
/** 顺序匹配通过阈值：任何单笔误差不得超过该值（防均值被稀释） */
const MAX_TOLERANCE = 0.18;
/** 字形判定阈值：忽略顺序后最优配对的最大误差低于该值视为"字形没问题、只是顺序/方向不对" */
export const SHAPE_TOLERANCE = 0.25;

interface Pt {
    x: number;
    y: number;
}

/** 按弧长把折线重采样为 n 个等距点 */
function resample(points: Pt[], n: number): Pt[] {
    if (points.length === 0) {
        return Array.from({ length: n }, () => ({ x: 0, y: 0 }));
    }
    if (points.length === 1) {
        return Array.from({ length: n }, () => ({ x: points[0].x, y: points[0].y }));
    }

    const segLens: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        const len = Math.hypot(dx, dy);
        segLens.push(len);
        total += len;
    }

    if (total === 0) {
        return Array.from({ length: n }, () => ({ x: points[0].x, y: points[0].y }));
    }

    const out: Pt[] = [];
    let seg = 0;
    let acc = 0;
    for (let k = 0; k < n; k++) {
        const target = (total * k) / (n - 1);
        while (seg < segLens.length - 1 && acc + segLens[seg] < target) {
            acc += segLens[seg];
            seg++;
        }
        const t = segLens[seg] === 0 ? 0 : (target - acc) / segLens[seg];
        out.push({
            x: points[seg].x + (points[seg + 1].x - points[seg].x) * t,
            y: points[seg].y + (points[seg + 1].y - points[seg].y) * t,
        });
    }
    return out;
}

function bboxOf(strokes: Pt[][]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of strokes) {
        for (const p of s) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
    }
    return { minX, minY, maxX, maxY };
}

interface NormStroke {
    points: Pt[];
    start: Pt;
    end: Pt;
}

/**
 * 把一组笔画归一化到标准字面坐标系：等比缩放（对角线比例）+ 中心对齐。
 * base 为参照包围盒（标准数据），strokes 为待归一化笔画。
 */
function normalize(strokes: Pt[][], base: { minX: number; minY: number; maxX: number; maxY: number }): NormStroke[] {
    const ub = bboxOf(strokes);
    const uw = ub.maxX - ub.minX;
    const uh = ub.maxY - ub.minY;
    const ud = Math.hypot(uw, uh);
    const sd = Math.hypot(base.maxX - base.minX, base.maxY - base.minY);
    const s = ud === 0 ? 1 : Math.min(3, Math.max(0.3, sd / ud));
    const ucx = (ub.minX + ub.maxX) / 2;
    const ucy = (ub.minY + ub.maxY) / 2;
    const scx = (base.minX + base.maxX) / 2;
    const scy = (base.minY + base.maxY) / 2;

    return strokes.map((stroke) => {
        const scaled = stroke.map((p) => ({
            x: (p.x - ucx) * s + scx,
            y: (p.y - ucy) * s + scy,
        }));
        const pts = resample(scaled, RESAMPLE_N);
        return { points: pts, start: pts[0], end: pts[pts.length - 1] };
    });
}

/** 两笔重采样点阵的平均欧氏距离（归一化到字面比例） */
function strokeDistance(a: NormStroke, b: NormStroke): number {
    let sum = 0;
    for (let i = 0; i < RESAMPLE_N; i++) {
        sum += Math.hypot(a.points[i].x - b.points[i].x, a.points[i].y - b.points[i].y);
    }
    return sum / RESAMPLE_N / EM;
}

/** 起止向量夹角：-1 完全反向，1 同向 */
function directionCos(a: NormStroke, b: NormStroke): number {
    const ax = a.end.x - a.start.x;
    const ay = a.end.y - a.start.y;
    const bx = b.end.x - b.start.x;
    const by = b.end.y - b.start.y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la === 0 || lb === 0) return 1;
    return (ax * bx + ay * by) / (la * lb);
}

function medianToNormStroke(median: Pt[]): NormStroke {
    const pts = resample(median, RESAMPLE_N);
    return { points: pts, start: pts[0], end: pts[pts.length - 1] };
}

/** 全排列（笔画数少时用穷举找最优匹配；≤7 笔开销可控） */
function permutations(n: number): number[][] {
    if (n <= 1) return [n === 0 ? [] : [0]];
    const out: number[][] = [];
    const permute = (arr: number[], cur: number[]) => {
        if (arr.length === 0) {
            out.push([...cur]);
            return;
        }
        for (let i = 0; i < arr.length; i++) {
            cur.push(arr[i]);
            permute([...arr.slice(0, i), ...arr.slice(i + 1)], cur);
            cur.pop();
        }
    };
    permute(Array.from({ length: n }, (_, i) => i), []);
    return out;
}

/** 忽略顺序 + 允许单笔反向的最优配对；返回配对中最大的单笔误差（衡量"最差的一笔"） */
function bestAssignmentScore(user: NormStroke[], std: NormStroke[]): number {
    const n = user.length;
    // 两两距离：取正反两个方向中较小者
    const cost: number[][] = user.map((u) =>
        std.map((s) => Math.min(strokeDistance(u, s), strokeDistanceReverse(u, s)))
    );

    const scoreOf = (pick: (i: number) => number): number => {
        let worst = 0;
        for (let i = 0; i < n; i++) worst = Math.max(worst, cost[i][pick(i)]);
        return worst;
    };

    if (n <= 7) {
        let best = Infinity;
        for (const perm of permutations(n)) {
            best = Math.min(best, scoreOf((i) => perm[i]));
        }
        return best;
    }

    // 笔画太多时用贪心：反复取当前最小代价配对
    const usedUser = new Set<number>();
    const usedStd = new Set<number>();
    const pairs: { i: number; j: number; c: number }[] = [];
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) pairs.push({ i, j, c: cost[i][j] });
    }
    pairs.sort((a, b) => a.c - b.c);
    let worst = 0;
    let count = 0;
    for (const p of pairs) {
        if (usedUser.has(p.i) || usedStd.has(p.j)) continue;
        usedUser.add(p.i);
        usedStd.add(p.j);
        worst = Math.max(worst, p.c);
        count++;
        if (count === n) break;
    }
    return count === 0 ? Infinity : worst;
}

function strokeDistanceReverse(a: NormStroke, b: NormStroke): number {
    const reversed: NormStroke = {
        points: [...b.points].reverse(),
        start: b.end,
        end: b.start,
    };
    return strokeDistance(a, reversed);
}

/**
 * 判定用户手写笔顺是否与标准一致。
 * userStrokes 为空或标准数据为空时返回不可判定（ok=false，调用方走 AI 复核）。
 */
export function matchStrokeOrder(userStrokes: UserStroke[], medians: StandardMedians): StrokeMatchResult {
    const empty = {
        strokeCountOk: false,
        score: 1,
        bestScore: 1,
        ok: false,
        perStroke: [],
    };
    const cleaned = userStrokes
        .map((s) => s.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
        .filter((s) => s.length > 0);
    if (cleaned.length === 0 || medians.length === 0) return empty;

    // 用户画布坐标（y 向下）折算到标准坐标系：翻转 y 并放大到字面
    const converted: Pt[][] = cleaned.map((stroke) =>
        stroke.map((p) => ({ x: p.x * EM, y: (1 - p.y) * EM }))
    );

    const stdRaw: Pt[][] = medians.map((m) => m.map(([x, y]) => ({ x, y })));
    const sb = bboxOf(stdRaw);

    const user = normalize(converted, sb);
    const std = stdRaw.map(medianToNormStroke);

    const strokeCountOk = user.length === std.length;
    if (!strokeCountOk) {
        return {
            strokeCountOk: false,
            score: 1,
            bestScore: bestAssignmentScore(user, std),
            ok: false,
            perStroke: [],
        };
    }

    const perStroke = user.map((u, i) => strokeDistance(u, std[i]));
    const score = perStroke.reduce((a, b) => a + b, 0) / perStroke.length;
    const maxStroke = Math.max(...perStroke);
    const bestScore = bestAssignmentScore(user, std);

    const dirOk = user.every((u, i) => directionCos(u, std[i]) > -0.3);

    return {
        strokeCountOk,
        score,
        bestScore,
        ok: score < MEAN_TOLERANCE && maxStroke < MAX_TOLERANCE && dirOk,
        perStroke,
    };
}
