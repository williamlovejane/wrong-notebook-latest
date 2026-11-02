import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 去掉末尾的所有斜杠（不用正则，避免长串斜杠导致回溯） */
export function trimTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === "/") end--
  return value.slice(0, end)
}

/** 校验并规范化 AI 服务地址：只接受 http/https，去掉末尾斜杠；不合法时抛出错误 */
export function normalizeHttpBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Invalid base URL: ${value}`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Base URL must use http or https: ${value}`)
  }
  return trimTrailingSlashes(url.toString())
}
