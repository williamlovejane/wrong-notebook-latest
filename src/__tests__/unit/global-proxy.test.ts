/**
 * 全局代理配置单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { bootstrap, setGlobalDispatcher } = vi.hoisted(() => ({ bootstrap: vi.fn(), setGlobalDispatcher: vi.fn() }));

vi.mock('global-agent', () => ({ bootstrap }));
vi.mock('undici', () => ({
    ProxyAgent: vi.fn(function ProxyAgent(this: { url: string }, url: string) {
        this.url = url;
    }),
    setGlobalDispatcher,
}));

import { setupGlobalProxy } from '@/lib/global-proxy';

const PROXY_KEYS = [
    'http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY',
    'GLOBAL_AGENT_HTTP_PROXY', 'GLOBAL_AGENT_HTTPS_PROXY',
];
const originalEnv = { ...process.env };

describe('setupGlobalProxy', () => {
    beforeEach(() => {
        for (const key of PROXY_KEYS) delete process.env[key];
        bootstrap.mockClear();
        setGlobalDispatcher.mockClear();
        delete (globalThis as { GLOBAL_AGENT?: unknown }).GLOBAL_AGENT;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('未配置代理时不做任何改动', () => {
        setupGlobalProxy();
        expect(bootstrap).not.toHaveBeenCalled();
        expect(setGlobalDispatcher).not.toHaveBeenCalled();
    });

    it('配置代理后设置 fetch 代理并初始化 global-agent', () => {
        process.env.HTTPS_PROXY = 'http://proxy.example:8080';
        setupGlobalProxy();
        expect(setGlobalDispatcher).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://proxy.example:8080' }));
        expect(process.env.GLOBAL_AGENT_HTTPS_PROXY).toBe('http://proxy.example:8080');
        expect(bootstrap).toHaveBeenCalledTimes(1);
        // 预先写入 GLOBAL_AGENT 会让 bootstrap 跳过初始化
        expect((globalThis as { GLOBAL_AGENT?: unknown }).GLOBAL_AGENT).toBeUndefined();
    });

    it('ALL_PROXY 同时作为 HTTP 和 HTTPS 代理', () => {
        process.env.ALL_PROXY = 'http://all.example:1080';
        setupGlobalProxy();
        expect(process.env.GLOBAL_AGENT_HTTP_PROXY).toBe('http://all.example:1080');
        expect(process.env.GLOBAL_AGENT_HTTPS_PROXY).toBe('http://all.example:1080');
    });
});
