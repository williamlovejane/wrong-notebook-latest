/**
 * 课内字词参考库只读访问层。
 *
 * 两个参考库都不进 Prisma（那是业务库），用 better-sqlite3 只读打开：
 * - textbook.sqlite：五册语文教材字词表（识字/写字/词语表，含多音字标记、页码出处）
 * - words.db：jieba 分词词表（33万词，带词频），用于"课内字两两组合"的成词性验证
 *
 * 文件位置：{projectRoot}/data/yuwen/。容器里 data/ 目录整体挂载为 /app/data，
 * 因此无需额外 docker-compose 配置；缺文件时相关功能优雅降级（返回不可用）。
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { currentSemesterFromProfile, type SemesterRef } from "./semester";

export { currentSemesterFromProfile };
export type { SemesterRef };

export interface TextbookChar {
    char: string;
    pinyin: string;
    polyphone: boolean; // 蓝色多音字
    list: string; // 识字表 | 写字表
    label: string; // 组标记：课文编号 / 语文园地X
    grade: number;
    semester: "上" | "下";
    pagePrint: number;
}

export interface TextbookWordHit {
    word: string;
    grade: number;
    semester: "上" | "下";
}

const YUWEN_DIR =
    process.env.YUWEN_DB_DIR || path.join(process.cwd(), "data", "yuwen");

interface DbEntry {
    db: Database.Database;
    missing: boolean;
}

const globalForYuwen = global as unknown as {
    __yuwenTextbook?: DbEntry;
    __yuwenWords?: DbEntry;
};

function openReadonly(file: string): DbEntry {
    const full = path.join(YUWEN_DIR, file);
    if (!fs.existsSync(full)) {
        return { db: null as unknown as Database.Database, missing: true };
    }
    try {
        const db = new Database(full, { readonly: true, fileMustExist: true });
        db.pragma("query_only = 1");
        return { db, missing: false };
    } catch {
        return { db: null as unknown as Database.Database, missing: true };
    }
}

function getTextbook(): DbEntry {
    if (!globalForYuwen.__yuwenTextbook) {
        globalForYuwen.__yuwenTextbook = openReadonly("textbook.sqlite");
    }
    return globalForYuwen.__yuwenTextbook;
}

function getWords(): DbEntry {
    if (!globalForYuwen.__yuwenWords) {
        globalForYuwen.__yuwenWords = openReadonly("words.db");
    }
    return globalForYuwen.__yuwenWords;
}

/** 课内字词库是否可用 */
export function isTextbookAvailable(): boolean {
    return !getTextbook().missing;
}

/** jieba 词表是否可用 */
export function isWordsDictAvailable(): boolean {
    return !getWords().missing;
}

const SEM_ORDER = (s: string) => (s === "上" ? 0 : 1);

/**
 * 查一个字在教材里最早出现的学期（用于 AI 组词时控制难度，
 * 以及错字录入时推断出处）。
 */
export function lookupCharSemester(char: string): SemesterRef | null {
    const { db, missing } = getTextbook();
    if (missing) return null;
    try {
        const row = db
            .prepare(
                `SELECT * FROM (
                    SELECT g.grade AS grade, g.semester AS semester
                    FROM shizi s JOIN groups g ON s.gid = g.gid
                    WHERE s.char = ?
                    UNION ALL
                    SELECT g.grade AS grade, g.semester AS semester
                    FROM xiezi x JOIN groups g ON x.gid = g.gid
                    WHERE x.char = ?
                 )
                 ORDER BY grade ASC, (CASE WHEN semester = '上' THEN 0 ELSE 1 END) ASC
                 LIMIT 1`
            )
            .get(char, char) as { grade: number; semester: string } | undefined;
        if (!row) return null;
        return { grade: row.grade, semester: row.semester === "上" ? "上" : "下" };
    } catch {
        return null;
    }
}

/**
 * 词语表（ciyu）里找含目标字的词，按学期从低到高。
 * 返回的词未做过备选字库校验，调用方需用 validateWord 过滤。
 */
export function findWordsInCiyu(target: string, limit = 20): TextbookWordHit[] {
    const { db, missing } = getTextbook();
    if (missing) return [];
    try {
        const rows = db
            .prepare(
                `SELECT c.word AS word, g.grade AS grade, g.semester AS semester
                 FROM ciyu c JOIN groups g ON c.gid = g.gid
                 WHERE instr(c.word, ?) > 0
                 ORDER BY g.grade ASC, (CASE WHEN g.semester = '上' THEN 0 ELSE 1 END) ASC`
            )
            .all(target) as { word: string; grade: number; semester: string }[];
        return rows
            .slice(0, limit * 3)
            .map((r) => ({
                word: r.word,
                grade: r.grade,
                semester: r.semester === "上" ? "上" : "下",
            }));
    } catch {
        return [];
    }
}

