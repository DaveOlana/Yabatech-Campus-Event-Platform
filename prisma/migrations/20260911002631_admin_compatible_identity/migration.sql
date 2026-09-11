-- AlterTable
ALTER TABLE "User" ALTER COLUMN "matric_number" DROP NOT NULL,
ALTER COLUMN "department_id" DROP NOT NULL,
ALTER COLUMN "level_id" DROP NOT NULL;

-- Add CHECK constraint enforcing that MEMBER users must have matric_number, department_id, and level_id
ALTER TABLE "User" ADD CONSTRAINT "User_member_academic_identity_check"
  CHECK ("role" != 'MEMBER' OR ("matric_number" IS NOT NULL AND "department_id" IS NOT NULL AND "level_id" IS NOT NULL));
