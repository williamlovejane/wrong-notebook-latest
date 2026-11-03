"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { apiClient } from "@/lib/api-client";
import { DEBUG_NOW_PARAM, DEBUG_NOW_STORAGE_KEY } from "@/lib/dictation/debug-time";
import { Loader2, Volume2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";

type Kind = "chinese_char" | "english_word" | "english_sentence";

interface TodayItem {
    cardId: string;
    entryId: string;
    kind: Kind;
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

interface EnglishPrompt {
    type: "english_word" | "english_sentence";
    cardId: string;
    entryId: string;
    meaning: string | null;
    phonetic: string | null;
    ttsPayload: string;
    ttsLang: "en-US";
    stage: number;
    wordCount?: number;
}

type Prompt = ChinesePrompt | EnglishPrompt;

interface AnswerResult {
    correct: boolean;
    expected: string;
    pinyin: string | null;
    promptWord: string | null;
    diff?: { word: string; correct: boolean }[];
    card: {
        stage: number;
        status: string;
        dueAt: string;
        stageLabel: string;
        correctCount: number;
        wrongCount: number;
    };
}

const MASK = "○";

function decodeBase64Utf8(b64: string): string {
    try {
        const bin = atob(b64);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return "";
    }
}

function speak(text: string, lang = "en-US", rate = 0.9) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

function QuizContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const kindFilter = searchParams.get("kind") as Kind | null;

    const [queue, setQueue] = useState<TodayItem[]>([]);
    const [index, setIndex] = useState(0);
    const [prompt, setPrompt] = useState<Prompt | null>(null);
    const [quizToken, setQuizToken] = useState<string | null>(null);
    const [answer, setAnswer] = useState("");
    const [result, setResult] = useState<AnswerResult | null>(null);
    const [stats, setStats] = useState({ correct: 0, wrong: 0 });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [finished, setFinished] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const spokenFor = useRef<string | null>(null);

    const current = queue[index];

    // 调试模式：列表页设置的模拟时间（sessionStorage），出题/判分与今日列表保持同一时钟
    const debugParams = useCallback((): Record<string, string> | undefined => {
        try {
            const saved = sessionStorage.getItem(DEBUG_NOW_STORAGE_KEY);
            return saved ? { [DEBUG_NOW_PARAM]: saved } : undefined;
        } catch {
            return undefined;
        }
    }, []);

    // 记录是否有模拟时间，用于页头提示
    const [simDate, setSimDate] = useState<string | null>(null);
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem(DEBUG_NOW_STORAGE_KEY);
            if (saved) setSimDate(saved);
        } catch {
            // 忽略
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const data = await apiClient.get<{ items: TodayItem[] }>(
                    "/api/dictation/today",
                    { params: { ...(kindFilter ? { kind: kindFilter } : {}), ...debugParams() } }
                );
                if (cancelled) return;
                setQueue(data.items);
                if (data.items.length === 0) setFinished(true);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [kindFilter, debugParams]);

    // 调试模式：出题与判分沿用同一模拟时钟
    const loadQuestion = useCallback(async (cardId: string) => {
        setPrompt(null);
        setResult(null);
        setAnswer("");
        setQuizToken(null);
        setError(null);

        try {
            const data = await apiClient.post<{ prompt: Prompt; quizToken: string }>(
                "/api/dictation/quiz",
                { cardId },
                { params: debugParams() }
            );
            setPrompt(data.prompt);
            setQuizToken(data.quizToken);
            setTimeout(() => inputRef.current?.focus(), 50);
        } catch (e) {
            setError(e instanceof Error ? e.message : "出题失败");
        }
    }, [debugParams]);

    useEffect(() => {
        if (current) loadQuestion(current.cardId);
    }, [current, loadQuestion]);

    // 英语题自动朗读一次
    useEffect(() => {
        if (!prompt || prompt.type === "chinese_word") return;
        if (spokenFor.current === prompt.cardId + prompt.stage) return;
        spokenFor.current = prompt.cardId + prompt.stage;
        const text = decodeBase64Utf8(prompt.ttsPayload);
        if (text) speak(text, prompt.ttsLang, prompt.type === "english_sentence" ? 0.85 : 0.9);
    }, [prompt]);

    const submit = async () => {
        if (!quizToken || submitting || result) return;
        setSubmitting(true);
        try {
            const data = await apiClient.post<AnswerResult>("/api/dictation/answer", {
                quizToken,
                answer,
            }, { params: debugParams() });
            setResult(data);
            setStats((s) =>
                data.correct ? { ...s, correct: s.correct + 1 } : { ...s, wrong: s.wrong + 1 }
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "判分失败");
        } finally {
            setSubmitting(false);
        }
    };

    const next = () => {
        if (index + 1 >= queue.length) {
            setFinished(true);
        } else {
            setIndex(index + 1);
        }
    };

    const replay = () => {
        if (!prompt || prompt.type === "chinese_word") return;
        speak(decodeBase64Utf8(prompt.ttsPayload), prompt.ttsLang, 0.85);
    };

    const pinyinNodes = useMemo(() => {
        if (!prompt || prompt.type !== "chinese_word") return null;
        if (prompt.syllables.length === 0) {
            return <span className="text-3xl tracking-widest">{prompt.pinyin}</span>;
        }
        return (
            <span className="text-3xl tracking-widest">
                {prompt.syllables.map((s, i) => {
                    const masked = i >= prompt.maskedFrom && i < prompt.maskedFrom + prompt.maskedLength;
                    return (
                        <span
                            key={i}
                            className={masked ? "text-primary font-semibold" : "text-foreground"}
                        >
                            {s}
                            {i < prompt.syllables.length - 1 ? " " : ""}
                        </span>
                    );
                })}
            </span>
        );
    }, [prompt]);

    if (loading) {
        return (
            <div className="container mx-auto max-w-2xl px-4 py-16 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" /> 正在准备题目…
            </div>
        );
    }

    if (finished) {
        return (
            <div className="container mx-auto max-w-2xl px-4 py-16">
                <div className="mb-6 flex items-center gap-3">
                    <BackButton fallbackUrl="/dictation" />
                    <h1 className="text-2xl font-bold">本轮完成</h1>
                </div>
                <div className="rounded-xl border p-8 text-center">
                    <div className="mb-2 text-4xl font-bold">
                        {stats.correct + stats.wrong > 0
                            ? Math.round((stats.correct / (stats.correct + stats.wrong)) * 100)
                            : 0}
                        <span className="text-xl">%</span>
                    </div>
                    <p className="mb-6 text-sm text-muted-foreground">
                        答对 {stats.correct} 题，答错 {stats.wrong} 题
                    </p>
                    <div className="flex justify-center gap-3">
                        <Button variant="outline" onClick={() => router.push("/dictation")}>
                            返回管理
                        </Button>
                        <Button
                            onClick={() => {
                                setStats({ correct: 0, wrong: 0 });
                                setFinished(false);
                                setIndex(0);
                                if (queue[0]) loadQuestion(queue[0].cardId);
                            }}
                        >
                            再来一轮
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (!current) {
        return (
            <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
                <p className="mb-4 text-sm text-muted-foreground">今天没有到期的复习内容。</p>
                <Button variant="outline" onClick={() => router.push("/dictation")}>
                    返回管理
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-2xl px-4 py-8">
            <div className="mb-4 flex items-center gap-3">
                <BackButton fallbackUrl="/dictation" />
                <div className="flex-1">
                    <div className="text-sm text-muted-foreground">
                        第 {index + 1} / {queue.length} 题
                        {current.overdueDays > 0 && ` · 逾期 ${current.overdueDays} 天`}
                        {simDate && (
                            <span className="ml-2 font-medium text-amber-600">
                                （调试：模拟 {simDate}）
                            </span>
                        )}
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${((index + (result ? 1 : 0)) / queue.length) * 100}%` }}
                        />
                    </div>
                </div>
                <Badge variant="outline" className="text-xs">
                    {current.stageLabel}
                </Badge>
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            {!prompt && !error && (
                <div className="py-16 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" /> 正在出题…
                </div>
            )}

            {prompt && (
                <div className="rounded-xl border p-8">
                    {prompt.type === "chinese_word" ? (
                        <div className="text-center">
                            <p className="mb-6 text-xs text-muted-foreground">
                                {prompt.fallbackSingleChar
                                    ? "看拼音，写出这个字"
                                    : "看拼音，补全词语中被遮住的字"}
                                {prompt.sourceLabel && !prompt.fallbackSingleChar && (
                                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5">
                                        {prompt.sourceLabel}
                                    </span>
                                )}
                            </p>

                            <div className="mb-8">{pinyinNodes}</div>

                            <div className="mb-6 flex items-end justify-center gap-3">
                                {(() => {
                                    let maskOrder = 0;
                                    const expectedChars = Array.from(result?.expected ?? "");
                                    return Array.from(prompt.maskedWord).map((ch, i) => {
                                        const isMasked = ch === MASK;
                                        const fillChar = isMasked && result ? expectedChars[maskOrder] ?? "" : "";
                                        if (isMasked) maskOrder++;
                                        return (
                                            <span
                                                key={i}
                                                className={
                                                    isMasked
                                                        ? result
                                                            ? `flex h-16 w-16 items-center justify-center rounded-lg border-2 text-3xl ${
                                                                  result.correct
                                                                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                                                      : "border-destructive bg-destructive/10 text-destructive"
                                                              }`
                                                            : "flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-primary/60 text-2xl text-primary"
                                                        : "flex h-16 w-16 items-center justify-center rounded-lg border bg-muted/40 text-3xl"
                                                }
                                            >
                                                {isMasked ? fillChar : ch}
                                            </span>
                                        );
                                    });
                                })()}
                            </div>

                            {prompt.hint && (
                                <p className="mb-4 text-xs text-amber-600 dark:text-amber-500">
                                    {prompt.hint}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="text-center">
                            <p className="mb-6 text-xs text-muted-foreground">
                                {prompt.type === "english_word"
                                    ? "听发音，写出这个单词"
                                    : `听句子，写出完整句子（${prompt.wordCount} 个词）`}
                            </p>

                            {prompt.meaning && (
                                <p className="mb-2 text-xl">{prompt.meaning}</p>
                            )}
                            {prompt.phonetic && (
                                <p className="mb-6 font-mono text-sm text-muted-foreground">
                                    {prompt.phonetic}
                                </p>
                            )}

                            <Button variant="outline" size="lg" className="mb-6" onClick={replay}>
                                <Volume2 className="mr-2 h-5 w-5" /> 再听一遍
                            </Button>
                        </div>
                    )}

                    <div className="mt-4 flex gap-2">
                        <Input
                            ref={inputRef}
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (result) next();
                                    else submit();
                                }
                            }}
                            disabled={!!result}
                            placeholder={prompt.type === "chinese_word" ? "写出这个字" : "写出你听到的内容"}
                            className="text-center text-lg"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                        {!result ? (
                            <Button onClick={submit} disabled={submitting || !answer.trim()}>
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "提交"}
                            </Button>
                        ) : (
                            <Button onClick={next}>
                                下一题 <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    {result && (
                        <div
                            className={`mt-6 rounded-lg border p-4 ${
                                result.correct
                                    ? "border-emerald-500/40 bg-emerald-500/10"
                                    : "border-destructive/40 bg-destructive/10"
                            }`}
                        >
                            <div className="mb-2 flex items-center gap-2 font-medium">
                                {result.correct ? (
                                    <>
                                        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                        正确
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-5 w-5 text-destructive" />
                                        答错了
                                    </>
                                )}
                            </div>

                            {!result.correct && (
                                <p className="mb-1 text-sm">
                                    正确答案：
                                    <span className="ml-1 text-lg font-semibold">{result.expected}</span>
                                    {result.pinyin && (
                                        <span className="ml-2 text-muted-foreground">{result.pinyin}</span>
                                    )}
                                </p>
                            )}

                            {result.promptWord && result.promptWord !== result.expected && (
                                <p className="mb-1 text-sm text-muted-foreground">
                                    本题词语：{result.promptWord}
                                </p>
                            )}

                            {result.diff && !result.correct && (
                                <p className="mb-1 flex flex-wrap gap-1 text-sm">
                                    {result.diff.map((d, i) => (
                                        <span
                                            key={i}
                                            className={
                                                d.correct
                                                    ? "text-muted-foreground"
                                                    : "font-semibold text-destructive underline"
                                            }
                                        >
                                            {d.word}
                                        </span>
                                    ))}
                                </p>
                            )}

                            <p className="mt-2 text-xs text-muted-foreground">
                                下次复习：{result.card.stageLabel}（
                                {new Date(result.card.dueAt).toLocaleDateString("zh-CN")}）
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function QuizPage() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto max-w-2xl px-4 py-16 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" /> 加载中…
                </div>
            }
        >
            <QuizContent />
        </Suspense>
    );
}
