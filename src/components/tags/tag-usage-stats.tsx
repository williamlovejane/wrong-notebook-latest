"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { useTagStats } from "@/lib/use-tag-stats";

/** 知识点使用频率（Top 20） */
export function TagUsageStats() {
    const { t } = useLanguage();
    const { stats, loading } = useTagStats();

    if (loading) return <div className="text-center py-8">{t.tags?.stats?.loading || "Loading..."}</div>;
    if (stats.length === 0) return <div className="text-center py-8 text-muted-foreground">{t.tags?.stats?.empty || "No tag usage records yet"}</div>;
    const maxCount = stats[0]?.count || 1;
    return (
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />{t.tags?.stats?.frequency || "Tag Usage Frequency (Top 20)"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
                {stats.slice(0, 20).map((stat) => (
                    <div key={stat.tag} className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                            <span className="font-medium">{stat.tag}</span>
                            <span className="text-muted-foreground">{stat.count} {t.tags?.stats?.count || "times"}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${(stat.count / maxCount) * 100}%` }} />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
