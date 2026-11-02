import { LATEX_FIX_TAGS } from './prompts';
import type { LatexFixField } from './prompts';

/** 修复 LaTeX 的输入：字段原文与检测到的问题 */
export type LatexFixInput = Partial<Record<LatexFixField, { text: string; issues: string[] }>>;

/** 修复结果：只包含 AI 返回了非空内容的字段 */
export type LatexFixResult = Partial<Record<LatexFixField, string>>;

/** 从 AI 回复中取出各字段修复后的内容 */
export function parseLatexFix(text: string, input: LatexFixInput): LatexFixResult {
    const result: LatexFixResult = {};
    for (const field of Object.keys(input) as LatexFixField[]) {
        const tag = LATEX_FIX_TAGS[field];
        const start = text.indexOf(`<${tag}>`);
        if (start === -1) continue;
        const contentStart = start + tag.length + 2;
        const end = text.indexOf(`</${tag}>`, contentStart);
        if (end === -1) continue;
        const content = text.slice(contentStart, end).trim();
        if (content) result[field] = content;
    }
    return result;
}
