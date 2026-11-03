"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { PaperSheet } from "@/components/dictation/paper/paper-sheet";
import { GradingList, type GradingItem } from "@/components/dictation/paper/grading-list";
import { apiClient } from "@/lib/api-client";
import { DEBUG_NOW_PARAM, DEBUG_NOW_STORAGE_KEY } from "@/lib/dictation/debug-time";
import {
    Loader2,
    Printer,
    Camera,
    PenLine,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Send,
} from "lucide-react";

interface PaperItem {
    logId: string;
    cardId: string;
    pinyin: string;
    maskedWord: string;
    maskedLength: number;
    promptWord: string;
    expected: string;
    sourceLabel?: string | null;
}

interface SubmitSummary {
    gradedCount: number;
    correctCount: number;
    wrongCount: number;
}

type Phase = "loading" | "paper" | "grading" | "done";

/** 压缩试卷照片：长边 ≤1600px、JPEG 质量 0.85，够 AI 辨认又不会太大 */
async function compressPhoto(file: File): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("读取照片失败"));
        reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("照片解码失败"));
        image.src = dataUrl;
    });

    const MAX_SIDE = 1600;
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
}

function debugParams(): Record<string, string> | undefined {
    try {
        const saved = sessionStorage.getItem(DEBUG_NOW_STORAGE_KEY);
        return saved ? { [DEBUG_NOW_PARAM]: saved } : undefined;
    } catch {
        return undefined;
    }
}

