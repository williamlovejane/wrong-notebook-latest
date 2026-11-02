"use client";

import { useEffect, useState } from "react";
import { AiProviderSettings } from "@/components/settings/ai-provider-settings";
import { useLanguage } from "@/contexts/LanguageContext";
import { validateAiConfig } from "@/lib/ai-config-validation";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";
import type { AppConfig } from "@/types/api";

interface AiStepProps {
    onSaved: () => void;
}

/** 向导第 2 步：选择 AI 渠道、测试连接并保存，复用设置页的渠道表单 */
export function AiStep({ onSaved }: AiStepProps) {
    const { t } = useLanguage();
    const [config, setConfig] = useState<AppConfig>({ aiProvider: 'minimax' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        apiClient.get<AppConfig>("/api/settings")
            .then((loaded) => {
                // 默认渠道还没填 Key 时，推荐免费的 MiniMax Code 网页登录
                const unconfigured = loaded.aiProvider === 'minimax' && !loaded.minimax?.apiKey;
                setConfig(unconfigured ? { ...loaded, aiProvider: 'minimax-code' } : loaded);
            })
            .catch((error) => frontendLogger.error('[Setup]', 'Failed to fetch settings', { error }))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        const validationError = validateAiConfig(config, t);
        if (validationError) {
            toast.error(validationError);
            return;
        }

        setSaving(true);
        try {
            setConfig(await apiClient.post<AppConfig>("/api/settings", config));
            toast.success(t.settings?.messages?.saved || "Settings saved");
            onSaved();
        } catch (error) {
            frontendLogger.error('[Setup]', 'Failed to save AI settings', { error });
            toast.error(t.settings?.messages?.saveFailed || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">{t.setup.ai.title}</h2>
                <p className="text-sm text-muted-foreground">{t.setup.ai.desc}</p>
            </div>
            <AiProviderSettings config={config} setConfig={setConfig} loading={loading} saving={saving} onSave={handleSave} />
        </div>
    );
}
