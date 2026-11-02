/**
 * 全局轻提示与确认框，替代浏览器原生 alert / confirm。
 * 由 FeedbackHost 订阅并渲染；未挂载 FeedbackHost 时（如单元测试）提示静默丢弃，确认框回退到原生 confirm。
 */

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
    id: number;
    type: ToastType;
    message: string;
}

export interface ConfirmOptions {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    /** 危险操作（删除、重置等）使用红色确认按钮 */
    destructive?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
    id: number;
    message: string;
    resolve: (ok: boolean) => void;
}

interface FeedbackState {
    toasts: ToastItem[];
    confirm: ConfirmRequest | null;
}

type Listener = (state: FeedbackState) => void;

const TOAST_DURATION: Record<ToastType, number> = {
    success: 2500,
    info: 3500,
    warning: 4500,
    error: 5000,
};

let state: FeedbackState = { toasts: [], confirm: null };
let nextId = 1;
const listeners = new Set<Listener>();

function emit(next: FeedbackState) {
    state = next;
    listeners.forEach((listener) => listener(state));
}

export function subscribeFeedback(listener: Listener): () => void {
    listeners.add(listener);
    listener(state);
    return () => {
        listeners.delete(listener);
    };
}

export function dismissToast(id: number) {
    emit({ ...state, toasts: state.toasts.filter((item) => item.id !== id) });
}

function show(type: ToastType, message: unknown) {
    const text = typeof message === "string" ? message : String(message ?? "");
    if (!text) return;
    const id = nextId++;
    // 最多同时保留 4 条，避免连续操作时堆满屏幕
    emit({ ...state, toasts: [...state.toasts.slice(-3), { id, type, message: text }] });
    setTimeout(() => dismissToast(id), TOAST_DURATION[type]);
}

export const toast = {
    success: (message: unknown) => show("success", message),
    error: (message: unknown) => show("error", message),
    info: (message: unknown) => show("info", message),
    warning: (message: unknown) => show("warning", message),
};

export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    if (listeners.size === 0) {
        return Promise.resolve(typeof window !== "undefined" && typeof window.confirm === "function"
            ? window.confirm(message)
            : false);
    }
    // 已有确认框未关闭时，视为取消旧的
    state.confirm?.resolve(false);
    return new Promise((resolve) => {
        const id = nextId++;
        emit({
            ...state,
            confirm: {
                ...options,
                id,
                message,
                resolve: (ok) => {
                    if (state.confirm?.id === id) emit({ ...state, confirm: null });
                    resolve(ok);
                },
            },
        });
    });
}
