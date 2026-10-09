-- Add a dedicated Management login identity without changing the preserved
-- ADMIN row, its audit history, or its review relationships.
ALTER TABLE "User"
ADD COLUMN "management_username" TEXT,
ADD COLUMN "management_username_normalized" TEXT;

-- Existing installations have at most one ADMIN. Give that row a neutral,
-- deterministic transitional identity; the explicit environment-backed
-- bootstrap update replaces it with the locally configured username.
UPDATE "User"
SET "management_username" = 'Management',
    "management_username_normalized" = 'management'
WHERE "role" = 'ADMIN';

CREATE UNIQUE INDEX "User_management_username_normalized_key"
ON "User"("management_username_normalized");

ALTER TABLE "User" ADD CONSTRAINT "User_admin_management_username_check"
CHECK (
  ("role" = 'ADMIN' AND "management_username" IS NOT NULL AND "management_username_normalized" IS NOT NULL)
  OR
  ("role" != 'ADMIN' AND "management_username" IS NULL AND "management_username_normalized" IS NULL)
);
