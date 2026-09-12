-- CreateEnum
CREATE TYPE "OrganizerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrganizerAuthorizationStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "OrganizerApplication" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "requested_public_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "organization_name" TEXT,
    "position_title" TEXT,
    "reason" TEXT NOT NULL,
    "evidence_url_or_text" TEXT,
    "status" "OrganizerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "admin_review_notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewer_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizerAuthorization" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "approved_public_name" TEXT NOT NULL,
    "status" "OrganizerAuthorizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizerApplication_user_id_idx" ON "OrganizerApplication"("user_id");

-- CreateIndex
CREATE INDEX "OrganizerApplication_cycle_id_idx" ON "OrganizerApplication"("cycle_id");

-- CreateIndex
CREATE INDEX "OrganizerApplication_status_idx" ON "OrganizerApplication"("status");

-- CreateIndex
CREATE INDEX "OrganizerApplication_created_at_idx" ON "OrganizerApplication"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerAuthorization_application_id_key" ON "OrganizerAuthorization"("application_id");

-- CreateIndex
CREATE INDEX "OrganizerAuthorization_user_id_idx" ON "OrganizerAuthorization"("user_id");

-- CreateIndex
CREATE INDEX "OrganizerAuthorization_cycle_id_idx" ON "OrganizerAuthorization"("cycle_id");

-- CreateIndex
CREATE INDEX "OrganizerAuthorization_status_idx" ON "OrganizerAuthorization"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerAuthorization_user_id_cycle_id_key" ON "OrganizerAuthorization"("user_id", "cycle_id");

-- AddForeignKey
ALTER TABLE "OrganizerApplication" ADD CONSTRAINT "OrganizerApplication_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerApplication" ADD CONSTRAINT "OrganizerApplication_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "AcademicYearCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerApplication" ADD CONSTRAINT "OrganizerApplication_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerAuthorization" ADD CONSTRAINT "OrganizerAuthorization_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerAuthorization" ADD CONSTRAINT "OrganizerAuthorization_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "AcademicYearCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerAuthorization" ADD CONSTRAINT "OrganizerAuthorization_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "OrganizerApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom: Enforce at most one PENDING OrganizerApplication per user per cycle
CREATE UNIQUE INDEX "OrganizerApplication_one_pending_per_cycle" ON "OrganizerApplication" ("user_id", "cycle_id") WHERE "status" = 'PENDING';

