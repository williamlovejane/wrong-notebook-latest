-- CreateTable
CREATE TABLE "DictationSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mode" TEXT NOT NULL DEFAULT 'handwriting',
    "totalCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "gradedCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "judgedBy" TEXT,
    "error" TEXT,
    "heartbeatAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "DictationSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DictationSubmissionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
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

-- CreateIndex
CREATE INDEX "DictationSubmission_userId_createdAt_idx" ON "DictationSubmission"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DictationSubmission_status_heartbeatAt_idx" ON "DictationSubmission"("status", "heartbeatAt");

-- CreateIndex
CREATE INDEX "DictationSubmissionItem_submissionId_idx" ON "DictationSubmissionItem"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "DictationSubmissionItem_submissionId_logId_key" ON "DictationSubmissionItem"("submissionId", "logId");
