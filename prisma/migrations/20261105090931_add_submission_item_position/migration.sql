-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DictationSubmissionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "logId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "promptWord" TEXT,
    "pinyin" TEXT,
    "pads" TEXT NOT NULL,
    "images" TEXT NOT NULL,
    "animations" TEXT,
    "correct" BOOLEAN,
    "recognized" TEXT,
    "confidence" TEXT,
    "judgedBy" TEXT,
    "strokeCorrect" BOOLEAN,
    "detail" TEXT,
    "error" TEXT,
    "gradedAt" DATETIME,
    "manualCorrect" BOOLEAN,
    CONSTRAINT "DictationSubmissionItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DictationSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DictationSubmissionItem" ("animations", "cardId", "confidence", "correct", "detail", "error", "expected", "gradedAt", "id", "images", "judgedBy", "logId", "manualCorrect", "pads", "pinyin", "promptWord", "recognized", "strokeCorrect", "submissionId") SELECT "animations", "cardId", "confidence", "correct", "detail", "error", "expected", "gradedAt", "id", "images", "judgedBy", "logId", "manualCorrect", "pads", "pinyin", "promptWord", "recognized", "strokeCorrect", "submissionId" FROM "DictationSubmissionItem";
DROP TABLE "DictationSubmissionItem";
ALTER TABLE "new_DictationSubmissionItem" RENAME TO "DictationSubmissionItem";
CREATE INDEX "DictationSubmissionItem_submissionId_idx" ON "DictationSubmissionItem"("submissionId");
CREATE UNIQUE INDEX "DictationSubmissionItem_submissionId_logId_key" ON "DictationSubmissionItem"("submissionId", "logId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
