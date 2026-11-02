"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import type { UserProfile } from "@/types/api";

type BooleanPreference = "confirmBeforeImport" | "enableGeogebra" | "enableSvgAnimation";

interface UserPreferenceSwitchProps {
    field: BooleanPreference;
    label: string;
    description: string;
}

/** 用户偏好开关，切换后立即保存到 /api/user */
export function UserPreferenceSwitch({ field, label, description }: UserPreferenceSwitchProps) {
    const { t } = useLanguage();
    const [checked, setChecked] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const id = `preference-${field}`;

    useEffect(() => {
        apiClient.get<UserProfile>("/api/user")
            .then((user) => setChecked(!!user[field]))
            .catch(() => undefined)
            .finally(() => setLoaded(true));
    }, [field]);

    const handleChange = async (value: boolean) => {
        setChecked(value);
        setSaving(true);
        try {
            await apiClient.patch("/api/user", { [field]: value });
            setMessage(t.importFlow.preferenceSaved);
        } catch (error) {
            setChecked(!value);
            setMessage(t.importFlow.preferenceSaveFailed);
            frontendLogger.error('[Settings]', 'Failed to save user preference', {
                field,
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center justify-between gap-4">
                <Label htmlFor={id}>{label}</Label>
                <Switch id={id} checked={checked} onCheckedChange={handleChange} disabled={!loaded || saving} />
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
            {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </div>
    );
}
