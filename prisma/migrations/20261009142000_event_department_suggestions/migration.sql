-- Preserve organizer-suggested department metadata on the event proposal.
-- The official Department row is created and linked only inside Management's
-- event-approval transaction.
ALTER TABLE "Event"
ADD COLUMN "suggested_department_name" TEXT,
ADD COLUMN "suggested_department_code" TEXT;
