import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DifficultyStars } from '@/components/difficulty-stars';
import { LanguageProvider } from '@/contexts/LanguageContext';

const render = (element: React.ReactElement) => renderToStaticMarkup(<LanguageProvider>{element}</LanguageProvider>);
const filledCount = (markup: string) => (markup.match(/fill-amber-400/g) || []).length;

describe('难度星级', () => {
    it('只读模式按星级点亮对应数量的星星', () => {
        const markup = render(<DifficultyStars value={3} />);
        expect(filledCount(markup)).toBe(3);
        expect(markup).toContain('难度：3 星');
        expect(markup).not.toContain('<button');
    });

    it('未评级时只读模式显示「未评级」，可配置为不显示', () => {
        expect(render(<DifficultyStars value={null} />)).toContain('未评级');
        expect(render(<DifficultyStars value={null} showUnrated={false} />)).toBe('');
    });

    it('可编辑模式渲染 5 个可点击的星级按钮', () => {
        const markup = render(<DifficultyStars value={2} onChange={() => undefined} />);
        expect((markup.match(/<button/g) || []).length).toBe(5);
        expect(markup).toContain('设为 5 星');
        expect(filledCount(markup)).toBe(2);
    });
});
