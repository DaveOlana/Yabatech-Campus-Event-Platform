-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewer_user_id" TEXT,
ADD COLUMN     "submitted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Event_status_submitted_at_idx" ON "Event"("status", "submitted_at");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
