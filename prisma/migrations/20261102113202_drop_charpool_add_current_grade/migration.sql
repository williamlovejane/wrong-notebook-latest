/*
  Warnings:

  - You are about to drop the `CharPool` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `poolId` on the `DictationEntry` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "CharPool_userId_name_key";

-- DropIndex
DROP INDEX "CharPool_userId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CharPool";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DictationEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "pinyin" TEXT,
    "meaning" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DictationEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DictationEntry" ("createdAt", "id", "kind", "meaning", "note", "pinyin", "text", "updatedAt", "userId") SELECT "createdAt", "id", "kind", "meaning", "note", "pinyin", "text", "updatedAt", "userId" FROM "DictationEntry";
DROP TABLE "DictationEntry";
ALTER TABLE "new_DictationEntry" RENAME TO "DictationEntry";
CREATE INDEX "DictationEntry_userId_kind_idx" ON "DictationEntry"("userId", "kind");
CREATE UNIQUE INDEX "DictationEntry_userId_kind_text_key" ON "DictationEntry"("userId", "kind", "text");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "educationStage" TEXT,
    "enrollmentYear" INTEGER,
    "currentGrade" INTEGER NOT NULL DEFAULT 1,
    "currentSemester" TEXT NOT NULL DEFAULT '上',
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_User" ("createdAt", "educationStage", "email", "enrollmentYear", "id", "isActive", "name", "password", "role", "updatedAt") SELECT "createdAt", "educationStage", "email", "enrollmentYear", "id", "isActive", "name", "password", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
