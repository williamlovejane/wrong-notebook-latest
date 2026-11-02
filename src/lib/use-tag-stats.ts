import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import type { TagStats, TagStatsResponse } from "@/types/api";

/** 加载当前用户的知识点使用次数统计 */
export function useTagStats() {
    const [stats, setStats] = useState<TagStats[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        apiClient.get<TagStatsResponse>("/api/tags/stats")
            .then((data) => {
                if (!cancelled) setStats(data.stats);
            })
            .catch((error) => {
                frontendLogger.error('[Tags]', 'Failed to fetch tag stats', { error });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return { stats, loading };
}
