/**
 * /api/error-items/:id/figure 集成测试：用原题图片重绘 SVG 配图
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    user: { findUnique: vi.fn() },
    errorItem: { findUnique: vi.fn(), update: vi.fn() },
    generateFigureSvg: vi.fn(),
    session: { user: { email: 'user@example.com' }, expires: '2099-01-01' } as { user: { email: string }; expires: string } | null,
}));

vi.mock('@/lib/prisma', () => ({ prisma: { user: mocks.user, errorItem: mocks.errorItem } }));
vi.mock('@/lib/ai', () => ({ getAIService: vi.fn(() => ({ generateFigureSvg: mocks.generateFigureSvg })) }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(() => Promise.resolve(mocks.session)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { POST } from '@/app/api/error-items/[id]/figure/route';

const call = () => POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ id: 'e1' }) });
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

describe('POST /api/error-items/:id/figure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.session = { user: { email: 'user@example.com' }, expires: '2099-01-01' };
        mocks.user.findUnique.mockResolvedValue({ id: 'user-1' });
        mocks.errorItem.findUnique.mockResolvedValue({ userId: 'user-1', originalImageUrl: 'data:image/png;base64,QUJD', questionText: '如图，求三角形面积' });
        mocks.errorItem.update.mockImplementation(async ({ data }) => data);
    });

    it('把原题图片和题干交给 AI，保存识别出的配图', async () => {
        mocks.generateFigureSvg.mockResolvedValue({ hasFigure: true, figureSvg: svg });

        const response = await call();

        expect(response.status).toBe(200);
        expect(mocks.generateFigureSvg).toHaveBeenCalledWith('QUJD', 'image/png', '如图，求三角形面积');
        expect(mocks.errorItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hasFigure: true, figureSvg: svg } }));
        expect(await response.json()).toEqual({ hasFigure: true, figureSvg: svg });
    });

    it('AI 判断没有配图时清除旧配图', async () => {
        mocks.generateFigureSvg.mockResolvedValue({ hasFigure: false, figureSvg: null });

        await call();

        expect(mocks.errorItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hasFigure: false, figureSvg: null } }));
    });

    it('未登录 401，他人题目 404，没有原图 400，均不调用 AI', async () => {
        mocks.session = null;
        expect((await call()).status).toBe(401);

        mocks.session = { user: { email: 'user@example.com' }, expires: '2099-01-01' };
        mocks.errorItem.findUnique.mockResolvedValueOnce({ userId: 'other', originalImageUrl: 'data:image/png;base64,QUJD', questionText: '' });
        expect((await call()).status).toBe(404);

        mocks.errorItem.findUnique.mockResolvedValueOnce({ userId: 'user-1', originalImageUrl: '', questionText: '文字题' });
        const noImage = await call();
        expect(noImage.status).toBe(400);
        expect((await noImage.json()).message).toBe('NO_ORIGINAL_IMAGE');

        expect(mocks.generateFigureSvg).not.toHaveBeenCalled();
        expect(mocks.errorItem.update).not.toHaveBeenCalled();
    });

    it('AI 错误码透传给前端', async () => {
        mocks.generateFigureSvg.mockRejectedValue(new Error('AI_TIMEOUT_ERROR'));

        const response = await call();

        expect(response.status).toBe(500);
        expect((await response.json()).message).toBe('AI_TIMEOUT_ERROR');
    });
});
