-- 修复 20261102193800 手写重建 User 表时丢失的列：
-- 该迁移只保留了当时已知的 10 列，把 margrop 分支在 20261029-1031
-- 期间为 User 新增的偏好/能力字段全部丢掉了，导致全新库建表后
-- 集成测试报 P2022（column does not exist）。
-- 此处按 schema 重建 User 表补回 8 列；已有库中丢失的列以默认值恢复。
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "educationStage" TEXT,
    "enrollmentYear" INTEGER,
    "gradeRecognitionMode" TEXT NOT NULL DEFAULT 'fixed',
    "fixedGradeSemester" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "confirmBeforeImport" BOOLEAN NOT NULL DEFAULT false,
    "questionDuplicateThreshold" REAL NOT NULL DEFAULT 90,
    "masteryThreshold" INTEGER NOT NULL DEFAULT 50,
    "enableGeogebra" BOOLEAN NOT NULL DEFAULT false,
    "enableSvgAnimation" BOOLEAN NOT NULL DEFAULT true,
    "themePreference" TEXT NOT NULL DEFAULT 'system'
);
INSERT INTO "new_User" ("createdAt", "educationStage", "email", "enrollmentYear", "id", "isActive", "name", "password", "role", "updatedAt") SELECT "createdAt", "educationStage", "email", "enrollmentYear", "id", "isActive", "name", "password", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
