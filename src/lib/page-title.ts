"use client";

import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export type PageTitlePart = string | null | undefined | false;

/** 拼接浏览器标题，如「AI智能错题本-错题试卷-期中复习」，空片段自动忽略 */
export function formatPageTitle(base: string, parts: PageTitlePart[]): string {
    const segments = parts
        .map((part) => (typeof part === "string" ? part.trim() : ""))
        .filter((part) => part.length > 0);
    return [base, ...segments].join("-");
}

/** 根据当前页面设置浏览器标题 */
export function usePageTitle(...parts: PageTitlePart[]): void {
    const { t } = useLanguage();
    const title = formatPageTitle(t.pageTitle.base, parts);

    useEffect(() => {
        document.title = title;
    }, [title]);
}
