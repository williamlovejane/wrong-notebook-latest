"use client";

import { useState } from "react";
import type { ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

/** 密码、API Key 等敏感内容的输入框，右侧按钮切换明文显示 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
    const { t } = useLanguage();
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative">
            <Input type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? t.common.hidePassword : t.common.showPassword}
                tabIndex={-1}
            >
                {visible ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </Button>
        </div>
    );
}
