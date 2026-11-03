/**
 * 听写复习调试模式：允许 admin 用模拟时间触发任意一天的复习计划。
 *
 * 用法：请求带 `?debugNow=YYYY-MM-DD`（或 `x-debug-now` 请求头），
 * 服务端把该值当作"现在"参与到期判断与复习排程。
 * 仅 role === "admin" 生效，其他人一律走真实时间；客户端把模拟值
 * 存在 sessionStorage（key 见 DEBUG_NOW_STORAGE_KEY）以贯通列表页与答题页。
 */

export const DEBUG_NOW_PARAM = "debugNow";
export const DEBUG_NOW_STORAGE_KEY = "dictation-debug-now";

/** 解析调试时间：YYYY-MM-DD 视为当天 09:00（本地时区），完整 ISO 直接解析；非法返回 null */
export function parseDebugNow(raw: string | null | undefined): Date | null {
    if (!raw) return null;
    const s = raw.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(`${s}T09:00:00`);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * 从请求解析模拟时间。非 admin 或参数非法时返回 null（调用方退回真实时间），
 * 不报错——调试参数对普通用户完全透明。
 */
export function resolveDebugNow(req: Request, role: string | undefined | null): Date | null {
    if (role !== "admin") return null;
    let raw: string | null = null;
    try {
        raw = new URL(req.url).searchParams.get(DEBUG_NOW_PARAM);
    } catch {
        raw = null;
    }
    raw = raw ?? req.headers.get("x-debug-now");
    return parseDebugNow(raw);
}
