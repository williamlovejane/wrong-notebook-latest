import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixLatexButton } from '@/components/fix-latex-button';
import { LanguageProvider } from '@/contexts/LanguageContext';

vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { error: vi.fn() } }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

const render = (fields: Record<string, string>) => act(async () => root.render(
    <LanguageProvider><FixLatexButton errorItemId="e1" fields={fields} onDone={() => undefined} /></LanguageProvider>
));

describe('FixLatexButton', () => {
    it('没有检测到 LaTeX 错误时不显示', async () => {
        await render({ questionText: '求 $\\frac{1}{2}$ 的值', answerText: '$1$' });
        expect(container.querySelector('button')).toBeNull();
    });

    it('检测到错误时显示按钮和问题数，修好后消失', async () => {
        await render({ questionText: '求 $\\frac{1}{2$ 的值', analysis: '因为 \\angle A = 90°' });
        expect(container.querySelector('button')?.textContent).toContain('(2)');

        await render({ questionText: '求 $\\frac{1}{2}$ 的值', analysis: '因为 $\\angle A = 90°$' });
        expect(container.querySelector('button')).toBeNull();
    });
});
