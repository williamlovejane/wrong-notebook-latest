import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dictation/auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import {
    isTextbookAvailable,
    type SemesterRef,
} from "@/lib/yuwen/db";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

/**
 * GET /api/yuwen/textbook?grade=2&semester=上&list=识字表
 * 返回该册该表的所有组及条目（多音字带标记），供语文资料页面浏览。
 */
export async function GET(req: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized("Authentication required");

    if (!isTextbookAvailable()) {
        return NextResponse.json({
            available: false,
            books: [],
            groups: [],
        });
    }

    try {
        const { searchParams } = new URL(req.url);
        const grade = parseInt(searchParams.get("grade") || "", 10);
        const semester = searchParams.get("semester") || "";
        const list = searchParams.get("list") || "识字表";

        const db = new Database(
            path.join(process.cwd(), "data", "yuwen", "textbook.sqlite"),
            { readonly: true }
        );
        db.pragma("query_only = 1");

        try {
            const books = (
                db
                    .prepare(
                        `SELECT DISTINCT grade, semester FROM groups
                         ORDER BY grade, (CASE WHEN semester = '上' THEN 0 ELSE 1 END)`
                    )
                    .all() as { grade: number; semester: string }[]
            ).map((r): SemesterRef => ({
                grade: r.grade,
                semester: r.semester === "上" ? "上" : "下",
            }));

            const semOk = semester === "上" || semester === "下";
            const targetGrade = Number.isFinite(grade)
                ? grade
                : (books[0]?.grade ?? 1);
            const targetSemester = semOk ? semester : (books[0]?.semester ?? "上");
            const targetList = ["识字表", "写字表", "词语表"].includes(list)
                ? list
                : "识字表";

            const groupRows = db
                .prepare(
                    `SELECT gid, label, section, seq, kind, page_print AS pagePrint, page_pdf AS pagePdf
                     FROM groups
                     WHERE grade = ? AND semester = ? AND list = ?
                     ORDER BY seq`
                )
                .all(targetGrade, targetSemester, targetList) as {
                gid: number;
                label: string;
                section: string | null;
                seq: number;
                kind: string;
                pagePrint: number;
                pagePdf: number;
            }[];

            const itemStmt =
                targetList === "识字表"
                    ? db.prepare(
                          `SELECT pos, char, pinyin, polyphone FROM shizi
                           WHERE gid = ? ORDER BY pos`
                      )
                    : targetList === "写字表"
                      ? db.prepare(
                            `SELECT pos, char, NULL AS pinyin, 0 AS polyphone FROM xiezi
                             WHERE gid = ? ORDER BY pos`
                        )
                      : db.prepare(
                            `SELECT pos, word AS char, NULL AS pinyin, 0 AS polyphone FROM ciyu
                             WHERE gid = ? ORDER BY pos`
                        );

            const groups = groupRows.map((g) => ({
                ...g,
                items: itemStmt.all(g.gid) as {
                    pos: number;
                    char: string;
                    pinyin: string | null;
                    polyphone: number;
                }[],
            }));

            return NextResponse.json({
                available: true,
                books,
                current: {
                    grade: targetGrade,
                    semester: targetSemester,
                    list: targetList,
                },
                groups,
            });
        } finally {
            db.close();
        }
    } catch (error) {
        console.error("yuwen textbook query failed", error);
        return internalError("Failed to load textbook");
    }
}
