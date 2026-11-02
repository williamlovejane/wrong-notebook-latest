"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client";
import { Loader2, Plus, Trash2, Play, BookMarked, BookOpen, Volume2, Languages } from "lucide-react";

type Kind = "chinese_char" | "english_word" | "english_sentence";

interface Pool {
    id: string;
    name: string;
    charCount: number;
    isDefault: boolean;
}

interface Entry {
    id: string;
    kind: Kind;
    text: string;
    pinyin: string | null;
    meaning: string | null;
    poolName: string | null;
    wordCount: number;
    card: {
        stage: number;
        status: string;
        dueAt: string;
        correctCount: number;
        wrongCount: number;
        stageLabel: string;
    } | null;
}

interface TodayResponse {
    totalDue: number;
    byKind: Record<Kind, number>;
}

const KIND_TABS: { key: Kind; label: string; hint: string; placeholder: string }[] = [
    {
        key: "chinese_char",
        label: "语文生字",
        hint: "每行一个字，可跟拼音：园 huā / 也可以直接粘贴一串生字",
        placeholder: "园\n花\n草\ntiān 天",
    },
    {
        key: "english_word",
        label: "英语单词",
        hint: "每行一个，格式：单词 | 中文释义",
        placeholder: "apple | 苹果\nbanana | 香蕉",
    },
    {
        key: "english_sentence",
        label: "英语句子",
        hint: "每行一句，可选释义：句子 | 释义",
        placeholder: "I go to school by bus. | 我坐公交去上学。",
    },
];

const HANZI_RE = /[\u4e00-\u9fa5]/;

function parseItems(kind: Kind, raw: string): { text: string; pinyin?: string; meaning?: string }[] {
    const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

    // 语文：单行且全汉字且较长时，按单字拆分
    if (
        kind === "chinese_char" &&
        lines.length === 1 &&
        Array.from(lines[0]).length > 4 &&
        Array.from(lines[0]).every((c) => HANZI_RE.test(c))
    ) {
        return Array.from(new Set(Array.from(lines[0]))).map((ch) => ({ text: ch }));
    }

    return lines.map((line) => {
        if (kind === "chinese_char") {
            const [first, ...rest] = line.split(/\s+/);
            return { text: first, pinyin: rest.join(" ").trim() || undefined };
        }

        if (line.includes("|")) {
            const [text, ...rest] = line.split("|");
            const extra = rest.join("|").trim();
            return kind === "english_word"
                ? { text: text.trim(), meaning: extra || undefined }
                : { text: text.trim(), meaning: extra || undefined };
        }

        if (kind === "english_word") {
            const [first, ...rest] = line.split(/\s+/);
            return { text: first, meaning: rest.join(" ").trim() || undefined };
        }

        return { text: line };
    });
}

