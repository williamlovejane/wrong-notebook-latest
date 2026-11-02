"use client";

import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";

interface AuthShellProps {
    children: React.ReactNode;
    /** 内容较多的页面（如安装向导）用更宽的版心 */
    wide?: boolean;
}

/** 登录、注册、安装向导页的外层：品牌标识 + 渐变背景 */
export function AuthShell({ children, wide = false }: AuthShellProps) {
    const { t } = useLanguage();

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
            <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-400/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-violet-400/20 blur-3xl" />

            <div className={`relative w-full space-y-6 py-8 ${wide ? "max-w-xl" : "max-w-md"}`}>
                <div className="flex flex-col items-center gap-3 text-center">
                    <Image src="/icons/icon.png" alt="" width={64} height={64} className="rounded-2xl shadow-lg shadow-indigo-500/30" priority unoptimized />
                    <div className="space-y-1">
                        <p className="text-xl font-bold tracking-tight">{t.pageTitle.base}</p>
                        <p className="text-sm text-muted-foreground">{t.app.subtitle}</p>
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
}
