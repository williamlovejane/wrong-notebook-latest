"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { HandwritingPad } from "@/components/dictation/handwriting-pad";
import { ApiError, apiClient } from "@/lib/api-client";
import { DEBUG_NOW_PARAM, DEBUG_NOW_STORAGE_KEY } from "@/lib/dictation/debug-time";
import { buildPadImage, buildStrokeAnimation } from "@/lib/dictation/handwriting-animation";
import type {
    HandwritingAnswer,
    PadSnapshot,
    TimedPad,
} from "@/lib/dictation/handwriting-types";
import {
    Loader2,
    PenLine,
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    Clock3,
    ClipboardList,
} from "lucide-react";

interface TodayItem {
    cardId: string;
    entryId: string;
    kind: string;
    stage: number;
    status: string;
    dueAt: string;
    overdueDays: number;
    stageLabel: string;
}

interface ChinesePrompt {
    type: "chinese_word";
    cardId: string;
    entryId: string;
    pinyin: string;
    maskedWord: string;
    syllables: string[];
    maskedFrom: number;
    maskedLength: number;
    targetLength: number;
    stage: number;
    fallbackSingleChar?: boolean;
    hint?: string;
    sourceLabel?: string;
}

interface RoundQuestion {
    prompt: ChinesePrompt;
    quizToken: string;
}

interface SubmitResult {
    submissionId: string;
    totalCount: number;
    skippedCount: number;
}

const MASK = "○";

