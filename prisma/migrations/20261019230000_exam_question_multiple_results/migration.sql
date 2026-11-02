-- 试卷题目与举一反三记录由一对一改为一对多。
-- 保留 ExamQuestion.practiceRecordId 列及其数据（部署校验不允许删除已有列或改动已有数据），
-- 仅去掉它的唯一约束和外键，新增 PracticeRecord.examQuestionId 并回填已有关联。

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExamQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "errorItemId" TEXT,
    "sourceShortId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "questionText" TEXT,
    "answerText" TEXT,
    "analysis" TEXT,
    "figureSvg" TEXT,
    "error" TEXT,
    "practiceRecordId" TEXT,
    CONSTRAINT "ExamQuestion_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamQuestion_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExamQuestion" ("analysis", "answerText", "error", "errorItemId", "figureSvg", "id", "order", "paperId", "practiceRecordId", "questionText", "sourceShortId", "status") SELECT "analysis", "answerText", "error", "errorItemId", "figureSvg", "id", "order", "paperId", "practiceRecordId", "questionText", "sourceShortId", "status" FROM "ExamQuestion";
DROP TABLE "ExamQuestion";
ALTER TABLE "new_ExamQuestion" RENAME TO "ExamQuestion";
CREATE INDEX "ExamQuestion_paperId_order_idx" ON "ExamQuestion"("paperId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- AlterTable
ALTER TABLE "PracticeRecord" ADD COLUMN "examQuestionId" TEXT REFERENCES "ExamQuestion" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "PracticeRecord"
SET "examQuestionId" = (
    SELECT "ExamQuestion"."id" FROM "ExamQuestion" WHERE "ExamQuestion"."practiceRecordId" = "PracticeRecord"."id"
);

-- CreateIndex
CREATE INDEX "PracticeRecord_examQuestionId_idx" ON "PracticeRecord"("examQuestionId");
