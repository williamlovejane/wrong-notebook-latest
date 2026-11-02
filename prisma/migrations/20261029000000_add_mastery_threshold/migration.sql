-- 仅新增列：每个用户独立的已掌握阈值（百分比），已有用户沿用默认值 50。
ALTER TABLE "User" ADD COLUMN "masteryThreshold" INTEGER NOT NULL DEFAULT 50;
