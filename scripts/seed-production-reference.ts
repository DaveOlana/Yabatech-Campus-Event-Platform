import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient, LevelCode } from "@prisma/client";
import { prisma, pool } from "../src/db.js";

export const PRODUCTION_SEMESTERS = [
  { code: "FIRST", name: "First Semester" },
  { code: "SECOND", name: "Second Semester" },
] as const;

export const PRODUCTION_CATEGORIES = [
  { code: "ACADEMIC", name: "Academic", description: "Lectures, symposiums, and academic conferences" },
  { code: "WORKSHOP", name: "Workshop", description: "Hands-on training, skills acquisition, and bootcamps" },
  { code: "SEMINAR", name: "Seminar", description: "Presentations, guest lectures, and panel discussions" },
  { code: "SOCIAL", name: "Social", description: "Student gatherings, cultural days, and networking events" },
  { code: "SPORTS", name: "Sports", description: "Intramural competitions, athletics, and fitness events" },
  { code: "TECH", name: "Technology", description: "Hackathons, tech exhibitions, and developer meetups" },
  { code: "CAREER", name: "Career", description: "Job fairs, resume clinics, and industry recruitment" },
] as const;

export const PRODUCTION_DEPARTMENTS = [
  "Agricultural and Bio-environmental Engineering", "Chemical Engineering Technology", "Civil Engineering",
  "Computer Engineering", "Electrical Engineering", "Industrial Maintenance Engineering", "Marine Engineering",
  "Mechanical Engineering", "Mechatronics Engineering Technology", "Metallurgical Engineering",
  "Mineral and Petroleum Resources Engineering", "Welding and Fabrication Engineering", "Fine Art", "Graphic Design",
  "Industrial Design", "Printing Technology", "Biological Science", "Chemical Science", "Physical Science", "Statistics",
  "Agricultural Technology", "Computer Science", "Food Technology", "Hospitality Management", "Leisure and Tourism",
  "Nutrition and Dietetics", "Polymer Technology", "Textile Technology", "Architecture", "Building Technology",
  "Estate Management", "Quantity Surveying", "Surveying and Geoinformatics", "Urban and Regional Planning", "Languages",
  "Mass Communication", "Social Science", "Accountancy", "Banking and Finance", "Business Administration", "Marketing",
  "Office Technology Management", "Public Administration", "Art Education", "Biology Education", "Business Education",
  "Chemistry Education", "Computer Education", "Educational Foundation", "Home Economics Education",
  "Industrial Technical Education", "Integrated Science Education", "Mathematics Education", "Physics Education",
  "Science Education", "Technical Education",
] as const;

export interface ProductionReferenceInput { cycleName: string; cycleStart: Date; cycleEnd: Date }

export function internalDepartmentCode(name: string): string {
  const slug = name.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
  const base = `YCEP-${slug}`;
  return base.length <= 80 ? base : `${base.slice(0, 71)}-${crypto.createHash("sha256").update(name).digest("hex").slice(0, 8).toUpperCase()}`;
}

export async function syncProductionDepartments(
  db: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<{ created: number; preserved: number; total: number }> {
  let created = 0;
  let preserved = 0;

  for (const name of PRODUCTION_DEPARTMENTS) {
    if (await db.department.findUnique({ where: { name } })) {
      preserved += 1;
      continue;
    }

    const baseCode = internalDepartmentCode(name);
    const conflict = await db.department.findUnique({ where: { code: baseCode } });
    const code = conflict
      ? `${baseCode}-${crypto.createHash("sha256").update(name).digest("hex").slice(0, 8).toUpperCase()}`
      : baseCode;
    await db.department.create({ data: { name, code } });
    created += 1;
  }

  return { created, preserved, total: await db.department.count() };
}

export function productionReferenceInput(env = process.env): ProductionReferenceInput {
  const cycleName = env.YCEP_ACADEMIC_CYCLE_NAME?.trim();
  const start = env.YCEP_ACADEMIC_CYCLE_START;
  const end = env.YCEP_ACADEMIC_CYCLE_END;
  if (!cycleName || !start || !end) throw new Error("YCEP_ACADEMIC_CYCLE_NAME, YCEP_ACADEMIC_CYCLE_START, and YCEP_ACADEMIC_CYCLE_END are required");
  const cycleStart = new Date(start); const cycleEnd = new Date(end);
  if (Number.isNaN(cycleStart.valueOf()) || Number.isNaN(cycleEnd.valueOf()) || cycleStart >= cycleEnd) throw new Error("Academic cycle dates must be valid and start before end");
  return { cycleName, cycleStart, cycleEnd };
}

export async function seedProductionReferenceData(input: ProductionReferenceInput, db: PrismaClient = prisma): Promise<void> {
  await db.$transaction(async (tx) => {
    for (const level of [
      { code: LevelCode.ND1, label: "National Diploma Year 1" }, { code: LevelCode.ND2, label: "National Diploma Year 2" },
      { code: LevelCode.HND1, label: "Higher National Diploma Year 1" }, { code: LevelCode.HND2, label: "Higher National Diploma Year 2" },
    ]) await tx.level.upsert({ where: { code: level.code }, create: level, update: {} });
    for (const semester of PRODUCTION_SEMESTERS) await tx.academicSemester.upsert({ where: { code: semester.code }, create: semester, update: {} });
    for (const category of PRODUCTION_CATEGORIES) await tx.eventCategory.upsert({ where: { code: category.code }, create: category, update: {} });
    await syncProductionDepartments(tx);
    await tx.academicYearCycle.updateMany({ where: { isCurrent: true, name: { not: input.cycleName } }, data: { isCurrent: false } });
    await tx.academicYearCycle.upsert({
      where: { name: input.cycleName },
      create: { name: input.cycleName, startDate: input.cycleStart, endDate: input.cycleEnd, isCurrent: true },
      update: { startDate: input.cycleStart, endDate: input.cycleEnd, isCurrent: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15000, timeout: 60000 });
}

const directlyExecuted = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (directlyExecuted) {
  seedProductionReferenceData(productionReferenceInput())
    .then(() => console.log("Production reference data is ready."))
    .catch((error: Error) => { console.error(`Production reference setup failed: ${error.message}`); process.exitCode = 1; })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
}
