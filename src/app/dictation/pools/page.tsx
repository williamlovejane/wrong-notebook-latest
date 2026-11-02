"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, Star, Loader2, Save } from "lucide-react";

interface Pool {
    id: string;
    name: string;
    chars: string;
    charCount: number;
    isDefault: boolean;
    entryCount: number;
}

export default function PoolsPage() {
    const [pools, setPools] = useState<Pool[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [newName, setNewName] = useState("");
    const [newChars, setNewChars] = useState("");

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingChars, setEditingChars] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiClient.get<{ pools: Pool[] }>("/api/dictation/pools");
            setPools(data.pools);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const createPool = async () => {
        if (!newName.trim()) {
            setError("请填写字库名称");
            return;
        }
        setSaving(true);
        try {
            await apiClient.post("/api/dictation/pools", {
                name: newName.trim(),
                chars: newChars,
            });
            setNewName("");
            setNewChars("");
            setError(null);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "创建失败");
        } finally {
            setSaving(false);
        }
    };

    const saveChars = async (id: string) => {
        setSaving(true);
        try {
            await apiClient.patch(`/api/dictation/pools/${id}`, { chars: editingChars });
            setEditingId(null);
            setError(null);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const setDefault = async (id: string) => {
        try {
            await apiClient.patch(`/api/dictation/pools/${id}`, { isDefault: true });
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "设置失败");
        }
    };

    const remove = async (pool: Pool) => {
        if (!confirm(`删除字库「${pool.name}」？已关联的 ${pool.entryCount} 个生字不会被删除，但会失去字库。`)) {
            return;
        }
        try {
            await apiClient.delete(`/api/dictation/pools/${pool.id}`);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "删除失败");
        }
    };

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8">
            <div className="mb-6 flex items-center gap-3">
                <BackButton fallbackUrl="/dictation" />
                <div>
                    <h1 className="text-2xl font-bold">备选字库</h1>
                    <p className="text-sm text-muted-foreground">
                        学生已经认识的字。AI 组词时只会用这些字加上待考生字，保证不出超纲题。
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="text-base">新建字库</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Input
                        placeholder="字库名称，例如：一年级上册已认字"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                    />
                    <textarea
                        className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="粘贴学生已认识的字，可以是「天地人你我他」也可以直接粘贴课文，标点会被自动忽略"
                        value={newChars}
                        onChange={(e) => setNewChars(e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                            已识别 {Array.from(new Set(Array.from(newChars).filter((c) => /[\u4e00-\u9fa5]/.test(c)))).length} 个不同汉字
                        </span>
                        <Button onClick={createPool} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            创建
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
                </div>
            ) : pools.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没有字库，先建一个吧。</p>
            ) : (
                <div className="space-y-3">
                    {pools.map((pool) => (
                        <Card key={pool.id}>
                            <CardContent className="space-y-3 pt-5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{pool.name}</span>
                                    {pool.isDefault && (
                                        <Badge variant="secondary" className="gap-1">
                                            <Star className="h-3 w-3" /> 默认
                                        </Badge>
                                    )}
                                    <Badge variant="outline">{pool.charCount} 字</Badge>
                                    <Badge variant="outline">{pool.entryCount} 个生字</Badge>
                                    <div className="ml-auto flex gap-2">
                                        {!pool.isDefault && (
                                            <Button variant="ghost" size="sm" onClick={() => setDefault(pool.id)}>
                                                设为默认
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setEditingId(editingId === pool.id ? null : pool.id);
                                                setEditingChars(pool.chars);
                                            }}
                                        >
                                            {editingId === pool.id ? "收起" : "编辑字表"}
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => remove(pool)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>

                                {editingId === pool.id ? (
                                    <div className="space-y-2">
                                        <textarea
                                            className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm leading-7"
                                            value={editingChars}
                                            onChange={(e) => setEditingChars(e.target.value)}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                                                取消
                                            </Button>
                                            <Button size="sm" onClick={() => saveChars(pool.id)} disabled={saving}>
                                                <Save className="mr-2 h-4 w-4" /> 保存
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="max-h-20 overflow-hidden break-all font-mono text-sm leading-7 text-muted-foreground">
                                        {pool.chars || "（空）"}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <p className="mt-6 text-xs text-muted-foreground">
                生字管理在 <Link href="/dictation" className="underline">默写复习</Link> 页面。
            </p>
        </div>
    );
}
