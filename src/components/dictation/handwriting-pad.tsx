"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPadImage, buildStrokeAnimation, renderPadCanvas } from "@/lib/dictation/handwriting-animation";
import type { PadSnapshot, TimedPad, TimedStrokePoint } from "@/lib/dictation/handwriting-types";

function clonePad(pad: TimedPad): TimedPad {
    return pad.map((stroke) => stroke.map((point) => ({ ...point })));
}

export interface HandwritingPadHandle {
    clear: () => void;
    undo: () => void;
    /** 导出白底黑字成品图（供视觉模型判定） */
    toDataUrl: () => string;
    /** 导出本格完整快照：带时间轴的轨迹 + 成品图 + 书写过程动图 */
    snapshot: () => PadSnapshot | null;
}

interface HandwritingPadProps {
    disabled?: boolean;
    /** 切题回来时恢复之前写过的笔迹（配合 key 强制重挂载） */
    initialStrokes?: TimedPad;
    onStrokesChange?: (strokes: TimedPad) => void;
}

/** 田字格手写板：鼠标 / 触屏 / 手写笔通用。
 * 记录每笔轨迹点与相对时间（0~1 归一化坐标，y 向下），整轮交卷时统一导出。 */
export const HandwritingPad = forwardRef<HandwritingPadHandle, HandwritingPadProps>(
    function HandwritingPad({ disabled = false, initialStrokes, onStrokesChange }, ref) {
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const strokesRef = useRef<TimedPad>(clonePad(initialStrokes ?? []));
        const drawingRef = useRef(false);
        const startTimeRef = useRef<number | null>(null);
        const [hasInk, setHasInk] = useState((initialStrokes?.length ?? 0) > 0);
        const [strokeCount, setStrokeCount] = useState(initialStrokes?.length ?? 0);

        const emitChange = useCallback(() => {
            setStrokeCount(strokesRef.current.length);
            setHasInk(strokesRef.current.length > 0);
            onStrokesChange?.(strokesRef.current.map((s) => s.map((p) => ({ ...p }))));
        }, [onStrokesChange]);

        const redraw = useCallback(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            // 界面沿用主题前景色；导出图固定白底黑字
            const inkColor = getComputedStyle(canvas).color || "#333333";
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.strokeStyle = inkColor;
            ctx.lineWidth = Math.max(2, canvas.width / 160);
            ctx.strokeRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 1;
            ctx.setLineDash([canvas.width / 28, canvas.width / 28]);
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, 0);
            ctx.lineTo(canvas.width / 2, canvas.height);
            ctx.moveTo(0, canvas.height / 2);
            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.strokeStyle = inkColor;
            ctx.fillStyle = inkColor;
            ctx.lineWidth = canvas.width / 22;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            for (const stroke of strokesRef.current) {
                ctx.beginPath();
                stroke.forEach((p, i) => {
                    const x = p.x * canvas.width;
                    const y = p.y * canvas.height;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                if (stroke.length === 1) {
                    const p = stroke[0];
                    ctx.arc(p.x * canvas.width, p.y * canvas.height, ctx.lineWidth / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.stroke();
                }
            }
            ctx.restore();
        }, []);

        const pointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>): TimedStrokePoint => {
            const canvas = canvasRef.current!;
            const rect = canvas.getBoundingClientRect();
            const now = typeof performance !== "undefined" ? performance.now() : Date.now();
            if (startTimeRef.current === null) {
                // 恢复的笔迹已有时间戳，新笔画要从最后一笔之后继续，动图才不会倒放
                const lastTime = strokesRef.current.reduce(
                    (max, stroke) => stroke.reduce((m, p) => Math.max(m, p.t), max),
                    0
                );
                startTimeRef.current = now - lastTime;
            }
            return {
                x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
                y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
                t: Math.max(0, Math.round(now - startTimeRef.current)),
            };
        }, []);

        const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (disabled) return;
            e.preventDefault();
            canvasRef.current?.setPointerCapture(e.pointerId);
            drawingRef.current = true;
            strokesRef.current.push([pointFromEvent(e)]);
            redraw();
        };

        const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (!drawingRef.current || disabled) return;
            e.preventDefault();
            const stroke = strokesRef.current[strokesRef.current.length - 1];
            if (!stroke) return;
            const p = pointFromEvent(e);
            const last = stroke[stroke.length - 1];
            // 距离过近的点丢弃，减小数据量
            if (Math.hypot(p.x - last.x, p.y - last.y) < 0.004) return;
            stroke.push(p);
            redraw();
        };

        const endStroke = () => {
            if (!drawingRef.current) return;
            drawingRef.current = false;
            emitChange();
        };

        const undoOne = useCallback(() => {
            strokesRef.current.pop();
            if (strokesRef.current.length === 0) startTimeRef.current = null;
            redraw();
            emitChange();
        }, [redraw, emitChange]);

        const clearAll = useCallback(() => {
            strokesRef.current = [];
            startTimeRef.current = null;
            redraw();
            emitChange();
        }, [redraw, emitChange]);

        useImperativeHandle(
            ref,
            () => ({
                clear: clearAll,
                undo: undoOne,
                toDataUrl: () => buildPadImage(strokesRef.current),
                snapshot: () => {
                    const strokes = strokesRef.current;
                    if (strokes.length === 0) return null;
                    const copy: TimedPad = strokes.map((s) => s.map((p) => ({ ...p })));
                    return {
                        strokes: copy,
                        image: buildPadImage(copy),
                        animation: buildStrokeAnimation(copy),
                    };
                },
            }),
            [clearAll, undoOne]
        );

        return (
            <div className="flex flex-col items-center gap-2">
                <canvas
                    ref={(node) => {
                        canvasRef.current = node;
                        if (node) {
                            // 高分屏：2x 像素密度足够笔迹平滑
                            const side = node.clientWidth || 280;
                            node.width = side * 2;
                            node.height = side * 2;
                            redraw();
                        }
                    }}
                    className="aspect-square w-full max-w-[300px] touch-none select-none rounded-md bg-background"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endStroke}
                    onPointerCancel={endStroke}
                    onPointerLeave={endStroke}
                />
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">已写 {strokeCount} 笔</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || !hasInk}
                        onClick={undoOne}
                    >
                        <Undo2 className="mr-1 h-4 w-4" /> 撤销
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || !hasInk}
                        onClick={clearAll}
                    >
                        <Eraser className="mr-2 h-4 w-4" /> 重写
                    </Button>
                </div>
            </div>
        );
    }
);

/** 供详情回放使用：把轨迹画到指定画布 */
export function drawSnapshot(ctx: CanvasRenderingContext2D, strokes: TimedPad, size: number, upToTime?: number) {
    renderPadCanvas(ctx, strokes, size, { grid: true, upToTime });
}
