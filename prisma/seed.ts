/**
 * Prisma seed script for YCEP identity foundation.
 *
 * Seeds:
 * - Levels: ND1, ND2, HND1, HND2
 * - One initial department (Computer Science) for development
 * - One current AcademicYearCycle (2025/2026)
 *
 * This script is idempotent — it uses upsert to avoid duplicate inserts.
 */
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, LevelCode } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding YCEP identity foundation...\n");

  // ── Levels ──────────────────────────────────────────────────────────────────
  const levels = [
    { code: LevelCode.ND1, label: "National Diploma Year 1" },
    { code: LevelCode.ND2, label: "National Diploma Year 2" },
    { code: LevelCode.HND1, label: "Higher National Diploma Year 1" },
    { code: LevelCode.HND2, label: "Higher National Diploma Year 2" },
  ] as const;

  for (const level of levels) {
    await prisma.level.upsert({
      where: { code: level.code },
      update: {},
      create: level,
    });
    console.log(`  ✓ Level: ${level.code} — ${level.label}`);
  }

  // ── Initial department ──────────────────────────────────────────────────────
  // Per AGENTS.md: "Do not invent the complete YABATECH department catalogue."
  // One development department is sufficient for testing.
  const dept = await prisma.department.upsert({
    where: { code: "CSC" },
    update: {},
    create: {
      name: "Computer Science",
      code: "CSC",
    },
  });
  console.log(`  ✓ Department: ${dept.name} (${dept.code})`);

  // ── Current academic year cycle ─────────────────────────────────────────────
  const cycle = await prisma.academicYearCycle.upsert({
    where: { name: "2025/2026" },
    update: {},
    create: {
      name: "2025/2026",
      startDate: new Date("2025-09-01T00:00:00Z"),
      endDate: new Date("2026-08-31T23:59:59Z"),
      isCurrent: true,
    },
  });
  console.log(`  ✓ Academic Cycle: ${cycle.name} (current: ${cycle.isCurrent})`);

  console.log("\n🌱 Seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
