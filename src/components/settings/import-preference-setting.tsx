"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { UserPreferenceSwitch } from "@/components/settings/user-preference-switch";

/** 「导入前人工确认」开关，切换后立即保存到用户偏好 */
export function ImportPreferenceSetting() {
    const { t } = useLanguage();
    return (
        <UserPreferenceSwitch
            field="confirmBeforeImport"
            label={t.importFlow.confirmBeforeImport}
            description={t.importFlow.confirmBeforeImportDesc}
        />
    );
}
