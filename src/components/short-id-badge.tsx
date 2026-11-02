"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ShortIdBadgeProps {
    shortId?: string | null;
    className?: string;
}

/** 显示题目短 ID，点击复制 */
export function ShortIdBadge({ shortId, className = "" }: ShortIdBadgeProps) {
    const { t } = useLanguage();
    const [copied, setCopied] = useState(false);

    if (!shortId) return null;

    const handleCopy = async (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            await navigator.clipboard.writeText(shortId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // 非安全上下文无法写剪贴板，退回到选中文本
            window.prompt(t.shortId.copy, shortId);
        }
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            title={copied ? t.shortId.copied : t.shortId.copy}
            className={`inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors ${className}`}
        >
            <span>{t.shortId.label}</span>
            <span className="font-semibold text-foreground">{shortId}</span>
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}
