-- 直接新增带默认值的列，保留所有账户和关联数据，避免重建用户表。
ALTER TABLE "User" ADD COLUMN "questionDuplicateThreshold" REAL NOT NULL DEFAULT 99;
