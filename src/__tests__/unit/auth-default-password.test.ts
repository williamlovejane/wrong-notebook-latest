/**
 * 默认密码检测：管理员用默认密码登录时会话带 mustChangePassword，改密后经 update() 解除
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JWT } from 'next-auth/jwt';
import type { User } from 'next-auth';

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(),
    compare: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: vi.fn(() => ({})) }));
vi.mock('bcryptjs', () => ({ compare: mocks.compare }));
vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { authOptions } from '@/lib/auth';
import { isDefaultAdminPassword } from '@/lib/default-admin';

type AuthorizeFn = (credentials: Record<string, string>) => Promise<(User & { mustChangePassword?: boolean }) | null>;
const credentialsProvider = authOptions.providers[0] as unknown as { options: { authorize: AuthorizeFn } };
const authorize = (email: string, password: string) => credentialsProvider.options.authorize({ email, password });
const jwt = authOptions.callbacks!.jwt! as unknown as (params: { token: JWT; user?: User; trigger?: string }) => Promise<JWT>;

const adminRow = { id: 'admin-1', email: 'admin@localhost', name: 'Admin', role: 'admin', isActive: true, password: 'hashed' };

describe('isDefaultAdminPassword', () => {
    it('只有管理员使用 123456 时才算默认密码', () => {
        expect(isDefaultAdminPassword('admin', '123456')).toBe(true);
        expect(isDefaultAdminPassword('admin', 'another-pass')).toBe(false);
        expect(isDefaultAdminPassword('user', '123456')).toBe(false);
        expect(isDefaultAdminPassword(undefined, '123456')).toBe(false);
    });
});

describe('authorize 默认密码标记', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.compare.mockResolvedValue(true);
    });

    it('管理员用默认密码登录时标记必须改密', async () => {
        mocks.findUnique.mockResolvedValue(adminRow);

        const user = await authorize('admin@localhost', '123456');

        expect(user?.mustChangePassword).toBe(true);
    });

    it('管理员用其他密码登录时不标记', async () => {
        mocks.findUnique.mockResolvedValue(adminRow);

        const user = await authorize('admin@localhost', 'my-new-pass');

        expect(user?.mustChangePassword).toBe(false);
    });

    it('普通用户即使密码是 123456 也不标记', async () => {
        mocks.findUnique.mockResolvedValue({ ...adminRow, role: 'user' });

        const user = await authorize('user@example.com', '123456');

        expect(user?.mustChangePassword).toBe(false);
    });
});

describe('jwt 回调', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('登录时把标记写入 token', async () => {
        const token = await jwt({ token: {} as JWT, user: { id: 'admin-1', role: 'admin', mustChangePassword: true } as User });

        expect(token.mustChangePassword).toBe(true);
    });

    it('update 时数据库密码已不是默认密码则解除标记', async () => {
        mocks.findUnique.mockResolvedValue({ password: 'hashed-new' });
        mocks.compare.mockResolvedValue(false);

        const token = await jwt({ token: { id: 'admin-1', mustChangePassword: true } as JWT, trigger: 'update' });

        expect(mocks.compare).toHaveBeenCalledWith('123456', 'hashed-new');
        expect(token.mustChangePassword).toBe(false);
    });

    it('update 时仍是默认密码则保持标记', async () => {
        mocks.findUnique.mockResolvedValue({ password: 'hashed-default' });
        mocks.compare.mockResolvedValue(true);

        const token = await jwt({ token: { id: 'admin-1', mustChangePassword: true } as JWT, trigger: 'update' });

        expect(token.mustChangePassword).toBe(true);
    });

    it('未标记的 token 在 update 时不查库', async () => {
        const token = await jwt({ token: { id: 'user-1', mustChangePassword: false } as JWT, trigger: 'update' });

        expect(mocks.findUnique).not.toHaveBeenCalled();
        expect(token.mustChangePassword).toBe(false);
    });
});
