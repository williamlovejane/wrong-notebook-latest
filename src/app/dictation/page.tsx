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
import { currentSemesterFromProfile } from "@/lib/yuwen/semester";
import {
    DEBUG_NOW_PARAM,
    DEBUG_NOW_STORAGE_KEY,
    parseDebugNow,
} from "@/lib/dictation/debug-time";
import { Loader2, Plus, Trash2, Play, BookOpen, Volume2, Languages, FlaskConical } from "lucide-react";

type Kind = "chinese_char" | "english_word" | "english_sentence";

interface UserProfile {
    role?: string;
    educationStage?: string | null;
    enrollmentYear?: number | null;
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
    const [today, setToday] = useState<TodayResponse | null>(null);
    const [entries, setEntries] = useState<Entry[]>([]);
    const [activeKind, setActiveKind] = useState<Kind>("chinese_char");
    const [rawInput, setRawInput] = useState("");
    // 当前学期由注册信息（学段+入学年份）推算，仅用于展示；组词在后端推导
    const [semLabel, setSemLabel] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    // 调试模式（仅 admin）：模拟任意一天触发复习计划；值存 sessionStorage 贯通答题页
    const [isAdmin, setIsAdmin] = useState(false);
    const [debugDate, setDebugDate] = useState<string | null>(null);

    useEffect(() => {
        try {
            setDebugDate(sessionStorage.getItem(DEBUG_NOW_STORAGE_KEY));
        } catch {
            // 忽略隐私模式等存储异常
        }
    }, []);

    /** 调试参数：debugDate 生效时附加 debugNow；非法值视为未设置 */
    const debugParams = useCallback(
        (): Record<string, string> | undefined => {
            if (!debugDate) return undefined;
            return parseDebugNow(debugDate)
                ? { [DEBUG_NOW_PARAM]: debugDate }
                : undefined;
        },
        [debugDate]
    );

    const loadAll = useCallback(
        async (dp?: Record<string, string>) => {
            setLoading(true);
            try {
                const [todayRes, entryRes, profile] = await Promise.all([
                    apiClient.get<TodayResponse>("/api/dictation/today", {
                        params: dp,
                    }),
                    apiClient.get<{ entries: Entry[] }>("/api/dictation/entries", {
                        params: dp,
                    }),
                    apiClient
                        .get<UserProfile>("/api/user")
                        .catch(() =>
                            ({ role: undefined, educationStage: undefined, enrollmentYear: undefined } as UserProfile)
                        ),
                ]);
                setToday(todayRes);
                setEntries(entryRes.entries);
                setIsAdmin(profile.role === "admin");
            const cur = currentSemesterFromProfile(
                profile.educationStage ?? null,
                profile.enrollmentYear ?? null
            );
            setSemLabel(
                cur.grade >= 9
                    ? null
                    : `${cur.grade}年级${cur.semester}学期`
            );
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

    // 恢复上次会话的调试时间后重新加载（模拟时间影响"今日待复习"）
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem(DEBUG_NOW_STORAGE_KEY);
            if (saved && parseDebugNow(saved)) {
                setDebugDate(saved);
                loadAll({ [DEBUG_NOW_PARAM]: saved });
            }
        } catch {
            // 忽略隐私模式等存储异常
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submit = async () => {
        const items = parseItems(activeKind, rawInput);
        if (items.length === 0) {
            setError("没有可录入的内容");
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
            }, { params: debugParams() });

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

    /** 调试模式：设置/清除模拟日期并重载（仅 admin 可见入口） */
    const applyDebugDate = (value: string | null) => {
        setDebugDate(value);
        try {
            if (value) sessionStorage.setItem(DEBUG_NOW_STORAGE_KEY, value);
            else sessionStorage.removeItem(DEBUG_NOW_STORAGE_KEY);
        } catch {
            // 忽略隐私模式等存储异常
        }
        loadAll(value && parseDebugNow(value) ? { [DEBUG_NOW_PARAM]: value } : undefined);
    };

    const shiftDebugDate = (days: number) => {
        const base = parseDebugNow(debugDate) ?? new Date();
        base.setDate(base.getDate() + days);
        const y = base.getFullYear();
        const m = String(base.getMonth() + 1).padStart(2, "0");
        const d = String(base.getDate()).padStart(2, "0");
        applyDebugDate(`${y}-${m}-${d}`);
    };

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

            {isAdmin && (
                <Card className="mb-6 border-dashed border-amber-500/40">
                    <CardContent className="flex flex-wrap items-center gap-2 py-3">
                        <FlaskConical className="h-4 w-4 shrink-0 text-amber-600" />
                        <span className="text-sm font-medium">调试模式</span>
                        <input
                            type="date"
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                            value={debugDate ?? new Date().toISOString().slice(0, 10)}
                            onChange={(e) => applyDebugDate(e.target.value || null)}
                        />
                        <Button variant="outline" size="sm" onClick={() => shiftDebugDate(1)}>
                            +1 天
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => shiftDebugDate(3)}>
                            +3 天
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => shiftDebugDate(7)}>
                            +7 天
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => shiftDebugDate(30)}>
                            +30 天
                        </Button>
                        {debugDate && parseDebugNow(debugDate) ? (
                            <>
                                <Badge className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                    模拟时间 {debugDate}
                                </Badge>
                                <Button variant="ghost" size="sm" onClick={() => applyDebugDate(null)}>
                                    回到今天
                                </Button>
                            </>
                        ) : (
                            <span className="text-xs text-muted-foreground">
                                选个日期模拟那一天的到期与排程；答题判分也按模拟时间计算
                            </span>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card className="mb-6">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                        今日待复习
                        {debugDate && parseDebugNow(debugDate) && (
                            <span className="ml-2 text-sm font-normal text-amber-600">
                                （模拟 {debugDate}）
                            </span>
                        )}
                    </CardTitle>
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

                                {tab.key === "chinese_char" && semLabel && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            组词范围：{semLabel}及以前课本学过的字
                                            （按注册信息推算，可在「设置」里调整学段/入学年份）
                                        </span>
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
