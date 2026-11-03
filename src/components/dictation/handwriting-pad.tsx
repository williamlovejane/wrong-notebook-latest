"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserStroke } from "@/lib/dictation/stroke-match";

export interface HandwritingPadHandle {
    clear: () => void;
    undo: () => void;
    /** 导出白底田字格 + 笔迹的 PNG dataURL（供 AI 识别） */
    toDataUrl: () => string;
}

interface HandwritingPadProps {
    disabled?: boolean;
    onStrokesChange?: (strokes: UserStroke[]) => void;
}

/** 逻辑画布边长（导出给 AI 识别用的分辨率） */
const EXPORT_SIZE = 512;

/**
 * 田字格手写板：鼠标 / 触屏 / 手写笔通用，记录每笔轨迹点（0~1 归一化坐标，y 向下）。
 * 判定在服务端完成，这里只负责采集与导出图片。
 */
export const HandwritingPad = forwardRef<HandwritingPadHandle, HandwritingPadProps>(
    function HandwritingPad({ disabled = false, onStrokesChange }, ref) {
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const strokesRef = useRef<UserStroke[]>([]);
        const drawingRef = useRef(false);
        const [hasInk, setHasInk] = useState(false);
        const [strokeCount, setStrokeCount] = useState(0);

        const emitChange = useCallback(() => {
            setStrokeCount(strokesRef.current.length);
            setHasInk(strokesRef.current.length > 0);
            onStrokesChange?.(strokesRef.current.map((s) => [...s]));
        }, [onStrokesChange]);

        /** 画田字格：inkColor 外框颜色，gridAlpha 十字虚线透明度 */
        const drawGrid = useCallback(
            (ctx: CanvasRenderingContext2D, size: number, inkColor: string, gridAlpha: number) => {
                ctx.clearRect(0, 0, size, size);
                // 外框
                ctx.strokeStyle = inkColor;
                ctx.lineWidth = Math.max(2, size / 160);
                ctx.strokeRect(0, 0, size, size);
                // 十字虚线
                ctx.save();
                ctx.globalAlpha = gridAlpha;
                ctx.strokeStyle = inkColor;
                ctx.lineWidth = 1;
                ctx.setLineDash([size / 28, size / 28]);
                ctx.beginPath();
                ctx.moveTo(size / 2, 0);
                ctx.lineTo(size / 2, size);
                ctx.moveTo(0, size / 2);
                ctx.lineTo(size, size / 2);
                ctx.stroke();
                ctx.restore();
            },
            []
        );

        const drawStrokes = useCallback((ctx: CanvasRenderingContext2D, size: number, inkColor: string) => {
            ctx.strokeStyle = inkColor;
            ctx.fillStyle = inkColor;
            ctx.lineWidth = size / 22;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            for (const stroke of strokesRef.current) {
                ctx.beginPath();
                stroke.forEach((p, i) => {
                    const x = p.x * size;
                    const y = p.y * size;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                if (stroke.length === 1) {
                    const p = stroke[0];
                    ctx.arc(p.x * size, p.y * size, ctx.lineWidth / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.stroke();
                }
            }
        }, []);

        const redraw = useCallback(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            // 笔迹用前景色（暗色主题下是浅色），网格用同色低透明度
            const inkColor = getComputedStyle(canvas).color || "#333333";
            drawGrid(ctx, canvas.width, inkColor, 0.3);
            drawStrokes(ctx, canvas.width, inkColor);
        }, [drawGrid, drawStrokes]);

        const pointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
            const canvas = canvasRef.current!;
            const rect = canvas.getBoundingClientRect();
            return {
                x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
                y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
            };
        }, []);

        const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (disabled) return;
            e.preventDefault();
            canvasRef.current?.setPointerCapture(e.pointerId);
            drawingRef.current = true;
            const p = pointFromEvent(e);
            strokesRef.current.push([p]);
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
            redraw();
            emitChange();
        }, [redraw, emitChange]);

        const clearAll = useCallback(() => {
            strokesRef.current = [];
            redraw();
            emitChange();
        }, [redraw, emitChange]);

        useImperativeHandle(
            ref,
            () => ({
                clear: clearAll,
                undo: undoOne,
                toDataUrl: () => {
                    const off = document.createElement("canvas");
                    off.width = EXPORT_SIZE;
                    off.height = EXPORT_SIZE;
                    const ctx = off.getContext("2d");
                    if (!ctx) return "";
                    // 白纸黑字，与界面主题无关，便于 AI 识别
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
                    drawGrid(ctx, EXPORT_SIZE, "#999999", 0.5);
                    drawStrokes(ctx, EXPORT_SIZE, "#111111");
                    return off.toDataURL("image/png");
                },
            }),
            [clearAll, undoOne, drawGrid, drawStrokes]
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
                        <Eraser className="mr-1 h-4 w-4" /> 重写
                    </Button>
                </div>
            </div>
        );
    }
);
