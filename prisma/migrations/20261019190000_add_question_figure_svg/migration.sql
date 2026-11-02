-- 题目配图：识别时记录是否有配图，并保存 AI 重绘的 SVG；举一反三和试卷新题也保存各自的 SVG 配图。
-- 只新增列，已有题目 hasFigure 为 false、配图为空，不改动已有数据。
ALTER TABLE "ErrorItem" ADD COLUMN "hasFigure" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ErrorItem" ADD COLUMN "figureSvg" TEXT;
ALTER TABLE "PracticeRecord" ADD COLUMN "figureSvg" TEXT;
ALTER TABLE "ExamQuestion" ADD COLUMN "figureSvg" TEXT;
