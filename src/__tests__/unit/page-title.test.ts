/**
 * 页面标题拼接单元测试
 */
import { describe, it, expect } from 'vitest';
import { formatPageTitle } from '@/lib/page-title';

describe('formatPageTitle', () => {
    it('没有片段时只返回基础标题', () => {
        expect(formatPageTitle('AI智能错题本', [])).toBe('AI智能错题本');
    });

    it('应该按顺序用短横线拼接各级标题', () => {
        expect(formatPageTitle('AI智能错题本', ['错题试卷', '期中复习'])).toBe('AI智能错题本-错题试卷-期中复习');
    });

    it('应该忽略空值和空白片段', () => {
        expect(formatPageTitle('AI智能错题本', ['错题试卷', null, undefined, false, '  ', ' 期中 '])).toBe('AI智能错题本-错题试卷-期中');
    });
});
