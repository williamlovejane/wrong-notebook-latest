"use client";

import type { ReactNode } from "react";
import { EyeOff, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface ToggleImageProps {
    src?: string | null;
    alt: string;
    showLabel: string;
    hideLabel: string;
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    onEnlarge: (src: string) => void;
    variant?: "outline" | "ghost";
    /** 与显示按钮并排的其他按钮 */
    actions?: ReactNode;
}

/** 默认折叠的图片：点击按钮显示，点击图片放大 */
export function ToggleImage({ src, alt, showLabel, hideLabel, visible, onVisibleChange, onEnlarge, variant = "ghost", actions }: ToggleImageProps) {
    const { t } = useLanguage();

    return (
        <>
            <div className="flex flex-wrap gap-2">
                {src && (
                    <Button variant={variant} size="sm" onClick={() => onVisibleChange(!visible)} className={`flex items-center gap-2 ${variant === "ghost" ? "text-muted-foreground" : ""}`}>
                        {visible ? <><EyeOff className="h-4 w-4" />{hideLabel}</> : <><ImageIcon className="h-4 w-4" />{showLabel}</>}
                    </Button>
                )}
                {actions}
            </div>
            {src && visible && (
                <div className="mt-4">
                    <img src={src} alt={alt} className="w-full rounded-lg border cursor-pointer hover:opacity-90 transition-opacity" onClick={() => onEnlarge(src)} />
                    <p className="text-xs text-muted-foreground mt-1 text-center">{t.detail?.clickToEnlarge || "Click to enlarge"}</p>
                </div>
            )}
        </>
    );
}
