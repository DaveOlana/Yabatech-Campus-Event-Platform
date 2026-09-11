-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_actor_user_id_idx" ON "AuditLog"("actor_user_id");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom: Enforce at most one ADMIN user in V1
CREATE UNIQUE INDEX "User_one_admin" ON "User" ("role") WHERE "role" = 'ADMIN';

-- Custom: Enforce that an ADMIN account has no academic identity fields
ALTER TABLE "User" ADD CONSTRAINT "User_admin_no_academic_identity_check"
  CHECK ("role" != 'ADMIN' OR ("matric_number" IS NULL AND "department_id" IS NULL AND "level_id" IS NULL));
