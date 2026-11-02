"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { confirmDialog } from "@/lib/feedback";

interface RetagJobStatus {
    total: number;
    done: number;
    failed: number;
    running: boolean;
    finishedAt: string | null;
}

interface RetagNotebookButtonProps {
    notebookId: string;
    /** 批量任务完成后回调，用于刷新列表 */
    onFinished?: () => void;
}

const POLL_INTERVAL_MS = 2000;

/** 错题本批量重新生成知识点：发起后台任务并显示进度 */
export function RetagNotebookButton({ notebookId, onFinished }: RetagNotebookButtonProps) {
    const { t } = useLanguage();
    const [job, setJob] = useState<RetagJobStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    // 记录上一次状态是否在运行，用于判断任务刚刚结束
    const runningRef = useRef(false);

    const fetchStatus = useCallback(() => {
        apiClient.get<RetagJobStatus | null>(`/api/notebooks/${notebookId}/retag`)
            .then((status) => {
                if (runningRef.current && status && !status.running) onFinished?.();
                runningRef.current = !!status?.running;
                setJob(status);
            })
            .catch(() => undefined);
    }, [notebookId, onFinished]);

    // 进入页面时恢复正在运行的任务进度
    useEffect(fetchStatus, [fetchStatus]);

    useEffect(() => {
        if (!job?.running) return;
        const timer = setTimeout(fetchStatus, POLL_INTERVAL_MS);
        return () => clearTimeout(timer);
    }, [job, fetchStatus]);

    const start = async () => {
        if (!(await confirmDialog(t.retag.notebookConfirm))) return;
        setError(null);
        try {
            const status = await apiClient.post<RetagJobStatus>(`/api/notebooks/${notebookId}/retag`, {});
            if (status.total === 0) {
                setError(t.retag.empty);
                return;
            }
            runningRef.current = status.running;
            setJob(status);
        } catch {
            setError(t.retag.itemFailed);
        }
    };

    const message = error
        ?? (job?.running
            ? t.retag.progress.replace("{done}", String(job.done)).replace("{total}", String(job.total))
            : job?.finishedAt && job.total > 0
                ? t.retag.finished.replace("{success}", String(job.total - job.failed)).replace("{failed}", String(job.failed))
                : null);

    return (
        <div className="flex flex-col items-start sm:items-end gap-1">
            <Button variant="outline" size="sm" onClick={start} disabled={job?.running} aria-label={t.retag.notebookButton}>
                {job?.running ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <Sparkles className="h-4 w-4 sm:mr-2" />}
                <span className="hidden sm:inline">{t.retag.notebookButton}</span>
            </Button>
            {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </div>
    );
}
