"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { UserPreferenceSwitch } from "@/components/settings/user-preference-switch";

/** 「GeoGebra 动态演示」开关（默认关闭），切换后立即保存到用户偏好 */
export function GeogebraPreferenceSetting() {
    const { t } = useLanguage();
    return (
        <UserPreferenceSwitch
            field="enableGeogebra"
            label={t.importFlow.enableGeogebra}
            description={t.importFlow.enableGeogebraDesc}
        />
    );
}
