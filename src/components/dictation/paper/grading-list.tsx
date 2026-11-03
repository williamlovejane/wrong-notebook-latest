"use client";

import { Check, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface GradingItem {
    logId: string;
    n?: number;
    expected: string;
    pinyin: string;
    /** AI 识别内容；人工判分为 null */
    recognized: string | null;
    correct: boolean | null;
}

interface GradingListProps {
    items: GradingItem[];
    /** 三态切换：AI 判分可改，人工判分从未知开始 */
    onSetCorrect: (logId: string, correct: boolean | null) => void;
}

/** 试卷判分列表：拍照 AI 判分结果确认 / 人工逐题录入共用 */
export function GradingList({ items, onSetCorrect }: GradingListProps) {
    return (
        <ul className="divide-y rounded-lg border">
            {items.map((item) => (
                <li key={item.logId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="w-8 text-sm font-semibold text-muted-foreground">
                        {item.n ?? "·"}
                    </span>
                    <span className="min-w-[4rem] text-lg font-medium">{item.expected}</span>
                    <span className="text-sm text-muted-foreground">{item.pinyin}</span>

                    {item.recognized !== null && (
                        <span className="text-sm text-muted-foreground">
                            AI 识别：
                            <span
                                className={
                                    item.recognized === item.expected
                                        ? "font-medium text-foreground"
                                        : "font-medium text-amber-600"
                                }
                            >
                                {item.recognized || "（空）"}
                            </span>
                        </span>
                    )}

                    <span className="ml-auto flex items-center gap-1">
                        {item.correct === null && (
                            <span className="mr-2 flex items-center text-xs text-muted-foreground">
                                <HelpCircle className="mr-1 h-3.5 w-3.5" /> 待判定
                            </span>
                        )}
                        <Button
                            type="button"
                            size="sm"
                            variant={item.correct === true ? "default" : "outline"}
                            className={
                                item.correct === true
                                    ? "bg-emerald-600 hover:bg-emerald-700"
                                    : undefined
                            }
                            onClick={() =>
                                onSetCorrect(item.logId, item.correct === true ? null : true)
                            }
                        >
                            <Check className="mr-1 h-4 w-4" /> 对
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={item.correct === false ? "default" : "outline"}
                            className={
                                item.correct === false ? "bg-destructive hover:bg-destructive" : undefined
                            }
                            onClick={() =>
                                onSetCorrect(item.logId, item.correct === false ? null : false)
                            }
                        >
                            <X className="mr-1 h-4 w-4" /> 错
                        </Button>
                    </span>
                </li>
            ))}
        </ul>
    );
}
