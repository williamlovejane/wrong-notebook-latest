/**
 * 手写笔迹的静态图与书写过程动图。
 * 只在浏览器调用（依赖 canvas）；轨迹本身单独存库，动图用于交卷后回看。
 */
import { GIFEncoder, applyPalette, type RGB } from "gifenc";
import type { TimedPad } from "./handwriting-types";

/** 动图边长，足够看清笔形又控制体积 */
export const ANIMATION_SIZE = 256;
/** 成品图边长，供批量视觉模型判定 */
export const EXPORT_SIZE = 512;

/** 固定四色调色板，避免逐帧量化，编码快且 GIF 体积小 */
const PALETTE: RGB[] = [
    [255, 255, 255], // 白底
    [221, 221, 221], // 田字格虚线
    [17, 17, 17], // 笔迹
    [150, 150, 150], // 外框
];
const WHITE = "#ffffff";
const GRID = "#dddddd";
const INK = "#111111";
const BORDER = "#969696";

interface RenderOptions {
    /** 是否画田字格；判分用图不画，动图与界面画 */
    grid?: boolean;
    /** 只绘制 t <= 该时刻的轨迹点，用于逐帧回放书写过程 */
    upToTime?: number;
}

/** 把一组笔画画到 ctx；调用方负责创建画布，这里不触碰 DOM */
export function renderPadCanvas(
    ctx: CanvasRenderingContext2D,
    strokes: TimedPad,
    size: number,
    options: RenderOptions = {}
): void {
    const { grid = true, upToTime } = options;
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, size, size);

    if (grid) {
        ctx.save();
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.setLineDash([size / 28, size / 28]);
        ctx.beginPath();
        ctx.moveTo(size / 2, 0);
        ctx.lineTo(size / 2, size);
        ctx.moveTo(0, size / 2);
        ctx.lineTo(size, size / 2);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = BORDER;
        ctx.lineWidth = Math.max(1, size / 160);
        ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    }

    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = size / 22;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
        const visible = upToTime === undefined ? stroke : stroke.filter((p) => p.t <= upToTime);
        if (visible.length === 0) continue;
        ctx.beginPath();
        visible.forEach((p, i) => {
            const x = p.x * size;
            const y = p.y * size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        if (visible.length === 1) {
            const p = visible[0];
            ctx.arc(p.x * size, p.y * size, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.stroke();
        }
    }
}

function createCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return ctx ? { canvas, ctx } : null;
}

/** 成品静态图：白底黑字、无网格，交给视觉模型时干扰最少 */
export function buildPadImage(strokes: TimedPad, size = EXPORT_SIZE): string {
    const created = createCanvas(size);
    if (!created) return "";
    renderPadCanvas(created.ctx, strokes, size, { grid: false });
    return created.canvas.toDataURL("image/png");
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/** 按时间轴逐帧重绘笔迹，生成可循环的书写过程 GIF dataURL */
export function buildStrokeAnimation(strokes: TimedPad, size = ANIMATION_SIZE): string {
    const created = createCanvas(size);
    if (!created) return "";
    const { ctx } = created;

    const total = strokes.reduce(
        (max, stroke) => stroke.reduce((m, p) => Math.max(m, p.t), max),
        600
    );
    const steps = Math.min(24, Math.max(5, Math.ceil(total / 160) + 1));
    const frameDelay = Math.max(60, Math.round(total / (steps - 1)));

    const gif = GIFEncoder();
    for (let k = 0; k < steps; k++) {
        const upToTime = (total * k) / (steps - 1);
        renderPadCanvas(ctx, strokes, size, { grid: true, upToTime });
        const { data } = ctx.getImageData(0, 0, size, size);
        const index = applyPalette(data, PALETTE);
        gif.writeFrame(index, size, size, {
            palette: PALETTE,
            delay: k === steps - 1 ? 900 : frameDelay,
            repeat: 0,
        });
    }
    gif.finish();
    return `data:image/gif;base64,${bytesToBase64(gif.bytes())}`;
}
