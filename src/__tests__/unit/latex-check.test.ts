import { describe, expect, it } from 'vitest';
import { countLatexIssues, findLatexIssues, findLatexIssuesByField, isAcceptableLatexFix } from '@/lib/latex-check';
import { parseLatexFix } from '@/lib/ai/latex-fix';
import { generateLatexFixPrompt, generateReanswerPrompt, LATEX_RULES } from '@/lib/ai/prompts';

describe('findLatexIssues', () => {
    it('正确的公式没有问题，包括 \\(…\\)、\\[…\\]、cases 和公式外的字面 \\n', () => {
        expect(findLatexIssues('求 $\\frac{1}{2}$ 和 $$x^2$$，\\(a \\neq b\\)，\\[\\sqrt{2}\\]')).toEqual([]);
        expect(findLatexIssues('$$\\begin{cases}x+y=1\\\\x-y=3\\end{cases}$$')).toEqual([]);
        expect(findLatexIssues('第一步。\\n第二步\\nx 的值')).toEqual([]);
        expect(findLatexIssues('')).toEqual([]);
        expect(findLatexIssues(null)).toEqual([]);
    });

    it('检出 KaTeX 无法解析的公式', () => {
        const issues = findLatexIssues('求 $\\frac{1}{2$ 的值，$\\foo x$');
        expect(issues).toHaveLength(2);
        expect(issues[0].snippet).toBe('$\\frac{1}{2$');
        expect(issues[1].message).toMatch(/foo/);
    });

    it('检出未配对的定界符和公式外的 LaTeX 命令', () => {
        expect(findLatexIssues('面积为 $S=6')[0].message).toMatch(/未配对的 \$/);
        expect(findLatexIssues('解：\\[x=1')[0].message).toMatch(/未配对/);
        expect(findLatexIssues('角 \\angle A 等于 \\frac{1}{2}，且 a \\neq b')[0].snippet).toBe('\\angle \\frac \\neq');
        expect(findLatexIssues('价格是 \\$5')).toEqual([]);
    });

    it('按字段汇总', () => {
        const byField = findLatexIssuesByField({ questionText: '$x$', answerText: '$\\frac{1}{$', analysis: '\\times 2' });
        expect(Object.keys(byField)).toEqual(['answerText', 'analysis']);
        expect(countLatexIssues(byField)).toBe(2);
    });
});

describe('isAcceptableLatexFix', () => {
    it('问题减少且长度相近时采用', () => {
        expect(isAcceptableLatexFix('求 $\\frac{1}{2$ 的值', '求 $\\frac{1}{2}$ 的值')).toBe(true);
    });

    it('问题没有减少、内容被大幅删改或为空时不采用', () => {
        expect(isAcceptableLatexFix('求 $\\frac{1}{2$ 的值', '求 $\\frac{1}{2$ 的值')).toBe(false);
        expect(isAcceptableLatexFix('求 $\\frac{1}{2$ 的值，详细解析很长很长很长很长很长', '$\\frac{1}{2}$')).toBe(false);
        expect(isAcceptableLatexFix('$\\frac{1}{2$', '  ')).toBe(false);
    });
});

describe('LaTeX 修复提示词与解析', () => {
    const input = {
        answerText: { text: '$\\frac{1}{2$', issues: ['$\\frac{1}{2$：Expected }'] },
        analysis: { text: '\\times 2', issues: ['\\times：命令没有放在 $…$ 中'] },
    };

    it('只列出有问题的字段，包含原文、问题和规范', () => {
        const prompt = generateLatexFixPrompt(input);
        expect(prompt).toContain('<answer_text>\n$\\frac{1}{2$\n</answer_text>');
        expect(prompt).toContain('Expected }');
        expect(prompt).toContain('<analysis>');
        expect(prompt).not.toContain('<question_text>');
        expect(prompt).toContain(LATEX_RULES);
        expect(prompt).not.toMatch(/\{\{\w+\}\}/);
    });

    it('解析各字段的修复结果，忽略缺失或为空的标签', () => {
        expect(parseLatexFix('<answer_text>\n$\\frac{1}{2}$\n</answer_text><analysis>  </analysis>', input)).toEqual({ answerText: '$\\frac{1}{2}$' });
    });

    it('规范中的反斜杠命令保持原样，重新解题提示词要求完整解答并包含规范', () => {
        expect(LATEX_RULES).toContain('\\frac');
        expect(LATEX_RULES).toContain('\\begin{cases}');
        const prompt = generateReanswerPrompt('zh', '求 1+1');
        expect(prompt).toContain(LATEX_RULES);
        expect(prompt).toContain('解答完整');
    });
});