export default function PaperPage() {
    const router = useRouter();
    const [phase, setPhase] = useState<Phase>("loading");
    const [paperId, setPaperId] = useState<string | null>(null);
    const [items, setItems] = useState<PaperItem[]>([]);
    const [skipped, setSkipped] = useState<{ text: string; reason: string }[]>([]);
    const [gradingItems, setGradingItems] = useState<GradingItem[]>([]);
    const [gradingMode, setGradingMode] = useState<"paper_ai" | "paper_manual">("paper_manual");
    const [summary, setSummary] = useState<SubmitSummary | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    /** 每次进入页面都用当前最新到期生字出一张新卷 */
    const createPaper = useCallback(async () => {
        setPhase("loading");
        setError(null);
        try {
            const res = await apiClient.post<{
                paperId: string;
                items: PaperItem[];
                skipped: { text: string; reason: string }[];
            }>("/api/dictation/paper", {}, { params: debugParams() });
            setPaperId(res.paperId);
            setItems(res.items);
            setSkipped(res.skipped ?? []);
            setPhase("paper");
        } catch (e) {
            setError(e instanceof Error ? e.message : "出卷失败");
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 数据请求：进入页面出卷，请求前后更新加载状态
        void createPaper();
    }, [createPaper]);

    const printPaper = () => window.print();

    /** 拍照 → AI 整卷判分 → 进入确认 */
    const gradeByPhoto = async (file: File) => {
        if (!paperId) return;
        setBusy(true);
        setError(null);
        try {
            const image = await compressPhoto(file);
            const res = await apiClient.post<{ items: GradingItem[] }>(
                `/api/dictation/paper/${paperId}/grade-ai`,
                { image },
                { params: debugParams() }
            );
            setGradingMode("paper_ai");
            setGradingItems(res.items);
            setPhase("grading");
        } catch (e) {
            setError(e instanceof Error ? e.message : "AI 判分失败");
        } finally {
            setBusy(false);
        }
    };

    /** 人工逐题录入 */
    const startManualGrading = () => {
        setGradingMode("paper_manual");
        setGradingItems(
            items.map((item, i) => ({
                logId: item.logId,
                n: i + 1,
                expected: item.expected,
                pinyin: item.pinyin,
                recognized: null,
                correct: null,
            }))
        );
        setPhase("grading");
    };

    const submitGrading = async () => {
        if (!paperId) return;
        const decidable = gradingItems.filter((g) => g.correct !== null);
        if (decidable.length === 0) {
            setError("请先标记每道题的对错");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await apiClient.post<SubmitSummary>(
                `/api/dictation/paper/${paperId}/submit`,
                {
                    mode: gradingMode,
                    results: decidable.map((g) => ({
                        logId: g.logId,
                        correct: g.correct,
                        recognized: g.recognized,
                    })),
                },
                { params: debugParams() }
            );
            setSummary(res);
            setPhase("done");
        } catch (e) {
            setError(e instanceof Error ? e.message : "提交失败");
        } finally {
            setBusy(false);
        }
    };

    const undecided = gradingItems.filter((g) => g.correct === null).length;

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
            <div className="mb-6 flex items-center gap-3 print:hidden">
                <BackButton fallbackUrl="/dictation" />
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">出卷考察</h1>
                    <p className="text-sm text-muted-foreground">
                        今日到期生字打印成卷，作答后拍照 AI 判分或人工录入对错。
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive print:hidden">
                    {error}
                </div>
            )}

            {phase === "loading" && (
                <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground print:hidden">
                    <Loader2 className="h-4 w-4 animate-spin" /> 正在出卷…
                </div>
            )}

            {phase === "paper" && (
                <>
                    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
                        <Badge variant="outline">共 {items.length} 题</Badge>
                        {skipped.length > 0 && (
                            <span className="text-xs text-amber-600">
                                跳过 {skipped.length} 题（{skipped
                                    .slice(0, 3)
                                    .map((s) => s.text)
                                    .join("、")}
                                ）
                            </span>
                        )}
                        <span className="ml-auto flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={createPaper} disabled={busy}>
                                <RefreshCw className="mr-2 h-4 w-4" /> 重新出卷
                            </Button>
                            <Button variant="outline" size="sm" onClick={printPaper} disabled={items.length === 0}>
                                <Printer className="mr-2 h-4 w-4" /> 打印试卷
                            </Button>
                            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy || items.length === 0}>
                                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                                拍照 AI 判分
                            </Button>
                            <Button variant="outline" size="sm" onClick={startManualGrading} disabled={items.length === 0}>
                                <PenLine className="mr-2 h-4 w-4" /> 人工录入
                            </Button>
                        </span>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) gradeByPhoto(file);
                            }}
                        />
                    </div>

                    <PaperSheet
                        dateLabel={new Date().toLocaleDateString("zh-CN")}
                        items={items.map((i) => ({ pinyin: i.pinyin, maskedWord: i.maskedWord }))}
                    />

                    {items.length === 0 && (
                        <p className="mt-4 text-center text-sm text-muted-foreground print:hidden">
                            今天没有到期的语文生字。
                        </p>
                    )}
                </>
            )}

            {phase === "grading" && (
                <>
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                            {gradingMode === "paper_ai" ? "拍照 AI 判分" : "人工录入"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                            {undecided > 0 ? `还有 ${undecided} 题未判定` : "全部已判定"}
                            {gradingMode === "paper_ai" && undecided > 0 && "（AI 没把握的题请人工补判）"}
                        </span>
                        <span className="ml-auto flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPhase("paper")}>
                                返回试卷
                            </Button>
                            <Button size="sm" onClick={submitGrading} disabled={busy || undecided === gradingItems.length}>
                                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                提交成绩
                            </Button>
                        </span>
                    </div>

                    <GradingList
                        items={gradingItems}
                        onSetCorrect={(logId, correct) =>
                            setGradingItems((prev) =>
                                prev.map((g) => (g.logId === logId ? { ...g, correct } : g))
                            )
                        }
                    />
                </>
            )}

            {phase === "done" && summary && (
                <div className="rounded-xl border p-8 text-center print:hidden">
                    <div className="mb-2 flex items-center justify-center gap-3 text-4xl font-bold">
                        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
                        {summary.correctCount}
                        <XCircle className="ml-6 h-9 w-9 text-destructive" />
                        {summary.wrongCount}
                    </div>
                    <p className="mb-6 text-sm text-muted-foreground">
                        已判 {summary.gradedCount} 题，答错的字会按遗忘曲线安排复习。
                    </p>
                    <div className="flex justify-center gap-3">
                        <Button variant="outline" onClick={() => router.push("/dictation")}>
                            返回听写管理
                        </Button>
                        <Button onClick={createPaper}>再出一张卷</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
