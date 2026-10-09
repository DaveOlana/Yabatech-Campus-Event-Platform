-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipationMode" AS ENUM ('NO_REGISTRATION', 'OPEN_REGISTRATION', 'APPROVAL_REQUIRED');

-- CreateTable
CREATE TABLE "EventCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "poster_url" TEXT,
    "category_id" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "primary_organizer_authorization_id" TEXT NOT NULL,
    "organizer_public_name" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "participation_mode" "ParticipationMode" NOT NULL DEFAULT 'OPEN_REGISTRATION',
    "registration_deadline" TIMESTAMP(3),
    "registration_limit" INTEGER,
    "eligibility_instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTargetDepartment" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventTargetDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTargetLevel" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventTargetLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventEligibleDepartment" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventEligibleDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventEligibleLevel" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventEligibleLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationQuestion" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventCategory_name_key" ON "EventCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EventCategory_code_key" ON "EventCategory"("code");

-- CreateIndex
CREATE INDEX "Event_primary_organizer_authorization_id_idx" ON "Event"("primary_organizer_authorization_id");

-- CreateIndex
CREATE INDEX "Event_category_id_idx" ON "Event"("category_id");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_event_date_idx" ON "Event"("event_date");

-- CreateIndex
CREATE INDEX "EventTargetDepartment_event_id_idx" ON "EventTargetDepartment"("event_id");

-- CreateIndex
CREATE INDEX "EventTargetDepartment_department_id_idx" ON "EventTargetDepartment"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "EventTargetDepartment_event_id_department_id_key" ON "EventTargetDepartment"("event_id", "department_id");

-- CreateIndex
CREATE INDEX "EventTargetLevel_event_id_idx" ON "EventTargetLevel"("event_id");

-- CreateIndex
CREATE INDEX "EventTargetLevel_level_id_idx" ON "EventTargetLevel"("level_id");

-- CreateIndex
CREATE UNIQUE INDEX "EventTargetLevel_event_id_level_id_key" ON "EventTargetLevel"("event_id", "level_id");

-- CreateIndex
CREATE INDEX "EventEligibleDepartment_event_id_idx" ON "EventEligibleDepartment"("event_id");

-- CreateIndex
CREATE INDEX "EventEligibleDepartment_department_id_idx" ON "EventEligibleDepartment"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "EventEligibleDepartment_event_id_department_id_key" ON "EventEligibleDepartment"("event_id", "department_id");

-- CreateIndex
CREATE INDEX "EventEligibleLevel_event_id_idx" ON "EventEligibleLevel"("event_id");

-- CreateIndex
CREATE INDEX "EventEligibleLevel_level_id_idx" ON "EventEligibleLevel"("level_id");

-- CreateIndex
CREATE UNIQUE INDEX "EventEligibleLevel_event_id_level_id_key" ON "EventEligibleLevel"("event_id", "level_id");

-- CreateIndex
CREATE INDEX "ApplicationQuestion_event_id_idx" ON "ApplicationQuestion"("event_id");

-- CreateIndex
CREATE INDEX "ApplicationQuestion_order_index_idx" ON "ApplicationQuestion"("order_index");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "EventCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_primary_organizer_authorization_id_fkey" FOREIGN KEY ("primary_organizer_authorization_id") REFERENCES "OrganizerAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTargetDepartment" ADD CONSTRAINT "EventTargetDepartment_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTargetDepartment" ADD CONSTRAINT "EventTargetDepartment_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTargetLevel" ADD CONSTRAINT "EventTargetLevel_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTargetLevel" ADD CONSTRAINT "EventTargetLevel_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "Level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventEligibleDepartment" ADD CONSTRAINT "EventEligibleDepartment_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventEligibleDepartment" ADD CONSTRAINT "EventEligibleDepartment_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventEligibleLevel" ADD CONSTRAINT "EventEligibleLevel_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventEligibleLevel" ADD CONSTRAINT "EventEligibleLevel_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "Level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationQuestion" ADD CONSTRAINT "ApplicationQuestion_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