export default function DictationPage() {
    const router = useRouter();
    const [pools, setPools] = useState<Pool[]>([]);
    const [today, setToday] = useState<TodayResponse | null>(null);
    const [entries, setEntries] = useState<Entry[]>([]);
    const [activeKind, setActiveKind] = useState<Kind>("chinese_char");
    const [rawInput, setRawInput] = useState("");
    const [poolId, setPoolId] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [poolRes, todayRes, entryRes] = await Promise.all([
                apiClient.get<{ pools: Pool[] }>("/api/dictation/pools"),
                apiClient.get<TodayResponse>("/api/dictation/today"),
                apiClient.get<{ entries: Entry[] }>("/api/dictation/entries"),
            ]);
            setPools(poolRes.pools);
            setToday(todayRes);
            setEntries(entryRes.entries);

            const def = poolRes.pools.find((p) => p.isDefault) ?? poolRes.pools[0];
            setPoolId((prev) => prev || def?.id || "");
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const submit = async () => {
        const items = parseItems(activeKind, rawInput);
        if (items.length === 0) {
            setError("没有可录入的内容");
            return;
        }
        if (activeKind === "chinese_char" && !poolId) {
            setError("请先在「备选字库」里建一个字库，生字必须绑定字库才能组词考察");
            return;
        }

        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const res = await apiClient.post<{
                createdCount: number;
                skippedCount: number;
                skipped: { text: string; reason: string }[];
            }>("/api/dictation/entries", {
                kind: activeKind,
                items,
                poolId: activeKind === "chinese_char" ? poolId : undefined,
            });

            let msg = `成功录入 ${res.createdCount} 条`;
            if (res.skippedCount > 0) {
                msg += `，跳过 ${res.skippedCount} 条（${res.skipped
                    .slice(0, 3)
                    .map((s) => `${s.text}:${s.reason}`)
                    .join("；")}）`;
            }
            setMessage(msg);
            setRawInput("");
            await loadAll();
        } catch (e) {
            setError(e instanceof Error ? e.message : "录入失败");
        } finally {
            setSaving(false);
        }
    };

    const removeEntry = async (entry: Entry) => {
        if (!confirm(`删除「${entry.text}」及其复习记录？`)) return;
        try {
            await apiClient.delete(`/api/dictation/entries/${entry.id}`);
            await loadAll();
        } catch (e) {
            setError(e instanceof Error ? e.message : "删除失败");
        }
    };

    const kindEntries = entries.filter((e) => e.kind === activeKind);
    const activeTab = KIND_TABS.find((k) => k.key === activeKind)!;

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8">
            <div className="mb-6 flex items-center gap-3">
                <BackButton fallbackUrl="/" />
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">默写复习</h1>
                    <p className="text-sm text-muted-foreground">
                        按遗忘曲线安排复习：答对升阶、答错回到第一阶。
                    </p>
                </div>
                <Link href="/yuwen">
                    <Button variant="outline" size="sm">
                        <BookOpen className="mr-2 h-4 w-4" /> 课内字词
                    </Button>
                </Link>
                <Link href="/dictation/pools">
                    <Button variant="outline" size="sm">
                        <BookMarked className="mr-2 h-4 w-4" /> 备选字库
                    </Button>
                </Link>
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}
            {message && (
                <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                    {message}
                </div>
            )}

            <Card className="mb-6">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">今日待复习</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="text-3xl font-bold tabular-nums">{today?.totalDue ?? 0}</div>
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">语文生字 {today?.byKind?.chinese_char ?? 0}</Badge>
                                <Badge variant="outline">英语单词 {today?.byKind?.english_word ?? 0}</Badge>
                                <Badge variant="outline">英语句子 {today?.byKind?.english_sentence ?? 0}</Badge>
                            </div>
                            <div className="ml-auto flex flex-wrap gap-2">
                                {(today?.totalDue ?? 0) > 0 ? (
                                    <Button onClick={() => router.push("/dictation/quiz")}>
                                        <Play className="mr-2 h-4 w-4" /> 开始复习
                                    </Button>
                                ) : (
                                    <span className="text-sm text-muted-foreground">今天没有到期的内容</span>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Tabs value={activeKind} onValueChange={(v) => setActiveKind(v as Kind)}>
                <TabsList className="grid w-full grid-cols-3">
                    {KIND_TABS.map((tab) => (
                        <TabsTrigger key={tab.key} value={tab.key}>
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {KIND_TABS.map((tab) => (
                    <TabsContent key={tab.key} value={tab.key} className="mt-4 space-y-4">
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    {tab.key === "chinese_char" ? (
                                        <Languages className="h-4 w-4" />
                                    ) : (
                                        <Volume2 className="h-4 w-4" />
                                    )}
                                    录入{tab.label}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p className="text-xs text-muted-foreground">{tab.hint}</p>

                                {tab.key === "chinese_char" && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm">备选字库</span>
                                        <select
                                            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                            value={poolId}
                                            onChange={(e) => setPoolId(e.target.value)}
                                        >
                                            <option value="">（未选择）</option>
                                            {pools.map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name}（{p.charCount} 字）
                                                </option>
                                            ))}
                                        </select>
                                        {pools.length === 0 && (
                                            <Link href="/dictation/pools" className="text-sm underline">
                                                去创建字库
                                            </Link>
                                        )}
                                    </div>
                                )}

                                <textarea
                                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    placeholder={tab.placeholder}
                                    value={rawInput}
                                    onChange={(e) => setRawInput(e.target.value)}
                                />

                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">
                                        将录入 {parseItems(activeKind, rawInput).length} 条
                                    </span>
                                    <Button onClick={submit} disabled={saving}>
                                        {saving ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <Plus className="mr-2 h-4 w-4" />
                                        )}
                                        录入
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">
                                    已录入 {kindEntries.length} 条
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {kindEntries.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">还没有内容。</p>
                                ) : (
                                    <ul className="divide-y">
                                        {kindEntries.map((entry) => (
                                            <li key={entry.id} className="flex items-center gap-3 py-2">
                                                <span className="min-w-[3rem] text-lg font-medium">{entry.text}</span>
                                                <span className="text-sm text-muted-foreground">
                                                    {entry.pinyin || entry.meaning || ""}
                                                </span>
                                                {entry.poolName && (
                                                    <Badge variant="outline" className="text-xs">
                                                        {entry.poolName}
                                                    </Badge>
                                                )}
                                                <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                                                    {entry.card && (
                                                        <>
                                                            <Badge variant="secondary" className="text-xs">
                                                                {entry.card.status === "mastered" ? "已掌握" : `第 ${entry.card.stage + 1} 阶`}
                                                            </Badge>
                                                            <span>
                                                                {new Date(entry.card.dueAt).toLocaleDateString("zh-CN")}
                                                            </span>
                                                        </>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeEntry(entry)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
