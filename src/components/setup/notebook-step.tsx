"use client";

import { useState } from "react";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { CreateNotebookDialog } from "@/components/create-notebook-dialog";
import type { CreateNotebookInput } from "@/components/create-notebook-dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient, ApiError } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/error-message";
import { toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";

/** 向导第 3 步：创建第一个错题本，复用错题本页的创建对话框 */
export function NotebookStep() {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const [createdNames, setCreatedNames] = useState<string[]>([]);

    const handleCreate = async (input: CreateNotebookInput) => {
        try {
            await apiClient.post("/api/notebooks", input);
            setCreatedNames((prev) => [...prev, input.name]);
        } catch (error) {
            // 同名笔记本已存在（409）：向导场景视为幂等成功，不再挡流程
            if (error instanceof ApiError && error.status === 409) {
                setCreatedNames((prev) => (prev.includes(input.name) ? prev : [...prev, input.name]));
                toast.info(t.setup.notebook.exists.replace("{name}", input.name));
                return;
            }
            frontendLogger.error('[Setup]', 'Failed to create notebook', { error });
            toast.error(getApiErrorMessage(error) || t.notebooks?.createError || "Failed to create");
            throw error;
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">{t.setup.notebook.title}</h2>
                <p className="text-sm text-muted-foreground">{t.setup.notebook.desc}</p>
            </div>
            {createdNames.map((name) => (
                <p key={name} className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {t.setup.notebook.created.replace("{name}", name)}
                </p>
            ))}
            <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
                <BookOpen className="mr-2 h-4 w-4" />
                {t.setup.notebook.create}
            </Button>
            <CreateNotebookDialog open={open} onOpenChange={setOpen} onCreate={handleCreate} />
        </div>
    );
}
