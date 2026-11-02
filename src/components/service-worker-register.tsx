"use client";

import { useEffect } from "react";
import { frontendLogger } from "@/lib/frontend-logger";

/**
 * 注册 PWA Service Worker（public/sw.js）。
 * 仅生产环境注册，避免开发时缓存干扰热更新；Service Worker 需要安全上下文（HTTPS 或 localhost）。
 */
export function ServiceWorkerRegister() {
    useEffect(() => {
        if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
            frontendLogger.warn("[PWA]", "Service worker registration failed", { error: String(error) });
        });
    }, []);

    return null;
}
