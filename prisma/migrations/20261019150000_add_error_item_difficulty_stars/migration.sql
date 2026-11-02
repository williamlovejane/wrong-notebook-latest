-- 新增可空的难度星级列，已有题目为空（可通过「重新生成知识点」补充），不改动已有数据。
ALTER TABLE "ErrorItem" ADD COLUMN "difficultyStars" INTEGER;
