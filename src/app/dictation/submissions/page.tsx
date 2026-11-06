"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { apiClient } from "@/lib/api-client";
import { DEBUG_NOW_STORAGE_KEY, parseDebugNow } from "@/lib/dictation/debug-time";
import type { ReviewListItem, ReviewListResponse } from "@/lib/dictation/handwriting-types";
import {
    Loader2,
    ClipboardList,
    RefreshCw,
    RotateCcw,
    CheckCircle2,
    XCircle,
    ChevronDown,
    PenLine,
} from "lucide-react";

function parseStrings(raw: string | null): string[] {
    try {
        const parsed: unknown = JSON.parse(raw ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
        return [];
    }
}

/**
 * 调试模式下交卷记录按模拟时间归档，默认查询真实今天会漏掉它们。
 * 这里把多个日期的响应拍平成一张清单：跨交卷批次、跨日期都合并，不再按批次分级。
 */
function mergeResponses(rows: ReviewListResponse[], date: string): ReviewListResponse {
    const pending = new Map<string, ReviewListItem>();
    const reviewed = new Map<string, ReviewListItem>();
    for (const row of rows) {
        for (const item of row.pending) pending.set(item.id, item);
        for (const item of row.reviewed ?? []) reviewed.set(item.id, item);
    }
    return {
        date,
        batchCount: rows.reduce((sum, row) => sum + row.batchCount, 0),
        pending: [...pending.values()].sort(
            (a, b) => a.createdAt.localeCompare(b.createdAt) || a.position - b.position
        ),
        reviewedCount: rows.reduce((sum, row) => sum + row.reviewedCount, 0),
        ...(rows.some((row) => row.reviewed)
            ? {
                  reviewed: [...reviewed.values()].sort((a, b) =>
                      b.createdAt.localeCompare(a.createdAt) || b.position - a.position
                  ),
              }
            : {}),
    };
}

interface CardProps {
    row: ReviewListItem;
    index: number;
    reviewing: boolean;
    onReview: (row: ReviewListItem, correct: boolean) => void;
}

function HandwritingCard({ row, index, reviewing, onReview }: CardProps) {
    const images = parseStrings(row.images);
    const animations = parseStrings(row.animations);
    const [replayKeys, setReplayKeys] = useState<Record<number, number>>({});
    const effective = row.manualCorrect ?? row.correct;

    return (
        <div className="rounded-xl border p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">#{index + 1}</span>
                <span className="text-2xl font-semibold">{row.expected}</span>
                {row.pinyin && <span className="text-sm text-muted-foreground">{row.pinyin}</span>}
                {row.promptWord && row.promptWord !== row.expected && (
                    <span className="text-xs text-muted-foreground">词语：{row.promptWord}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {new Date(row.createdAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </span>
            </div>

            <div className="mb-3 flex flex-wrap gap-3">
                {images.map((image, i) => {
                    const animation = animations[i];
                    return (
                        <div key={i} className="flex gap-2">
                            <div className="flex flex-col items-center gap-1">
                                <img
                                    src={image}
                                    alt={`${row.expected} 第 ${i + 1} 字成品`}
                                    className="h-28 w-28 rounded border bg-white object-contain"
                                />
                                <span className="text-xs text-muted-foreground">成品</span>
                            </div>
                            {animation && (
                                <div className="flex flex-col items-center gap-1">
                                    <img
                                        key={`${row.id}-${i}-${replayKeys[i] ?? 0}`}
                                        src={animation}
                                        alt={`${row.expected} 第 ${i + 1} 字书写过程`}
                                        className="h-28 w-28 rounded border bg-white object-contain"
                                    />
                                    <button
                                        type="button"
                                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() =>
                                            setReplayKeys((prev) => ({ ...prev, [i]: (prev[i] ?? 0) + 1 }))
                                        }
                                    >
                                        <RotateCcw className="h-3 w-3" /> 重播
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {images.length === 0 && (
                    <p className="text-xs text-muted-foreground">这条记录没有保存笔迹图片。</p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                {effective !== null && (
                    <Badge
                        variant="outline"
                        className={
                            effective
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : "border-destructive/40 bg-destructive/10 text-destructive"
                        }
                    >
                        {effective ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                        {effective ? "已判正确" : "已判错误"}
                    </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                    {effective === null ? "对照笔迹判定：" : "改判："}
                </span>
                <Button
                    size="sm"
                    variant={row.manualCorrect === true ? "default" : "outline"}
                    disabled={reviewing}
                    onClick={() => onReview(row, true)}
                >
                    <CheckCircle2 className="mr-1 h-4 w-4" /> 判对
                </Button>
                <Button
                    size="sm"
                    variant={row.manualCorrect === false ? "default" : "outline"}
                    disabled={reviewing}
                    onClick={() => onReview(row, false)}
                >
                    <XCircle className="mr-1 h-4 w-4" /> 判错
                </Button>
                {reviewing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
        </div>
    );
}

export default function SubmissionsPage() {
    const [date, setDate] = useState("");
    const [data, setData] = useState<ReviewListResponse | null>(null);
    const [showReviewed, setShowReviewed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // 默认按真实今天查询；调试模式下的模拟日期由 load() 额外合并进来
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 客户端日期只能在挂载后取，避免与服务端渲染结果不一致
        setDate(new Date().toLocaleDateString("sv-SE"));
    }, []);

    const load = useCallback(async (targetDate: string, withReviewed: boolean) => {
        try {
            let debugDate: string | null = null;
            try {
                const saved = sessionStorage.getItem(DEBUG_NOW_STORAGE_KEY);
                debugDate = saved && parseDebugNow(saved) ? saved.slice(0, 10) : null;
            } catch {
                // 忽略隐私模式等存储异常
            }
            const today = new Date().toLocaleDateString("sv-SE");
            const dates = [targetDate];
            if (debugDate && debugDate !== targetDate && targetDate === today) {
                dates.push(debugDate);
            }
            const params: Record<string, string> = withReviewed ? { includeReviewed: "1" } : {};
            const responses = await Promise.all(
                dates.map((d) =>
                    apiClient.get<ReviewListResponse>("/api/dictation/submissions", {
                        params: { ...params, date: d },
                    })
                )
            );
            setData(mergeResponses(responses, targetDate));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!date) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换日期/展开已判时重置加载态；实际请求在下方异步发起
        setLoading(true);
        void load(date, showReviewed);
    }, [date, showReviewed, load]);

    const review = useCallback(
        async (row: ReviewListItem, correct: boolean) => {
            setReviewingId(row.id);
            try {
                await apiClient.patch(`/api/dictation/submissions/${row.submissionId}`, {
                    itemId: row.id,
                    correct,
                });
                await load(date, showReviewed);
                setError(null);
            } catch (e) {
                setError(e instanceof Error ? e.message : "判定失败");
            } finally {
                setReviewingId(null);
            }
        },
        [date, showReviewed, load]
    );

    const pending = data?.pending ?? [];
    const reviewed = data?.reviewed ?? [];

    return (
        <div className="container mx-auto max-w-5xl px-4 py-8">
            <div className="mb-6 flex flex-wrap items-center gap-3">
                <BackButton fallbackUrl="/dictation" />
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">今日提交 · 人工判卷</h1>
                    <p className="text-sm text-muted-foreground">
                        当天分多次交卷的字都集中在这里，逐字判对 / 判错后才会更新复习计划
                    </p>
                </div>
                <Link href="/dictation/handwrite">
                    <Button variant="outline" size="sm">
                        <PenLine className="mr-2 h-4 w-4" /> 继续手写默写
                    </Button>
                </Link>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="text-sm text-muted-foreground" htmlFor="submission-date">日期</label>
                <input
                    id="submission-date"
                    type="date"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                />
                <Button variant="ghost" size="sm" onClick={() => void load(date, showReviewed)} disabled={!date}>
                    <RefreshCw className="mr-2 h-4 w-4" /> 刷新
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReviewed((v) => !v)}
                    disabled={!data?.reviewedCount}
                >
                    <ChevronDown className={`mr-2 h-4 w-4 transition-transform ${showReviewed ? "rotate-180" : ""}`} />
                    {showReviewed ? "收起已判" : `查看已判（${data?.reviewedCount ?? 0}）`}
                </Button>
            </div>

            {data && (
                <div className="mb-4 flex flex-wrap gap-4 rounded-xl border p-3 text-sm">
                    <span>待判 <strong className="tabular-nums">{pending.length}</strong> 字</span>
                    <span>已判 <strong className="tabular-nums">{data.reviewedCount}</strong> 字</span>
                    <span className="text-muted-foreground">今日交卷 {data.batchCount} 次</span>
                </div>
            )}

            {error && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            {loading && !data ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" /> 加载中…
                </div>
            ) : pending.length === 0 ? (
                <div className="rounded-xl border p-12 text-center">
                    <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                    <p className="mb-1 text-sm">这一天没有待人工判卷的字。</p>
                    <p className="text-xs text-muted-foreground">
                        写完生字点「交卷」后，笔迹会集中列在这里等待判定。
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {pending.map((row, index) => (
                        <HandwritingCard
                            key={row.id}
                            row={row}
                            index={index}
                            reviewing={reviewingId === row.id}
                            onReview={(item, correct) => void review(item, correct)}
                        />
                    ))}
                </div>
            )}

            {showReviewed && (
                <div className="mt-8">
                    <h2 className="mb-3 text-lg font-semibold">已判记录</h2>
                    {reviewed.length === 0 ? (
                        <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
                            这一天还没有已判的字。
                        </p>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {reviewed.map((row, index) => (
                                <HandwritingCard
                                    key={row.id}
                                    row={row}
                                    index={index}
                                    reviewing={reviewingId === row.id}
                                    onReview={(item, correct) => void review(item, correct)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
