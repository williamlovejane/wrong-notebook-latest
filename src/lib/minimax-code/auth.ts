/**
 * MiniMax Code 登录流程与 Access Token 管理：
 *   - 设备码登录：start 保存待授权记录，poll 轮询到授权后写入账号
 *   - 取 Token 时提前 5 分钟刷新；同一进程内的并发刷新合并为一次，避免一次性 refresh token 被重复使用
 */
import { createLogger } from '@/lib/logger';
import {
    fetchProfile,
    MiniMaxCodeAuthError,
    pollDeviceLogin,
    refreshTokens,
    startDeviceLogin,
} from './api';
import type { DeviceLogin } from './api';
import { readMiniMaxCodeState, updateMiniMaxCodeState } from './store';
import type { MiniMaxCodeAccount } from './store';

const logger = createLogger('minimax-code');

const REFRESH_AHEAD_MS = 5 * 60 * 1000;

// 挂在 globalThis 上，开发模式热更新后仍是同一个刷新任务
const globalRefresh = globalThis as typeof globalThis & { __minimaxCodeRefresh?: Promise<string> };

export type LoginPollResult =
    | { status: 'pending' }
    | { status: 'ok'; account: Pick<MiniMaxCodeAccount, 'name' | 'email' | 'userId'> }
    | { status: 'expired' | 'denied' | 'none' };

export async function startLogin(): Promise<Pick<DeviceLogin, 'url' | 'userCode' | 'expiresAt' | 'intervalMs'>> {
    const login = await startDeviceLogin();
    updateMiniMaxCodeState((state) => ({ ...state, pendingLogin: login }));
    return { url: login.url, userCode: login.userCode, expiresAt: login.expiresAt, intervalMs: login.intervalMs };
}

export async function pollLogin(): Promise<LoginPollResult> {
    const pending = readMiniMaxCodeState().pendingLogin;
    if (!pending) return { status: 'none' };
    if (Date.parse(pending.expiresAt) <= Date.now()) {
        updateMiniMaxCodeState(({ pendingLogin: _expired, ...state }) => state);
        return { status: 'expired' };
    }

    let tokens;
    try {
        tokens = await pollDeviceLogin(pending);
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === 'MINIMAX_CODE_LOGIN_EXPIRED' || message === 'MINIMAX_CODE_LOGIN_DENIED') {
            updateMiniMaxCodeState(({ pendingLogin: _done, ...state }) => state);
            return { status: message === 'MINIMAX_CODE_LOGIN_EXPIRED' ? 'expired' : 'denied' };
        }
        throw error;
    }
    if (!tokens) return { status: 'pending' };

    // 资料只用于显示，获取失败不影响登录
    const profile = await fetchProfile(tokens.accessToken).catch((error) => {
        logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Failed to fetch MiniMax Code profile');
        return null;
    });
    const account: MiniMaxCodeAccount = {
        ...tokens,
        userId: profile?.userId || null,
        name: profile?.name || null,
        email: profile?.email || null,
        loggedInAt: new Date().toISOString(),
    };
    updateMiniMaxCodeState(({ pendingLogin: _done, ...state }) => ({ ...state, account }));
    logger.info({ userId: account.userId }, 'MiniMax Code logged in');
    return { status: 'ok', account: { name: account.name, email: account.email, userId: account.userId } };
}

export function logout(): void {
    updateMiniMaxCodeState(({ account: _account, pendingLogin: _pending, ...state }) => state);
    logger.info('MiniMax Code logged out');
}

async function refreshAccount(): Promise<string> {
    const account = readMiniMaxCodeState().account;
    if (!account?.refreshToken || account.invalid) throw new Error('AI_AUTH_ERROR: MiniMax Code login expired');
    try {
        const tokens = await refreshTokens(account.refreshToken);
        // 旧 refresh token 已作废，先落盘再使用
        updateMiniMaxCodeState((state) => state.account ? { ...state, account: { ...state.account, ...tokens, invalid: false } } : state);
        logger.info('MiniMax Code token refreshed');
        return tokens.accessToken;
    } catch (error) {
        if (error instanceof MiniMaxCodeAuthError) {
            updateMiniMaxCodeState((state) => state.account ? { ...state, account: { ...state.account, invalid: true } } : state);
            logger.warn('MiniMax Code refresh token rejected, login required');
            throw new Error('AI_AUTH_ERROR: MiniMax Code login expired');
        }
        throw error;
    }
}

/** 返回可用的 Access Token；force 为 true 时无论是否到期都刷新（上游返回 401 后使用） */
export async function getAccessToken(options: { force?: boolean } = {}): Promise<string> {
    const account = readMiniMaxCodeState().account;
    if (!account) throw new Error('AI_AUTH_ERROR: MiniMax Code is not logged in');
    if (account.invalid) throw new Error('AI_AUTH_ERROR: MiniMax Code login expired');
    if (!options.force && Date.parse(account.expiresAt) - Date.now() > REFRESH_AHEAD_MS) {
        return account.accessToken;
    }
    if (!globalRefresh.__minimaxCodeRefresh) {
        globalRefresh.__minimaxCodeRefresh = refreshAccount().finally(() => {
            globalRefresh.__minimaxCodeRefresh = undefined;
        });
    }
    return globalRefresh.__minimaxCodeRefresh;
}

/** 用 Access Token 调用 fn；凭据被拒（MiniMaxCodeAuthError 或 AI_AUTH_ERROR）时强制刷新后重试一次 */
export async function withAccessToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const token = await getAccessToken();
    try {
        return await fn(token);
    } catch (error) {
        const rejected = error instanceof MiniMaxCodeAuthError
            || (error instanceof Error && error.message.startsWith('AI_AUTH_ERROR'));
        if (!rejected) throw error;
        return fn(await getAccessToken({ force: true }));
    }
}
