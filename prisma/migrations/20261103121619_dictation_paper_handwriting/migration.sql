-- AlterTable
ALTER TABLE "ReviewLog" ADD COLUMN "batchId" TEXT;
ALTER TABLE "ReviewLog" ADD COLUMN "mode" TEXT;
ALTER TABLE "ReviewLog" ADD COLUMN "strokeCorrect" BOOLEAN;

-- CreateIndex
CREATE INDEX "ReviewLog_batchId_idx" ON "ReviewLog"("batchId");