/** 让出一帧，生成动图时进度文案能刷新出来，页面不至于假死 */
function yieldFrame(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 交卷失败时把服务端的具体原因显示出来。
 * apiClient 抛的是 ApiError，message 只是「API Error: 400 Bad Request」，
 * 真正的中文原因在 data.message 里；过去用户只看到泛泛的英文，误以为交卷成功。
 */
function describeSubmitError(e: unknown): string {
    if (e instanceof ApiError) {
        const data = e.data;
        if (data && typeof data === "object" && "message" in data) {
            const message = (data as { message?: unknown }).message;
            if (typeof message === "string" && message) return message;
        }
        return `交卷失败（HTTP ${e.status}），请重试`;
    }
    return e instanceof Error ? e.message : "交卷失败，请重试";
}

function HandwriteRound() {
    const router = useRouter();
    const [queue, setQueue] = useState<TodayItem[]>([]);
    const [rounds, setRounds] = useState<(RoundQuestion | null)[]>([]);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [promptLoading, setPromptLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [phase, setPhase] = useState("");
    const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
    const [simDate, setSimDate] = useState<string | null>(null);
    /** 已交卷但还没人工判卷的字数：这些字判卷前不再出题，空列表时给出解释 */
    const [awaitingReviewCount, setAwaitingReviewCount] = useState(0);

    /** quizToken -> 该题每个字格的笔迹；用 state 保存，渲染期可安全读取以恢复画面 */
    const [padCache, setPadCache] = useState<Record<string, TimedPad[]>>({});
    /** 出题缓存的镜像，仅在 effect / 事件处理里读取，避免渲染期访问 ref */
    const roundsRef = useRef<(RoundQuestion | null)[]>([]);

    const debugParams = useCallback((): Record<string, string> | undefined => {
        try {
            const saved = sessionStorage.getItem(DEBUG_NOW_STORAGE_KEY);
            return saved ? { [DEBUG_NOW_PARAM]: saved } : undefined;
        } catch {
            return undefined;
        }
    }, []);

    useEffect(() => {
        try {
            const saved = sessionStorage.getItem(DEBUG_NOW_STORAGE_KEY);
            // eslint-disable-next-line react-hooks/set-state-in-effect -- 本地存储只能在客户端挂载后读取，避免与服务端渲染结果不一致
            if (saved) setSimDate(saved);
        } catch {
            // 忽略隐私模式等存储异常
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await apiClient.get<{ items: TodayItem[]; awaitingReviewCount?: number }>(
                    "/api/dictation/today",
                    { params: { kind: "chinese_char", ...debugParams() } }
                );
                if (cancelled) return;
                const items = data.items;
                setQueue(items);
                setAwaitingReviewCount(data.awaitingReviewCount ?? 0);
                roundsRef.current = new Array(items.length).fill(null);
                setRounds(roundsRef.current.slice());
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debugParams]);

    const setRoundAt = useCallback((position: number, question: RoundQuestion) => {
        roundsRef.current[position] = question;
        setRounds((prev) => {
            const next = [...prev];
            next[position] = question;
            return next;
        });
    }, []);

    // 出题按需懒加载：缓存命中时不再向服务端要题，也不会重复创建待判分记录
    useEffect(() => {
        if (queue.length === 0 || roundsRef.current[index]) return;
        let cancelled = false;
        (async () => {
            setPromptLoading(true);
            setError(null);
            try {
                const data = await apiClient.post<{ prompt: ChinesePrompt; quizToken: string }>(
                    "/api/dictation/quiz",
                    { cardId: queue[index].cardId },
                    { params: debugParams() }
                );
                if (cancelled) return;
                if (data.prompt.type !== "chinese_word") {
                    setError("手写默写只支持语文生字，请从「手写默写」入口进入");
                    return;
                }
                setRoundAt(index, { prompt: data.prompt, quizToken: data.quizToken });
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "出题失败");
            } finally {
                if (!cancelled) setPromptLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [index, queue, debugParams, setRoundAt]);

    const current = rounds[index];

    const handleStrokes = useCallback((padIndex: number, strokes: TimedPad, token: string, size: number) => {
        setPadCache((prev) => {
            const existing = prev[token] ?? Array.from({ length: size }, () => [] as TimedPad);
            const next = [...existing];
            next[padIndex] = strokes.map((stroke) => stroke.map((p) => ({ ...p })));
            return { ...prev, [token]: next };
        });
    }, []);

    /** 整题每个格子都写了才算已作答；没写全的题交卷时按未作答处理 */
    const isWritten = useCallback(
        (question: RoundQuestion | null, cache: Record<string, TimedPad[]>): boolean => {
            if (!question) return false;
            const pads = cache[question.quizToken];
            if (!pads || pads.length !== question.prompt.maskedLength) return false;
            return pads.every((pad) => pad.length > 0);
        },
        []
    );

    const writtenIndexes = useMemo(() => {
        const result: number[] = [];
        for (let i = 0; i < rounds.length; i++) {
            if (isWritten(rounds[i], padCache)) result.push(i);
        }
        return result;
    }, [rounds, padCache, isWritten]);

    const visitedCount = rounds.filter(Boolean).length;
    const writtenCount = writtenIndexes.length;
    const skippedCount = queue.length - writtenCount;
    const incompleteIndexes = useMemo(
        () => Array.from({ length: queue.length }, (_, i) => i).filter((i) => !writtenIndexes.includes(i)),
        [queue.length, writtenIndexes]
    );

    const submitRound = async () => {
        if (submitting) return;
        const written = [];
        for (let i = 0; i < roundsRef.current.length; i++) {
            if (isWritten(roundsRef.current[i], padCache)) written.push(i);
        }
        if (written.length === 0) {
            setError("还没有写完整的题目，请至少写 1 题再交卷");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const answers: HandwritingAnswer[] = [];
            const visited = roundsRef.current
                .map((question, position) => ({ question, position }))
                .filter((row): row is { question: RoundQuestion; position: number } => row.question !== null);

            for (let k = 0; k < visited.length; k++) {
                const { question } = visited[k];
                setPhase(`正在保存书写过程 ${k + 1} / ${visited.length}`);
                await yieldFrame();

                const pads = padCache[question.quizToken] ?? [];
                if (!isWritten(question, padCache)) {
                    // 看过但没写全：放空数组，后端清掉 pending 日志、不推进复习计划
                    answers.push({ cardId: question.prompt.cardId, quizToken: question.quizToken, pads: [] });
                    continue;
                }

                const snapshots: PadSnapshot[] = pads.map((strokes) => ({
                    strokes,
                    image: buildPadImage(strokes),
                    animation: buildStrokeAnimation(strokes),
                }));
                if (snapshots.some((s) => !s.image || !s.animation)) {
                    throw new Error("生成书写过程动图失败，请重试");
                }
                answers.push({ cardId: question.prompt.cardId, quizToken: question.quizToken, pads: snapshots });
            }

            setPhase("正在交卷…");
            const data = await apiClient.post<SubmitResult>(
                "/api/dictation/submissions",
                { answers, skippedCount: queue.length - written.length },
                { params: debugParams(), timeout: 120_000 }
            );
            // apiClient 遇到非 JSON 的成功响应会返回空对象，不能把它当成「已交卷」
            if (!data?.submissionId) {
                throw new Error("交卷返回异常，服务端没有生成提交记录，请重试");
            }
            setSubmitted(data);
        } catch (e) {
            setError(describeSubmitError(e));
        } finally {
            setSubmitting(false);
            setPhase("");
        }
    };

    const pinyinNodes = useMemo(() => {
        if (!current) return null;
        const { prompt } = current;
        if (prompt.syllables.length === 0) {
            return <span className="text-3xl tracking-widest">{prompt.pinyin}</span>;
        }
        return (
            <span className="text-3xl tracking-widest">
                {prompt.syllables.map((s, i) => {
                    const masked = i >= prompt.maskedFrom && i < prompt.maskedFrom + prompt.maskedLength;
                    return (
                        <span key={i} className={masked ? "font-semibold text-primary" : "text-foreground"}>
                            {s}{i < prompt.syllables.length - 1 ? " " : ""}
                        </span>
                    );
                })}
            </span>
        );
    }, [current]);

    if (loading) {
        return (
            <div className="container mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" /> 正在准备今天的生字…
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="container mx-auto max-w-2xl px-4 py-16">
                <div className="rounded-xl border p-8 text-center">
                    <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600 dark:text-emerald-400" />
                    <h1 className="mb-2 text-2xl font-bold">已交卷，等待人工判卷</h1>
                    <p className="mb-1 text-sm text-muted-foreground">
                        本次提交 {submitted.totalCount} 题，未作答 {submitted.skippedCount} 题（未作答题不更新复习计划）。
                    </p>
                    <p className="mb-6 text-sm text-muted-foreground">
                        笔迹与书写过程动图已保存，可在「今日提交」里逐字判对 / 判错；人工判定后才会更新复习计划。
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <Button onClick={() => router.push("/dictation/submissions")}>
                            <ClipboardList className="mr-2 h-4 w-4" /> 去今日提交判卷
                        </Button>
                        <Button variant="outline" onClick={() => router.push("/dictation")}>
                            返回默写复习
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (queue.length === 0) {
        return (
            <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
                <p className="mb-2 text-sm text-muted-foreground">今天没有到期的语文生字。</p>
                {awaitingReviewCount > 0 && (
                    <p className="mb-4 text-sm text-muted-foreground">
                        还有 {awaitingReviewCount} 个字已交卷、等待人工判卷，判卷前不会重复出现在这里。
                    </p>
                )}
                <div className="flex flex-wrap justify-center gap-3">
                    {awaitingReviewCount > 0 && (
                        <Button onClick={() => router.push("/dictation/submissions")}>
                            <ClipboardList className="mr-2 h-4 w-4" /> 去今日提交判卷
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => router.push("/dictation")}>
                        返回默写复习
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-3xl px-4 py-8">
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <BackButton fallbackUrl="/dictation" />
                <div className="flex-1">
                    <h1 className="text-xl font-bold">手写默写</h1>
                    <p className="text-xs text-muted-foreground">
                        自由书写，写完所有生字后统一交卷，交卷后由人工判卷
                        {simDate && <span className="ml-2 font-medium text-amber-600">（调试：模拟 {simDate}）</span>}
                    </p>
                </div>
                <Link href="/dictation/submissions">
                    <Button variant="outline" size="sm">
                        <ClipboardList className="mr-2 h-4 w-4" /> 今日提交
                    </Button>
                </Link>
            </div>

            <div className="mb-4 rounded-lg border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">第 {index + 1} / {queue.length} 题</span>
                    <Badge variant="outline" className="text-xs">{queue[index]?.stageLabel}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                        已写 {writtenCount} 题 · 未写 {skippedCount} 题 · 已查看 {visitedCount} 题
                    </span>
                </div>
                <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${(writtenCount / queue.length) * 100}%` }}
                    />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {queue.map((_, i) => {
                        const written = writtenIndexes.includes(i);
                        const visited = !!rounds[i];
                        return (
                            <button
                                key={i}
                                type="button"
                                title={`第 ${i + 1} 题：${written ? "已写" : visited ? "已查看未写完" : "未查看"}`}
                                onClick={() => setIndex(i)}
                                className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                                    i === index
                                        ? "ring-2 ring-primary ring-offset-1"
                                        : ""
                                } ${
                                    written
                                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                                        : visited
                                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                          : "bg-muted text-muted-foreground"
                                }`}
                            >
                                {i + 1}
                            </button>
                        );
                    })}
                </div>
            </div>

            {awaitingReviewCount > 0 && (
                <p className="mb-4 text-xs text-muted-foreground">
                    另有 {awaitingReviewCount} 个字已交卷、等待人工判卷，未列入本轮。
                    <Link href="/dictation/submissions" className="ml-1 underline">去判卷</Link>
                </p>
            )}

            {error && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            {submitting && (
                <div className="mb-4 flex items-center gap-2 rounded-md border bg-muted/40 px-4 py-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> {phase || "正在准备交卷…"}
                </div>
            )}

            {!current ? (
                <div className="rounded-xl border p-16 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" /> 正在出题…
                </div>
            ) : (
                <div className="rounded-xl border p-6">
                    <div className="mb-6 text-center">
                        <p className="mb-4 text-xs text-muted-foreground">
                            {current.prompt.fallbackSingleChar
                                ? "看拼音，写出这个字"
                                : "看拼音，补全词语中被遮住的字"}
                            {current.prompt.sourceLabel && !current.prompt.fallbackSingleChar && (
                                <span className="ml-2 rounded bg-muted px-1.5 py-0.5">
                                    {current.prompt.sourceLabel}
                                </span>
                            )}
                        </p>
                        <div className="mb-6">{pinyinNodes}</div>
                        <div className="mb-4 flex flex-wrap items-end justify-center gap-2">
                            {Array.from(current.prompt.maskedWord).map((ch, i) => (
                                <span
                                    key={i}
                                    className={
                                        ch === MASK
                                            ? "flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-primary/60 text-xl text-primary"
                                            : "flex h-12 w-12 items-center justify-center rounded-lg border bg-muted/40 text-2xl"
                                    }
                                >
                                    {ch === MASK ? "" : ch}
                                </span>
                            ))}
                        </div>
                        {current.prompt.hint && (
                            <p className="text-xs text-amber-600 dark:text-amber-500">{current.prompt.hint}</p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-start justify-center gap-4">
                        {Array.from({ length: current.prompt.maskedLength }).map((_, i) => {
                            const cached = padCache[current.quizToken];
                            return (
                                <div key={`${current.quizToken}-${i}`} className="flex w-[170px] flex-col items-center gap-1">
                                    <HandwritingPad
                                        disabled={submitting}
                                        initialStrokes={cached?.[i] ?? []}
                                        onStrokesChange={(strokes) =>
                                            handleStrokes(i, strokes, current.quizToken, current.prompt.maskedLength)
                                        }
                                    />
                                    <span className="text-xs text-muted-foreground">第 {i + 1} 个字</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={index === 0 || submitting}
                        onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    >
                        <ChevronLeft className="mr-1 h-4 w-4" /> 上一题
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={index >= queue.length - 1 || submitting}
                        onClick={() => setIndex((i) => Math.min(queue.length - 1, i + 1))}
                    >
                        下一题 <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                            <Clock3 className="mr-1 inline h-3 w-3" /> 交卷后到「今日提交」人工判卷
                        </span>
                        {/* 一次点击直接交卷：此前需要二次确认，容易被误认为已经提交 */}
                        <Button
                            onClick={() => void submitRound()}
                            disabled={submitting || promptLoading || writtenCount === 0}
                        >
                            {submitting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <PenLine className="mr-2 h-4 w-4" />
                            )}
                            交卷（{writtenCount} 题）
                        </Button>
                    </div>
                    {skippedCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                            未写 {skippedCount} 题也可以直接交卷，只对已写部分人工判卷并更新复习计划
                            {incompleteIndexes.length > 0 && incompleteIndexes.length <= 12 && (
                                <>（第 {incompleteIndexes.map((i) => i + 1).join("、")} 题）</>
                            )}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function HandwritePage() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" /> 加载中…
                </div>
            }
        >
            <HandwriteRound />
        </Suspense>
    );
}
