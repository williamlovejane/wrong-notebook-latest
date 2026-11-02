-- 仅新增列：题目的 SVG 动画讲解，以及用户「SVG 动画讲解」开关（默认开启），不影响已有数据。
ALTER TABLE "ErrorItem" ADD COLUMN "svgAnimation" TEXT;
ALTER TABLE "User" ADD COLUMN "enableSvgAnimation" BOOLEAN NOT NULL DEFAULT true;