/**
 * jieba 词表里找含目标字的词（按词频降序）。
 * 用于"课内生字两两组合"的成词性验证：组合必须真实存在于词典。
 */
export function findWordsInDict(target: string, limit = 60): string[] {
    const { db, missing } = getWords();
    if (missing) return [];
    try {
        const rows = db
            .prepare(
                `SELECT word FROM words
                 WHERE (word LIKE ? || '%') OR (word LIKE '%' || ?)
                 ORDER BY freq DESC LIMIT ?`
            )
            .all(target, target, limit) as { word: string }[];
        return rows.map((r) => r.word);
    } catch {
        return [];
    }
}

/**
 * 取"学生学过的字"（截至某学期），来源可选拼接：
 * - 写字表黑字（会写的字，做搭档字优先）
 * - 识字表黑字（会认的字）
 * 蓝色多音字除外（脚注：不计入生字总数）。
 */
export function learnedChars(maxGrade: number, maxSemester: "上" | "下"): {
    xiezi: string[];
    shizi: string[];
} {
    const { db, missing } = getTextbook();
    if (missing) return { xiezi: [], shizi: [] };
    const semCmp = `(g.grade < ? OR (g.grade = ? AND (CASE WHEN g.semester = '上' THEN 0 ELSE 1 END) <= ?))`;
    const args = [maxGrade, maxGrade, SEM_ORDER(maxSemester)];
    try {
        const xiezi = (
            db
                .prepare(
                    `SELECT DISTINCT s.char FROM xiezi s JOIN groups g ON s.gid = g.gid
                     WHERE ${semCmp} ORDER BY s.char`
                )
                .all(...args) as { char: string }[]
        ).map((r) => r.char);
        const shizi = (
            db
                .prepare(
                    `SELECT DISTINCT s.char FROM shizi s JOIN groups g ON s.gid = g.gid
                     WHERE s.polyphone = 0 AND ${semCmp} ORDER BY s.char`
                )
                .all(...args) as { char: string }[]
        ).map((r) => r.char);
        return { xiezi, shizi };
    } catch {
        return { xiezi: [], shizi: [] };
    }
}

export interface LearnedSets {
    /** 会写的字（写字表），组词搭档优先 */
    xiezi: Set<string>;
    /** 会认的字（识字表） */
    shizi: Set<string>;
    /** 两者的并集，用于准入校验 */
    all: Set<string>;
    /** 拼接成字符串，供 AI 组词 prompt 使用（写字表在前） */
    poolString: string;
}

const globalForLearned = global as unknown as {
    __yuwenLearned?: Map<string, LearnedSets>;
};

/**
 * 按学期缓存"学过的字集合"。组词考察高频调用，SQLite 查询结果
 * 在进程内按 (grade, semester) 缓存；升级课本库或学期变更后
 * 缓存键不同自然重建。
 */
export function learnedCharSets(
    maxGrade: number,
    maxSemester: "上" | "下"
): LearnedSets {
    const key = `${maxGrade}-${maxSemester}`;
    if (!globalForLearned.__yuwenLearned) {
        globalForLearned.__yuwenLearned = new Map();
    }
    const cache = globalForLearned.__yuwenLearned;
    const hit = cache.get(key);
    if (hit) return hit;

    const { xiezi, shizi } = learnedChars(maxGrade, maxSemester);
    const sets: LearnedSets = {
        xiezi: new Set(xiezi),
        shizi: new Set(shizi),
        all: new Set([...xiezi, ...shizi]),
        poolString: [...xiezi, ...shizi].join(""),
    };
    cache.set(key, sets);
    return sets;
}

/** 查某字在指定学期是否为课内生字（识字/写字），返回所在组信息，用于错字出处标注 */
export function lookupCharOrigin(char: string): TextbookChar | null {
    const { db, missing } = getTextbook();
    if (missing) return null;
    try {
        const row = db
            .prepare(
                `SELECT s.char AS char, s.pinyin AS pinyin, s.polyphone AS polyphone,
                        g.list AS list, g.label AS label, g.grade AS grade,
                        g.semester AS semester, g.page_print AS pagePrint
                 FROM shizi s JOIN groups g ON s.gid = g.gid
                 WHERE s.char = ?
                 ORDER BY g.grade ASC, (CASE WHEN g.semester = '上' THEN 0 ELSE 1 END) ASC
                 LIMIT 1`
            )
            .get(char) as
            | {
                  char: string;
                  pinyin: string;
                  polyphone: number;
                  list: string;
                  label: string;
                  grade: number;
                  semester: string;
                  pagePrint: number;
              }
            | undefined;
        if (!row) return null;
        return {
            char: row.char,
            pinyin: row.pinyin,
            polyphone: row.polyphone === 1,
            list: row.list,
            label: row.label,
            grade: row.grade,
            semester: row.semester === "上" ? "上" : "下",
            pagePrint: row.pagePrint,
        };
    } catch {
        return null;
    }
}
