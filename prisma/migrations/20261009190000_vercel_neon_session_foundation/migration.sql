-- Provision shared PostgreSQL sessions once, rather than from every Fluid
-- compute instance, and persist YABATECH's two canonical semester names.
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

CREATE TABLE "AcademicSemester" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicSemester_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademicSemester_code_key" ON "AcademicSemester"("code");
CREATE UNIQUE INDEX "AcademicSemester_name_key" ON "AcademicSemester"("name");
