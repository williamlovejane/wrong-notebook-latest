"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, Bot, Coins, AlertCircle, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";

/** AIService 方法名 → 中文调用原因 */
const REASON_LABELS: Record<string, string> = {
    recognizeGrade: "识别年级学期",
    analyzeImage: "识别错题",
    analyzeImageWithPrompt: "图片判分（听写判卷等）",
    generateSimilarQuestion: "出相似题",
    generateFigureSvg: "绘制题目配图",
    reanswerQuestion: "重答分析",
    analyzeForGeogebra: "GeoGebra 分析",
    fixLatex: "LaTeX 修复",
    generateSvgAnimation: "SVG 动画讲解",
    generateSvgNarration: "语音讲解稿",
    evaluateMastery: "掌握度评估",
    gradeAnswer: "判定答案对错",
    suggestKnowledgeTags: "知识点标签",
};

function reasonLabel(reason?: string | null): string {
    if (!reason) return "未知";
    return REASON_LABELS[reason] ?? reason;
}

function fmtTokens(n: number | null | undefined): string {
    const v = n ?? 0;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return String(v);
}

interface DayStat {
    date: string;
    calls: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
}

interface UsageReport {
    days: DayStat[];
    byReason: (DayStat & { reason: string })[];
    summary: Omit<DayStat, "date">;
}

interface CallItem {
    id: string;
    createdAt: string;
    provider: string;
    model: string | null;
    reason: string | null;
    endpoint: string | null;
    status: number | null;
    error: string | null;
    durationMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    cachedTokens: number | null;
}

const DAY_OPTIONS = [7, 30, 90];

