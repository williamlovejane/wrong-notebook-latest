-- 仅新增列：暂存最近一次生成的举一反三题目与解答，不影响已有数据。
ALTER TABLE "ErrorItem" ADD COLUMN "lastPractice" TEXT;
