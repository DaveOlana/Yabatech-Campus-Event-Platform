ALTER TABLE "Event"
ADD COLUMN "cancelled_at" TIMESTAMP(3),
ADD COLUMN "cancellation_reason" TEXT,
ADD COLUMN "cancelled_by_user_id" TEXT;

CREATE INDEX "Event_cancelled_by_user_id_idx" ON "Event"("cancelled_by_user_id");

ALTER TABLE "Event"
ADD CONSTRAINT "Event_cancelled_by_user_id_fkey"
FOREIGN KEY ("cancelled_by_user_id") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Event"
ADD CONSTRAINT "Event_cancellation_metadata_consistency"
CHECK (
  (
    "status" = 'CANCELLED'
    AND "cancelled_at" IS NOT NULL
    AND "cancellation_reason" IS NOT NULL
    AND length(btrim("cancellation_reason")) BETWEEN 10 AND 500
    AND "cancelled_by_user_id" IS NOT NULL
  )
  OR
  (
    "status" <> 'CANCELLED'
    AND "cancelled_at" IS NULL
    AND "cancellation_reason" IS NULL
    AND "cancelled_by_user_id" IS NULL
  )
);
