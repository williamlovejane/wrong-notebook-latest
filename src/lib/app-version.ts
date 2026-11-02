import { version as packageVersion } from "../../package.json";

/**
 * 应用版本：优先使用构建时由 Git 标签注入的 APP_VERSION（去掉前缀 v），
 * 未注入时（本地开发、无标签的构建）回退到 package.json 中的版本
 */
export function getAppVersion(): string {
    const fromTag = process.env.APP_VERSION?.trim().replace(/^v/, "");
    return fromTag || packageVersion;
}
