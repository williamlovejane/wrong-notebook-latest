"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { dismissToast, subscribeFeedback } from "@/lib/feedback";
import type { ConfirmRequest, ToastItem, ToastType } from "@/lib/feedback";
import { cn } from "@/lib/utils";

const TOAST_STYLE: Record<ToastType, { icon: typeof Info; className: string }> = {
    success: { icon: CheckCircle2, className: "text-success" },
    error: { icon: XCircle, className: "text-destructive" },
    warning: { icon: AlertTriangle, className: "text-warning" },
    info: { icon: Info, className: "text-primary" },
};

/** 渲染全局轻提示与确认框，挂载在根布局中 */
export function FeedbackHost() {
    const { t } = useLanguage();
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

    useEffect(() => subscribeFeedback((state) => {
        setToasts(state.toasts);
        setConfirm(state.confirm);
    }), []);

    return (
        <>
            <div
                className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 print:hidden"
                role="status"
                aria-live="polite"
            >
                {toasts.map((item) => {
                    const { icon: Icon, className } = TOAST_STYLE[item.type];
                    return (
                        <div
                            key={item.id}
                            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card/95 px-4 py-3 text-sm shadow-lg backdrop-blur animate-in fade-in slide-in-from-top-2 duration-200"
                        >
                            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} />
                            <p className="min-w-0 flex-1 whitespace-pre-line break-words leading-relaxed">{item.message}</p>
                            <button
                                type="button"
                                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                                onClick={() => dismissToast(item.id)}
                                aria-label={t.common.close}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>

            <Dialog open={!!confirm} onOpenChange={(open) => { if (!open) confirm?.resolve(false); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {confirm?.destructive && <AlertTriangle className="h-5 w-5 text-destructive" />}
                            {confirm?.title || t.common.confirmTitle}
                        </DialogTitle>
                        <DialogDescription className="whitespace-pre-line pt-1 text-left leading-relaxed">
                            {confirm?.message}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => confirm?.resolve(false)}>
                            {confirm?.cancelText || t.common.cancel}
                        </Button>
                        <Button
                            variant={confirm?.destructive ? "destructive" : "default"}
                            onClick={() => confirm?.resolve(true)}
                            autoFocus
                        >
                            {confirm?.confirmText || t.common.confirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
