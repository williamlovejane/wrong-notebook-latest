"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { UserPreferenceSwitch } from "@/components/settings/user-preference-switch";

/** 「SVG 动画讲解」开关（默认开启），切换后立即保存到用户偏好 */
export function SvgAnimationPreferenceSetting() {
    const { t } = useLanguage();
    return (
        <UserPreferenceSwitch
            field="enableSvgAnimation"
            label={t.importFlow.enableSvgAnimation}
            description={t.importFlow.enableSvgAnimationDesc}
        />
    );
}
