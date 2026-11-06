"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PenLine, RotateCcw } from "lucide-react";
import type HanziWriter from "hanzi-writer";
import { frontendLogger } from "@/lib/frontend-logger";
import { isStandardStrokeChar, type HanziCharacterData } from "@/lib/dictation/handwriting-types";

type StrokeStatus = "unsupported" | "loading" | "ready" | "error" | "practicing" | "done";

interface StandardStrokeProps {
    char: string;
    /** 田字格边长（px） */
    size?: number;
    /** 判卷页点「重播」时递增：孩子的书写过程与标准笔顺一起重播 */
    replayKey?: number;
    /** 临摹模式：字形加载完直接进入 hanzi-writer 的 quiz */
    practice?: boolean;
    /** 是否显示重播 / 临摹按钮（弹层内由外部控制，不重复显示） */
    controls?: boolean;
    onPractice?: () => void;
}

/** 走本地接口取字形，不依赖 hanzi-writer 默认的 cdn.jsdelivr.net */
async function fetchStrokeData(char: string): Promise<HanziCharacterData> {
    const response = await fetch(`/api/dictation/hanzi-data/${encodeURIComponent(char)}`);
    if (!response.ok) throw new Error(`标准笔顺加载失败（HTTP ${response.status}）`);
    return (await response.json()) as HanziCharacterData;
}

/**
 * 单个字的标准笔顺：田字格 + Hanzi Writer 逐笔动画。
 * 判卷页按字并排展示，用来对照孩子的成品图与书写过程；可重播，也可点「临摹」放大练习。
 * 判卷清单可能一次显示几十个字，用 IntersectionObserver 只在进入视口时创建实例。
 */
export function StandardStroke({
    char,
    size = 112,
    replayKey = 0,
    practice = false,
    controls = true,
    onPractice,
}: StandardStrokeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const writerRef = useRef<HanziWriter | null>(null);
    const supported = isStandardStrokeChar(char);
    const [inView, setInView] = useState(false);
    const [status, setStatus] = useState<StrokeStatus>(
        supported ? (practice ? "practicing" : "loading") : "unsupported"
    );
    const [mistakes, setMistakes] = useState(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof IntersectionObserver === "undefined") {
            // 环境不支持懒加载时直接渲染，避免笔顺区域一直空白
            setInView(true);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setInView(true);
                    observer.disconnect();
                }
            },
            { rootMargin: "200px" }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!inView || !supported || !container) return;
        let cancelled = false;
        let writer: HanziWriter | null = null;

        void (async () => {
            try {
                const { default: HanziWriterLib } = await import("hanzi-writer");
                if (cancelled) return;
                writer = HanziWriterLib.create(container, char, {
                    width: size,
                    height: size,
                    padding: 4,
                    showOutline: true,
                    // 与成品图一样固定白底深字，深色主题下也保持对照一致
                    strokeColor: "#1f2937",
                    outlineColor: "#d1d5db",
                    drawingColor: "#2563eb",
                    highlightColor: "#f59e0b",
                    delayBetweenStrokes: 180,
                    strokeAnimationSpeed: 1,
                    charDataLoader: fetchStrokeData,
                    onLoadCharDataSuccess: () => {
                        if (!cancelled) setStatus(practice ? "practicing" : "ready");
                    },
                    onLoadCharDataError: () => {
                        if (!cancelled) setStatus("error");
                    },
                });
                writerRef.current = writer;
                if (practice) {
                    void writer.quiz({
                        showHintAfterMisses: 3,
                        onComplete: (summary) => {
                            if (cancelled) return;
                            setMistakes(summary.totalMistakes);
                            setStatus("done");
                        },
                    });
                } else {
                    void writer.animateCharacter();
                }
            } catch (error) {
                if (cancelled) return;
                frontendLogger.warn(
                    "[standard-stroke]",
                    "标准笔顺加载失败",
                    { char, reason: error instanceof Error ? error.message : String(error) },
                    { sendToBackend: false }
                );
                setStatus("error");
            }
        })();

        return () => {
            cancelled = true;
            writer?.cancelQuiz();
            writerRef.current = null;
            container.innerHTML = "";
        };
    }, [char, size, inView, practice, supported]);

    // 判卷页的「重播」同时刷新书写过程 GIF 与标准笔顺，方便逐笔对照
    const lastReplay = useRef(replayKey);
    useEffect(() => {
        if (lastReplay.current === replayKey) return;
        lastReplay.current = replayKey;
        if (status === "ready" && !practice) void writerRef.current?.animateCharacter();
    }, [replayKey, status, practice]);

    const replay = useCallback(() => {
        if (status === "ready") void writerRef.current?.animateCharacter();
    }, [status]);

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative rounded border bg-white" style={{ width: size, height: size }}>
                {/* 田字格：字形轮廓由 Hanzi Writer 画，格子线单独叠加 */}
                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                    <div className="absolute left-1/2 top-0 h-full border-l border-dashed border-slate-300" />
                    <div className="absolute left-0 top-1/2 w-full border-t border-dashed border-slate-300" />
                </div>
                <div ref={containerRef} className="absolute inset-0" />
                {status === "loading" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs text-slate-500">
                        加载笔顺…
                    </span>
                )}
                {status === "error" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs text-slate-500">
                        无标准笔顺
                    </span>
                )}
                {status === "unsupported" && (
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                        非汉字
                    </span>
                )}
            </div>
            <span className="text-xs text-muted-foreground">标准笔顺</span>
            {controls && (
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                        onClick={replay}
                        disabled={status !== "ready"}
                    >
                        <RotateCcw className="h-3 w-3" /> 重播
                    </button>
                    {onPractice && supported && (
                        <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            onClick={onPractice}
                        >
                            <PenLine className="h-3 w-3" /> 临摹
                        </button>
                    )}
                </div>
            )}
            {practice && (
                <p className="max-w-[16rem] text-center text-xs text-muted-foreground">
                    {status === "done"
                        ? `临摹完成，失误 ${mistakes} 次；关闭后可重新练习`
                        : "用鼠标或手指按标准笔顺在格子里书写，写错会给出提示"}
                </p>
            )}
        </div>
    );
}
