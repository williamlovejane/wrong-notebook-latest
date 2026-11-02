-- 错题本新增学段和学科。已有错题本学段一律为小学；学科按名称推断（规则同 inferSubjectFromName），推断不出时为空。
-- 只新增列并填充新列，不改动已有列的数据。
ALTER TABLE "Subject" ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE "Subject" ADD COLUMN "subjectKey" TEXT;

UPDATE "Subject" SET "subjectKey" = CASE
    WHEN lower("name") LIKE '%math%' OR "name" LIKE '%数学%' THEN 'math'
    WHEN lower("name") LIKE '%physics%' OR "name" LIKE '%物理%' THEN 'physics'
    WHEN lower("name") LIKE '%chemistry%' OR "name" LIKE '%化学%' THEN 'chemistry'
    WHEN lower("name") LIKE '%biology%' OR "name" LIKE '%生物%' THEN 'biology'
    WHEN lower("name") LIKE '%english%' OR "name" LIKE '%英语%' THEN 'english'
    WHEN lower("name") LIKE '%chinese%' OR "name" LIKE '%语文%' THEN 'chinese'
    WHEN lower("name") LIKE '%history%' OR "name" LIKE '%历史%' THEN 'history'
    WHEN lower("name") LIKE '%geography%' OR "name" LIKE '%地理%' THEN 'geography'
    WHEN lower("name") LIKE '%politics%' OR "name" LIKE '%政治%' THEN 'politics'
    ELSE NULL
END;
