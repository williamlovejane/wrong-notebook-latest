/**
 * 用 KaTeX 检查题目文字中的 LaTeX 语法：与页面渲染使用同一套公式切分规则，
 * 检查出的问题就是页面上显示为红色错误或原样显示源码的地方。前后端共用。
 */
import katex from 'katex';
import { extractMathSegments } from './markdown-math';

export interface LatexIssue {
    /** 出错的公式或片段 */
    snippet: string;
    /** 错误说明 */
    message: string;
}

const SNIPPET_MAX_LENGTH = 80;

const N_COMMANDS = new Set(['ne', 'neq', 'nabla', 'nu', 'not', 'notin', 'ni', 'nexists', 'ngeq', 'nleq', 'nmid', 'nparallel', 'nsubseteq']);

function clip(text: string): string {
    return text.length > SNIPPET_MAX_LENGTH ? `${text.slice(0, SNIPPET_MAX_LENGTH)}…` : text;
}

/** 检查一段 Markdown 中的 LaTeX 问题 */
export function findLatexIssues(content: string | null | undefined): LatexIssue[] {
    if (!content?.trim()) return [];
    const { masked, segments } = extractMathSegments(content);
    const issues: LatexIssue[] = [];

    for (const segment of segments) {
        try {
            katex.renderToString(segment.tex, { displayMode: segment.displayMode, throwOnError: true, strict: 'ignore' });
        } catch (error) {
            const message = error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, '') : String(error);
            issues.push({ snippet: clip(segment.source), message });
        }
    }

    // 公式以外的文字：未配对的定界符、没有放进 $…$ 的 LaTeX 命令
    const text = masked.replace(/@@MATH\d+@@/g, ' ');
    const strayDollar = text.replace(/\\\$/g, '').match(/\$/g);
    if (strayDollar) {
        issues.push({ snippet: '$', message: `有 ${strayDollar.length} 个未配对的 $ 定界符` });
    }
    const strayDelimiter = text.match(/\\[()[\]]/g);
    if (strayDelimiter) {
        issues.push({ snippet: strayDelimiter.join(' '), message: '有未配对的 \\( \\) 或 \\[ \\] 定界符' });
    }
    // 字面的 "\n" 后紧跟字母（如 \nx）是换行而不是命令，只把以 n 开头的常见命令算作命令
    const bareCommands = [...new Set(text.match(/\\[a-zA-Z]{2,}/g) || [])]
        .filter((command) => !command.startsWith('\\n') || N_COMMANDS.has(command.slice(1)));
    if (bareCommands.length > 0) {
        issues.push({ snippet: clip(bareCommands.join(' ')), message: 'LaTeX 命令没有放在 $…$ 中，会原样显示' });
    }
    return issues;
}

/** 题目中可能包含 LaTeX 的字段 */
export const LATEX_FIELDS = ['questionText', 'answerText', 'analysis', 'wrongAnswerText', 'mistakeAnalysis'] as const;
export type LatexField = typeof LATEX_FIELDS[number];

/** 按字段检查，只返回有问题的字段 */
export function findLatexIssuesByField(fields: Partial<Record<LatexField, string | null | undefined>>): Partial<Record<LatexField, LatexIssue[]>> {
    const result: Partial<Record<LatexField, LatexIssue[]>> = {};
    for (const field of LATEX_FIELDS) {
        const issues = findLatexIssues(fields[field]);
        if (issues.length > 0) result[field] = issues;
    }
    return result;
}

/** 各字段问题总数 */
export function countLatexIssues(byField: Partial<Record<LatexField, LatexIssue[]>>): number {
    return Object.values(byField).reduce((sum, issues) => sum + (issues?.length ?? 0), 0);
}

/**
 * AI 修复结果是否可以采用：问题必须减少，且长度变化不大（只改公式写法，不应大幅增删内容）
 */
export function isAcceptableLatexFix(original: string, fixed: string): boolean {
    if (!fixed.trim()) return false;
    const ratio = fixed.length / Math.max(original.length, 1);
    if (ratio < 0.7 || ratio > 1.5) return false;
    return findLatexIssues(fixed).length < findLatexIssues(original).length;
}
