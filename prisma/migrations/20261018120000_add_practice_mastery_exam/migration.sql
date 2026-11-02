-- AlterTable
ALTER TABLE "ErrorItem" ADD COLUMN "masteryEvaluatedAt" DATETIME;
ALTER TABLE "ErrorItem" ADD COLUMN "masteryProbability" REAL;
ALTER TABLE "ErrorItem" ADD COLUMN "masteryReason" TEXT;
ALTER TABLE "ErrorItem" ADD COLUMN "masterySource" TEXT;
ALTER TABLE "ErrorItem" ADD COLUMN "shortId" TEXT;

-- CreateTable
CREATE TABLE "ExamPaper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "scope" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "subjectIds" TEXT NOT NULL,
    "tagNames" TEXT,
    "resultsRecordedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExamPaper_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExamQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paperId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "errorItemId" TEXT,
    "sourceShortId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "questionText" TEXT,
    "answerText" TEXT,
    "analysis" TEXT,
    "error" TEXT,
    "practiceRecordId" TEXT,
    CONSTRAINT "ExamQuestion_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamQuestion_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExamQuestion_practiceRecordId_fkey" FOREIGN KEY ("practiceRecordId") REFERENCES "PracticeRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PracticeRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT,
    "difficulty" TEXT,
    "isCorrect" BOOLEAN,
    "errorItemId" TEXT,
    "result" TEXT,
    "questionText" TEXT,
    "answerText" TEXT,
    "analysis" TEXT,
    "source" TEXT NOT NULL DEFAULT 'practice',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PracticeRecord_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PracticeRecord" ("createdAt", "difficulty", "id", "isCorrect", "subject", "userId") SELECT "createdAt", "difficulty", "id", "isCorrect", "subject", "userId" FROM "PracticeRecord";
DROP TABLE "PracticeRecord";
ALTER TABLE "new_PracticeRecord" RENAME TO "PracticeRecord";
CREATE INDEX "PracticeRecord_errorItemId_createdAt_idx" ON "PracticeRecord"("errorItemId", "createdAt");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "educationStage" TEXT,
    "enrollmentYear" INTEGER,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "confirmBeforeImport" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("createdAt", "educationStage", "email", "enrollmentYear", "id", "isActive", "name", "password", "role", "updatedAt") SELECT "createdAt", "educationStage", "email", "enrollmentYear", "id", "isActive", "name", "password", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ExamPaper_userId_createdAt_idx" ON "ExamPaper"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestion_practiceRecordId_key" ON "ExamQuestion"("practiceRecordId");

-- CreateIndex
CREATE INDEX "ExamQuestion_paperId_order_idx" ON "ExamQuestion"("paperId", "order");

-- 为已有题目补发 6 位 base58 短 ID，并重抽极小概率出现的重复值
UPDATE "ErrorItem" SET "shortId" = substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) WHERE "shortId" IS NULL;
UPDATE "ErrorItem" SET "shortId" = substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) WHERE rowid NOT IN (SELECT MIN(rowid) FROM "ErrorItem" GROUP BY "shortId");
UPDATE "ErrorItem" SET "shortId" = substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) WHERE rowid NOT IN (SELECT MIN(rowid) FROM "ErrorItem" GROUP BY "shortId");
UPDATE "ErrorItem" SET "shortId" = substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) || substr('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', (abs(random()) % 58) + 1, 1) WHERE rowid NOT IN (SELECT MIN(rowid) FROM "ErrorItem" GROUP BY "shortId");

-- CreateIndex
CREATE UNIQUE INDEX "ErrorItem_shortId_key" ON "ErrorItem"("shortId");

