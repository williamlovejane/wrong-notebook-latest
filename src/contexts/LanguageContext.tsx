"use client";

import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { translations, Language } from '@/lib/translations';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: typeof translations['en'];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'app-language';
const DEFAULT_LANGUAGE: Language = 'zh';

// 界面语言保存在 localStorage，作为外部状态订阅；本页切换时通知订阅者，其他标签页切换时由 storage 事件通知
const languageListeners = new Set<() => void>();

function subscribeLanguage(listener: () => void) {
    languageListeners.add(listener);
    window.addEventListener('storage', listener);
    return () => {
        languageListeners.delete(listener);
        window.removeEventListener('storage', listener);
    };
}

function readLanguage(): Language {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'zh' || saved === 'en' ? saved : DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    // 服务端渲染与水合阶段使用默认语言，之后读取保存的语言
    const language = useSyncExternalStore(subscribeLanguage, readLanguage, () => DEFAULT_LANGUAGE);

    const handleSetLanguage = (lang: Language) => {
        localStorage.setItem(STORAGE_KEY, lang);
        languageListeners.forEach((listener) => listener());
    };

    const value = {
        language,
        setLanguage: handleSetLanguage,
        t: translations[language],
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
