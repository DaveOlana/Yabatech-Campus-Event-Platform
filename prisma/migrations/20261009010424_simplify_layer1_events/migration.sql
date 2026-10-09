/*
  Warnings:

  - You are about to drop the column `eligibility_instructions` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `participation_mode` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `registration_deadline` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `registration_limit` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the `ApplicationQuestion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EventEligibleDepartment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EventEligibleLevel` table. If the table is not empty, all the data it contains will be lost.

*/
-- Drop legacy attendee-application table first. Its indexes, primary key, and
-- Event foreign key are owned by the table and are removed with it.
DROP TABLE "ApplicationQuestion";

-- Drop legacy registration-eligibility tables. Their indexes, unique
-- constraints, and foreign keys are owned by the tables.
DROP TABLE "EventEligibleDepartment";

DROP TABLE "EventEligibleLevel";

-- Remove registration-era columns from otherwise-preserved Event rows.
ALTER TABLE "Event"
DROP COLUMN "participation_mode",
DROP COLUMN "registration_deadline",
DROP COLUMN "registration_limit",
DROP COLUMN "eligibility_instructions";

-- No remaining column depends on the enum.
DROP TYPE "ParticipationMode";
