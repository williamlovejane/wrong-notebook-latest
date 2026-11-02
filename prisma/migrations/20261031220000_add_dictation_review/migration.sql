-- CreateTable
CREATE TABLE "CharPool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chars" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharPool_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DictationEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "pinyin" TEXT,
    "meaning" TEXT,
    "note" TEXT,
    "poolId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DictationEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DictationEntry_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "CharPool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DictationWord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "pinyin" TEXT,
    "maskedAt" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DictationWord_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictationEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "dueAt" DATETIME NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewCard_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictationEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "stageBefore" INTEGER NOT NULL,
    "stageAfter" INTEGER NOT NULL,
    "promptWord" TEXT,
    "answerText" TEXT,
    CONSTRAINT "ReviewLog_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ReviewCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CharPool_userId_idx" ON "CharPool"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CharPool_userId_name_key" ON "CharPool"("userId", "name");

-- CreateIndex
CREATE INDEX "DictationEntry_userId_kind_idx" ON "DictationEntry"("userId", "kind");

-- CreateIndex
CREATE INDEX "DictationEntry_poolId_idx" ON "DictationEntry"("poolId");

-- CreateIndex
CREATE UNIQUE INDEX "DictationEntry_userId_kind_text_key" ON "DictationEntry"("userId", "kind", "text");

-- CreateIndex
CREATE INDEX "DictationWord_entryId_idx" ON "DictationWord"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "DictationWord_entryId_word_key" ON "DictationWord"("entryId", "word");

-- CreateIndex
CREATE INDEX "ReviewCard_userId_status_dueAt_idx" ON "ReviewCard"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ReviewCard_entryId_idx" ON "ReviewCard"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCard_entryId_key" ON "ReviewCard"("entryId");

-- CreateIndex
CREATE INDEX "ReviewLog_cardId_reviewedAt_idx" ON "ReviewLog"("cardId", "reviewedAt");
