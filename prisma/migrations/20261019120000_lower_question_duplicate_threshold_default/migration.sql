-- 新账号的判重阈值默认值由 99 改为 90。SQLite 不能直接修改列默认值，需按 Prisma 标准方式重建 User 表；
-- 已有账号的阈值原样复制，不做修改（部署脚本会校验所有已有行不变）。
-- RedefineTables
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
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "confirmBeforeImport" BOOLEAN NOT NULL DEFAULT false,
    "questionDuplicateThreshold" REAL NOT NULL DEFAULT 90,
    "enableGeogebra" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("confirmBeforeImport", "createdAt", "educationStage", "email", "enableGeogebra", "enrollmentYear", "id", "isActive", "name", "password", "questionDuplicateThreshold", "role", "updatedAt") SELECT "confirmBeforeImport", "createdAt", "educationStage", "email", "enableGeogebra", "enrollmentYear", "id", "isActive", "name", "password", "questionDuplicateThreshold", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

