import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ImportResultBanner } from '@/components/import-result-banner';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { translations } from '@/lib/translations';

describe('导入结果提示', () => {
    const render = (duplicate: boolean) => renderToStaticMarkup(
        <LanguageProvider>
            <ImportResultBanner imported={{ id: 'existing', shortId: 'AbC234', subjectId: 'math', notebookName: '数学', duplicate }} onDismiss={() => undefined} />
        </LanguageProvider>,
    );

    it('重复时提示已记录本次错误，并链接到原题', () => {
        const markup = render(true);
        expect(markup).toContain(translations.zh.importFlow.duplicate);
        expect(markup).toContain('href="/error-items/existing"');
        expect(markup).not.toContain('已导入错题本');
    });

    it('新增题目继续显示所在错题本与短 ID', () => {
        const markup = render(false);
        expect(markup).toContain('已导入错题本「数学」，题目 ID：AbC234');
        expect(markup).not.toContain(translations.zh.importFlow.duplicate);
    });
});
