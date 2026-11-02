"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { apiClient } from "@/lib/api-client";
import { Loader2, BookOpen } from "lucide-react";

interface BookRef {
    grade: number;
    semester: "上" | "下";
}

interface GroupItem {
    pos: number;
    char: string;
    pinyin: string | null;
    polyphone: number;
}

interface TextbookGroup {
    gid: number;
    label: string;
    section: string | null;
    seq: number;
    kind: string;
    pagePrint: number;
    pagePdf: number;
    items: GroupItem[];
}

interface TextbookResponse {
    available: boolean;
    books: BookRef[];
    current?: { grade: number; semester: string; list: string };
    groups?: TextbookGroup[];
}

const LISTS = ["识字表", "写字表", "词语表"] as const;
const LIST_DESC: Record<string, string> = {
    识字表: "会认的生字，蓝色为多音字",
    写字表: "要求会写的字",
    词语表: "课文要求掌握的词语",
};

export default function YuwenPage() {
    const [data, setData] = useState<TextbookResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [grade, setGrade] = useState<number | null>(null);
    const [semester, setSemester] = useState<"上" | "下">("上");
    const [list, setList] = useState<(typeof LISTS)[number]>("识字表");

    useEffect(() => {
        apiClient
            .get<TextbookResponse>("/api/yuwen/textbook")
            .then((d) => {
                setData(d);
                if (d.available && d.current) {
                    setGrade(d.current.grade);
                    setSemester(d.current.semester === "下" ? "下" : "上");
                }
            })
            .catch(() => setData({ available: false, books: [] }))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (grade === null) return;
        const params = new URLSearchParams({
            grade: String(grade),
            semester,
            list,
        });
        setLoading(true);
        apiClient
            .get<TextbookResponse>(`/api/yuwen/textbook?${params.toString()}`)
            .then((d) => setData(d))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [grade, semester, list]);

    if (loading && !data) {
        return (
            <div className="container mx-auto max-w-4xl px-4 py-16 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" /> 正在加载…
            </div>
        );
    }

    if (!data?.available) {
        return (
            <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
                <p className="mb-4 text-sm text-muted-foreground">
                    课内字词库未安装（缺少 data/yuwen/textbook.sqlite）。
                </p>
                <Button variant="outline" onClick={() => history.back()}>
                    返回
                </Button>
            </div>
        );
    }

    const books = data.books ?? [];
    const groups = data.groups ?? [];

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8">
            <div className="mb-6 flex items-center gap-3">
                <BackButton fallbackUrl="/dictation" />
                <BookOpen className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-2xl font-bold">语文课内字词</h1>
            </div>

            <div className="mb-6 flex flex-wrap items-center gap-2">
                {books.map((b) => {
                    const active =
                        grade === b.grade && semester === b.semester;
                    return (
                        <Button
                            key={`${b.grade}${b.semester}`}
                            size="sm"
                            variant={active ? "default" : "outline"}
                            onClick={() => {
                                setGrade(b.grade);
                                setSemester(b.semester);
                            }}
                        >
                            {b.grade}年级{b.semester}册
                        </Button>
                    );
                })}
                <div className="mx-2 h-5 w-px bg-border" />
                {LISTS.map((l) => (
                    <Button
                        key={l}
                        size="sm"
                        variant={list === l ? "default" : "outline"}
                        onClick={() => setList(l)}
                    >
                        {l}
                    </Button>
                ))}
            </div>

            <p className="mb-4 text-xs text-muted-foreground">
                {LIST_DESC[list]}
                {list === "识字表" && " · 蓝色字表示多音字（不计入生字总数）"}
            </p>

            {loading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" /> 加载中…
                </div>
            ) : groups.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                    该册没有这个表。
                </div>
            ) : (
                <div className="space-y-4">
                    {groups.map((g) => (
                        <Card key={g.gid}>
                            <CardContent className="pt-4">
                                <div className="mb-3 flex items-center gap-2">
                                    <Badge
                                        variant={
                                            g.kind === "yuandi"
                                                ? "secondary"
                                                : "outline"
                                        }
                                        className="text-xs"
                                    >
                                        {g.label}
                                    </Badge>
                                    {g.section && (
                                        <span className="text-xs text-muted-foreground">
                                            {g.section}
                                        </span>
                                    )}
                                    <span className="ml-auto text-xs text-muted-foreground">
                                        教材第 {g.pagePrint} 页
                                    </span>
                                </div>
                                {list === "词语表" ? (
                                    <div className="flex flex-wrap gap-2">
                                        {g.items.map((it) => (
                                            <span
                                                key={it.pos}
                                                className="rounded-md border px-2.5 py-1 text-lg"
                                            >
                                                {it.char}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-x-4 gap-y-3">
                                        {g.items.map((it) => (
                                            <div
                                                key={it.pos}
                                                className="flex w-12 flex-col items-center"
                                            >
                                                <span
                                                    className={`h-5 text-[11px] leading-5 ${
                                                        it.pinyin
                                                            ? "text-muted-foreground"
                                                            : ""
                                                    }`}
                                                >
                                                    {it.pinyin || ""}
                                                </span>
                                                <span
                                                    className={`text-3xl leading-9 ${
                                                        it.polyphone === 1
                                                            ? "text-blue-600 dark:text-blue-400 font-semibold"
                                                            : ""
                                                    }`}
                                                >
                                                    {it.char}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
