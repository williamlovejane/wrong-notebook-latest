import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/date-time";
import type { Translations } from "@/lib/translations";
import type { AppConfig } from "@/types/api";

/** 保存前校验当前渠道的必填项，返回错误提示 */
export function validateAiConfig(config: AppConfig, t: Translations): string | null {
    if (!isValidTimeZone(config.timeZone ?? DEFAULT_TIME_ZONE)) {
        return t.settings.general.invalidTimeZone;
    }
    if (config.aiProvider === 'openai') {
        for (const instance of config.openai?.instances || []) {
            if (!instance.name?.trim()) return t.settings?.ai?.validationNameRequired || "Instance name is required";
            if (!instance.apiKey?.trim()) return t.settings?.ai?.validationApiKeyRequired || "API Key is required";
            if (!instance.baseUrl?.trim()) return t.settings?.ai?.validationBaseUrlRequired || "Base URL is required";
            if (!instance.model?.trim()) return t.settings?.ai?.validationModelRequired || "Model name is required";
        }
    }
    if (config.aiProvider === 'azure') {
        if (!config.azure?.endpoint?.trim()) return t.settings?.ai?.validationAzureEndpointRequired || 'Azure Endpoint is required';
        if (!config.azure?.deploymentName?.trim()) return t.settings?.ai?.validationAzureDeploymentRequired || 'Deployment Name is required';
        if (!config.azure?.apiKey?.trim()) return t.settings?.ai?.validationApiKeyRequired || 'API Key is required';
    }
    return null;
}