export default function AiUsagePage() {
    const [days, setDays] = useState(30);
    const [report, setReport] = useState<UsageReport | null>(null);
    const [items, setItems] = useState<CallItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [reasonFilter, setReasonFilter] = useState("");
    const [outcomeFilter, setOutcomeFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [listLoading, setListLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadReport = useCallback(async (d: number) => {
        setLoading(true);
        try {
            setReport(await apiClient.get<UsageReport>(`/api/ai/usage/daily?days=${d}`));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "加载报表失败");
        } finally {
            setLoading(false);
        }
    }, []);

    const loadCalls = useCallback(
        async (d: number, p: number, reason: string, outcome: string) => {
            setListLoading(true);
            try {
                const params = new URLSearchParams({ days: String(d), page: String(p), pageSize: "50" });
                if (reason) params.set("reason", reason);
                if (outcome) params.set("outcome", outcome);
                const res = await apiClient.get<{ items: CallItem[]; total: number }>(`/api/ai/calls?${params}`);
                setItems(res.items);
                setTotal(res.total);
            } catch (e) {
                setError(e instanceof Error ? e.message : "加载明细失败");
            } finally {
                setListLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 数据请求：进入页面或筛选变化时加载，请求前后更新加载状态
        void loadReport(days);
        void loadCalls(days, page, reasonFilter, outcomeFilter);
    }, [days, page, reasonFilter, outcomeFilter, loadReport, loadCalls]);

    const totalPages = Math.max(Math.ceil(total / 50), 1);
    const maxTokens = Math.max(...(report?.days.map((d) => d.inputTokens + d.outputTokens) ?? [0]), 1);
    const maxReasonCalls = Math.max(...(report?.byReason.map((r) => r.calls) ?? [0]), 1);

    const summaryCards = report
        ? [
              { title: "请求次数", value: String(report.summary.calls), icon: Bot, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
              { title: "错误请求", value: String(report.summary.errors), icon: AlertCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
              {
                  title: "Token 消耗（输入/输出）",
                  value: `${fmtTokens(report.summary.inputTokens)} / ${fmtTokens(report.summary.outputTokens)}`,
                  icon: Coins,
                  color: "text-emerald-500",
                  bg: "bg-emerald-50 dark:bg-emerald-950/30",
              },
              { title: "缓存命中 Token", value: fmtTokens(report.summary.cachedTokens), icon: Database, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/30" },
          ]
        : [];

    return (
        <div className="max-w-6xl mx-auto space-y-6 px-4 py-6 md:px-8 md:py-8">
            <PageHeader backHref="/admin" title="大模型调用" description="每次 AI 调用的用量明细与每日 token 消耗报表。"
                actions={
                    <div className="flex items-center gap-1 rounded-lg border p-1">
                        {DAY_OPTIONS.map((d) => (
                            <Button
                                key={d}
                                size="sm"
                                variant={days === d ? "default" : "ghost"}
                                className="h-8 px-3"
                                onClick={() => {
                                    setDays(d);
                                    setPage(1);
                                }}
                            >
                                {d} 天
                            </Button>
                        ))}
                    </div>
                }
            />

            {error && <p className="text-sm text-destructive">{error}</p>}
            {loading && !report && (
                <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
                </div>
            )}

            {report && (
                <>
                    {/* 汇总卡 */}
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        {summaryCards.map((c) => (
                            <Card key={c.title} className="border-0 shadow-sm">
                                <CardContent className="flex items-center gap-4 p-4">
                                    <div className={`rounded-xl p-3 ${c.bg}`}>
                                        <c.icon className={`h-6 w-6 ${c.color}`} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm text-muted-foreground">{c.title}</p>
                                        <p className="text-2xl font-bold">{c.value}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* 每日消耗图：堆叠柱 = 输入+输出 token，柱顶数字 = 请求次数 */}
                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Coins className="h-4 w-4 text-emerald-500" />
                                每日 Token 消耗与请求次数
                            </CardTitle>
                            <p className="flex gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />输入</span>
                                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />输出</span>
                                <span>柱顶数字为请求次数</span>
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="flex h-48 items-end gap-1">
                                {report.days.map((d) => {
                                    const inH = (d.inputTokens / maxTokens) * 100;
                                    const outH = (d.outputTokens / maxTokens) * 100;
                                    return (
                                        <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                                            <span className="text-[10px] font-medium">{d.calls > 0 ? d.calls : ""}</span>
                                            <div className="flex w-full flex-1 flex-col justify-end" title={`${d.date}：${d.calls} 次请求，输入 ${d.inputTokens}，输出 ${d.outputTokens}${d.errors ? `，错误 ${d.errors}` : ""}`}>
                                                {d.calls > 0 && (
                                                    <>
                                                        <div className="w-full rounded-t-sm bg-emerald-500" style={{ height: `${Math.max(outH, d.outputTokens > 0 ? 3 : 0)}%` }} />
                                                        <div className="w-full bg-blue-500" style={{ height: `${Math.max(inH, d.inputTokens > 0 ? 3 : 0)}%` }} />
                                                    </>
                                                )}
                                            </div>
                                            <span className="w-full truncate text-center text-[10px] text-muted-foreground">{d.date.slice(5).replace("-", "/")}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* 按调用原因汇总 */}
                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Bot className="h-4 w-4 text-blue-500" />
                                按调用原因汇总
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {report.byReason.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">该时段没有 AI 调用。</p>
                            ) : (
                                <div className="space-y-3">
                                    {report.byReason.map((r) => (
                                        <button
                                            key={r.reason}
                                            className="w-full space-y-1 text-left"
                                            onClick={() => {
                                                setReasonFilter(r.reason === reasonFilter ? "" : r.reason);
                                                setPage(1);
                                            }}
                                            title="点击筛选明细"
                                        >
                                            <div className="flex justify-between text-sm">
                                                <span className={`font-medium ${r.reason === reasonFilter ? "text-primary" : ""}`}>
                                                    {reasonLabel(r.reason)}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {r.calls} 次{r.errors > 0 && <span className="text-destructive">（错 {r.errors}）</span>}
                                                    {" · "}
                                                    {fmtTokens(r.inputTokens)}入/{fmtTokens(r.outputTokens)}出
                                                    {r.cachedTokens > 0 && ` · 缓存 ${fmtTokens(r.cachedTokens)}`}
                                                </span>
                                            </div>
                                            <div className="h-2.5 w-full rounded-full bg-muted">
                                                <div
                                                    className="h-2.5 rounded-full bg-blue-500 transition-all duration-500"
                                                    style={{ width: `${Math.round((r.calls / maxReasonCalls) * 100)}%` }}
                                                />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            {/* 调用明细 */}
            <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-2">
                    <CardTitle className="text-base">调用明细（{total} 条）</CardTitle>
                    <div className="ml-auto flex flex-wrap gap-2">
                        <select
                            className="h-8 rounded-md border bg-background px-2 text-sm"
                            value={reasonFilter}
                            onChange={(e) => {
                                setReasonFilter(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">全部原因</option>
                            {Object.entries(REASON_LABELS).map(([k, label]) => (
                                <option key={k} value={k}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        <select
                            className="h-8 rounded-md border bg-background px-2 text-sm"
                            value={outcomeFilter}
                            onChange={(e) => {
                                setOutcomeFilter(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">全部结果</option>
                            <option value="ok">成功</option>
                            <option value="error">失败</option>
                        </select>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => void loadCalls(days, page, reasonFilter, outcomeFilter)}>
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs text-muted-foreground">
                                    <th className="py-2 pr-3 font-medium">时间</th>
                                    <th className="py-2 pr-3 font-medium">原因</th>
                                    <th className="py-2 pr-3 font-medium">渠道 / 模型</th>
                                    <th className="py-2 pr-3 font-medium">状态</th>
                                    <th className="py-2 pr-3 text-right font-medium">输入</th>
                                    <th className="py-2 pr-3 text-right font-medium">输出</th>
                                    <th className="py-2 pr-3 text-right font-medium">缓存</th>
                                    <th className="py-2 text-right font-medium">耗时</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((it) => {
                                    const failed = it.status === null || it.status >= 400;
                                    return (
                                        <tr key={it.id} className="border-b last:border-0">
                                            <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-muted-foreground">
                                                {new Date(it.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                            </td>
                                            <td className="py-2 pr-3">{reasonLabel(it.reason)}</td>
                                            <td className="py-2 pr-3">
                                                <span className="font-medium">{it.provider}</span>
                                                <span className="ml-1 text-xs text-muted-foreground">{it.model ?? ""}</span>
                                            </td>
                                            <td className="py-2 pr-3">
                                                {failed ? (
                                                    <span className="text-destructive" title={it.error ?? ""}>
                                                        失败{it.status !== null ? ` ${it.status}` : "（网络）"}
                                                    </span>
                                                ) : (
                                                    <span className="text-emerald-600">{it.status}</span>
                                                )}
                                            </td>
                                            <td className="py-2 pr-3 text-right tabular-nums">{it.inputTokens ?? "—"}</td>
                                            <td className="py-2 pr-3 text-right tabular-nums">{it.outputTokens ?? "—"}</td>
                                            <td className="py-2 pr-3 text-right tabular-nums text-purple-600">{it.cachedTokens ?? "—"}</td>
                                            <td className="py-2 text-right tabular-nums text-muted-foreground">
                                                {it.durationMs !== null ? (it.durationMs >= 1000 ? `${(it.durationMs / 1000).toFixed(1)}s` : `${it.durationMs}ms`) : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {!listLoading && items.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="py-8 text-center text-muted-foreground">
                                            没有符合条件的调用记录。
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {listLoading && (
                        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
                        </div>
                    )}
                    {totalPages > 1 && (
                        <div className="mt-4 flex items-center justify-center gap-3">
                            <Button variant="outline" size="sm" disabled={page <= 1 || listLoading} onClick={() => setPage((p) => p - 1)}>
                                <ChevronLeft className="h-4 w-4" /> 上一页
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                {page} / {totalPages}
                            </span>
                            <Button variant="outline" size="sm" disabled={page >= totalPages || listLoading} onClick={() => setPage((p) => p + 1)}>
                                下一页 <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
