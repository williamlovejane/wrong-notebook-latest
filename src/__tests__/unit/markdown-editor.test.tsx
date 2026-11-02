import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from '@/components/markdown-editor';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { translations } from '@/lib/translations';

let container: HTMLDivElement;
let root: Root;
const zh = translations.zh.markdownEditor;

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

function Harness({ initial }: { initial: string }) {
    const [value, setValue] = useState(initial);
    return <MarkdownEditor value={value} onChange={setValue} />;
}

const tab = (label: string) => [...container.querySelectorAll('button[role="tab"]')].find((b) => b.textContent === label) as HTMLButtonElement;

describe('MarkdownEditor 源代码/预览切换', () => {
    it('默认显示源代码，切换到预览后用 KaTeX 渲染公式，再切回可继续编辑', async () => {
        await act(async () => root.render(<LanguageProvider><Harness initial={'求 $\\frac{1}{2}$ 的值'} /></LanguageProvider>));

        expect(container.querySelector('textarea')?.value).toBe('求 $\\frac{1}{2}$ 的值');
        expect(tab(zh.source).getAttribute('aria-selected')).toBe('true');

        await act(async () => tab(zh.preview).click());
        expect(container.querySelector('textarea')).toBeNull();
        expect(container.querySelector('.katex')).not.toBeNull();

        await act(async () => tab(zh.source).click());
        expect(container.querySelector('textarea')?.value).toBe('求 $\\frac{1}{2}$ 的值');
    });

    it('内容为空时预览显示占位文字，双击预览回到源代码', async () => {
        await act(async () => root.render(<LanguageProvider><Harness initial="" /></LanguageProvider>));
        await act(async () => tab(zh.preview).click());

        const preview = container.querySelector('[role="tabpanel"] > div') as HTMLDivElement;
        expect(preview.textContent).toBe(zh.empty);

        await act(async () => preview.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
        expect(container.querySelector('textarea')).not.toBeNull();
    });
});
