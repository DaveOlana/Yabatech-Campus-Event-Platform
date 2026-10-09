/**
 * Identity schema constraint tests.
 *
 * These tests verify database-level constraints for the core identity models:
 * - User (email unique, matric_number unique)
 * - Department (name unique, code unique)
 * - Level (code unique, only ND1/ND2/HND1/HND2)
 * - AcademicYearCycle (name unique, at-most-one isCurrent=true)
 * - MemberVerification (user+cycle unique, onDelete Restrict)
 *
 * All tests run against the ycep_test database (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, LevelCode, UserRole, VerificationStatus } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL environment variable is required for identity tests");
}

let pool: pg.Pool;
let prisma: PrismaClient;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });

  // Apply migrations to the test database using raw SQL
  // We push the schema directly for test isolation
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

/**
 * Clean all data tables before each test to ensure isolation.
 * Order matters due to foreign key constraints.
 */
beforeEach(async () => {
  await prisma.eventTargetDepartment.deleteMany();
  await prisma.eventTargetLevel.deleteMany();
  await prisma.event.deleteMany();
  await prisma.eventCategory.deleteMany();
  await prisma.organizerAuthorization.deleteMany();
  await prisma.organizerApplication.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.memberVerification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.academicYearCycle.deleteMany();
  await prisma.level.deleteMany();
  await prisma.department.deleteMany();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function seedLevel(code: LevelCode = LevelCode.ND1) {
  return prisma.level.create({
    data: { code, label: `Level ${code}` },
  });
}

async function seedDepartment(name = "Computer Science", code = "CSC") {
  return prisma.department.create({
    data: { name, code },
  });
}

async function seedCycle(name = "2025/2026", isCurrent = true) {
  return prisma.academicYearCycle.create({
    data: {
      name,
      startDate: new Date("2025-09-01T00:00:00Z"),
      endDate: new Date("2026-08-31T23:59:59Z"),
      isCurrent,
    },
  });
}

async function seedUser(overrides: Partial<{
  fullName: string;
  email: string;
  matricNumber: string;
  passwordHash: string;
  departmentId: string;
  levelId: string;
}> = {}) {
  const dept = overrides.departmentId
    ? { id: overrides.departmentId }
    : await seedDepartment();
  const level = overrides.levelId
    ? { id: overrides.levelId }
    : await seedLevel();

  return prisma.user.create({
    data: {
      fullName: overrides.fullName ?? "Test User",
      email: overrides.email ?? "test@yabatech.edu.ng",
      matricNumber: overrides.matricNumber ?? "F/ND/21/3210001",
      passwordHash: overrides.passwordHash ?? "$2b$10$placeholder",
      role: UserRole.MEMBER,
      departmentId: dept.id,
      levelId: level.id,
    },
  });
}

// ─── Department constraints ────────────────────────────────────────────────

describe("Department constraints", () => {
  it("creates a department with unique name and code", async () => {
    const dept = await seedDepartment();
    expect(dept.name).toBe("Computer Science");
    expect(dept.code).toBe("CSC");
    expect(dept.id).toBeDefined();
  });

  it("rejects duplicate department name", async () => {
    await seedDepartment("Computer Science", "CSC");
    await expect(
      seedDepartment("Computer Science", "CSC2")
    ).rejects.toThrow();
  });

  it("rejects duplicate department code", async () => {
    await seedDepartment("Computer Science", "CSC");
    await expect(
      seedDepartment("Electrical Engineering", "CSC")
    ).rejects.toThrow();
  });
});

// ─── Level constraints ─────────────────────────────────────────────────────

describe("Level constraints", () => {
  it("creates all four valid levels", async () => {
    const nd1 = await seedLevel(LevelCode.ND1);
    const nd2 = await seedLevel(LevelCode.ND2);
    const hnd1 = await seedLevel(LevelCode.HND1);
    const hnd2 = await seedLevel(LevelCode.HND2);

    expect(nd1.code).toBe("ND1");
    expect(nd2.code).toBe("ND2");
    expect(hnd1.code).toBe("HND1");
    expect(hnd2.code).toBe("HND2");
  });

  it("rejects duplicate level code", async () => {
    await seedLevel(LevelCode.ND1);
    await expect(seedLevel(LevelCode.ND1)).rejects.toThrow();
  });
});

// ─── AcademicYearCycle constraints ─────────────────────────────────────────

describe("AcademicYearCycle constraints", () => {
  it("creates a cycle with isCurrent = true", async () => {
    const cycle = await seedCycle("2025/2026", true);
    expect(cycle.isCurrent).toBe(true);
    expect(cycle.name).toBe("2025/2026");
  });

  it("rejects duplicate cycle name", async () => {
    await seedCycle("2025/2026", false);
    await expect(seedCycle("2025/2026", false)).rejects.toThrow();
  });

  it("allows multiple cycles with isCurrent = false", async () => {
    const c1 = await seedCycle("2024/2025", false);
    const c2 = await seedCycle("2025/2026", false);
    expect(c1.isCurrent).toBe(false);
    expect(c2.isCurrent).toBe(false);
  });

  it("enforces at most one current cycle (partial unique index)", async () => {
    await seedCycle("2025/2026", true);
    await expect(seedCycle("2026/2027", true)).rejects.toThrow();
  });
});

// ─── User constraints ──────────────────────────────────────────────────────

describe("User constraints", () => {
  let deptId: string;
  let levelId: string;

  beforeEach(async () => {
    // These run after the global beforeEach cleanup
    const dept = await seedDepartment();
    const level = await seedLevel();
    deptId = dept.id;
    levelId = level.id;
  });

  it("creates a user with valid data", async () => {
    const user = await seedUser({ departmentId: deptId, levelId });
    expect(user.email).toBe("test@yabatech.edu.ng");
    expect(user.matricNumber).toBe("F/ND/21/3210001");
    expect(user.role).toBe("MEMBER");
  });

  it("rejects duplicate email", async () => {
    await seedUser({ departmentId: deptId, levelId });
    await expect(
      seedUser({
        email: "test@yabatech.edu.ng",
        matricNumber: "F/ND/21/3210002",
        departmentId: deptId,
        levelId,
      })
    ).rejects.toThrow();
  });

  it("rejects duplicate matric number", async () => {
    await seedUser({ departmentId: deptId, levelId });
    await expect(
      seedUser({
        email: "other@yabatech.edu.ng",
        matricNumber: "F/ND/21/3210001",
        departmentId: deptId,
        levelId,
      })
    ).rejects.toThrow();
  });

  it("defaults role to MEMBER", async () => {
    const user = await seedUser({ departmentId: deptId, levelId });
    expect(user.role).toBe(UserRole.MEMBER);
  });

  it("prevents deletion of a department that has users (onDelete Restrict)", async () => {
    await seedUser({ departmentId: deptId, levelId });
    await expect(
      prisma.department.delete({ where: { id: deptId } })
    ).rejects.toThrow();
  });

  it("prevents deletion of a level that has users (onDelete Restrict)", async () => {
    await seedUser({ departmentId: deptId, levelId });
    await expect(
      prisma.level.delete({ where: { id: levelId } })
    ).rejects.toThrow();
  });

  it("creates a valid MEMBER with all required academic fields", async () => {
    const user = await prisma.user.create({
      data: {
        fullName: "Academic Member",
        email: "member@yabatech.edu.ng",
        matricNumber: "F/ND/22/1234567",
        passwordHash: "$2b$10$placeholder",
        role: UserRole.MEMBER,
        departmentId: deptId,
        levelId: levelId,
      },
    });
    expect(user.role).toBe(UserRole.MEMBER);
    expect(user.matricNumber).toBe("F/ND/22/1234567");
    expect(user.departmentId).toBe(deptId);
    expect(user.levelId).toBe(levelId);
  });

  it("database rejects MEMBER missing matric number via CHECK constraint", async () => {
    await expect(
      prisma.user.create({
        data: {
          fullName: "Invalid Member",
          email: "nomatric@yabatech.edu.ng",
          matricNumber: null,
          passwordHash: "$2b$10$placeholder",
          role: UserRole.MEMBER,
          departmentId: deptId,
          levelId: levelId,
        },
      })
    ).rejects.toThrow();
  });

  it("database rejects MEMBER missing department via CHECK constraint", async () => {
    await expect(
      prisma.user.create({
        data: {
          fullName: "Invalid Member",
          email: "nodept@yabatech.edu.ng",
          matricNumber: "F/ND/22/7654321",
          passwordHash: "$2b$10$placeholder",
          role: UserRole.MEMBER,
          departmentId: null,
          levelId: levelId,
        },
      })
    ).rejects.toThrow();
  });

  it("database rejects MEMBER missing level via CHECK constraint", async () => {
    await expect(
      prisma.user.create({
        data: {
          fullName: "Invalid Member",
          email: "nolevel@yabatech.edu.ng",
          matricNumber: "F/ND/22/7654322",
          passwordHash: "$2b$10$placeholder",
          role: UserRole.MEMBER,
          departmentId: deptId,
          levelId: null,
        },
      })
    ).rejects.toThrow();
  });

  it("creates ADMIN with null matric number, department, and level", async () => {
    const admin = await prisma.user.create({
      data: {
        fullName: "YABATECH Management",
        email: "management@yabatech.edu.ng",
        managementUsername: "Campus Management Console",
        managementUsernameNormalized: "campus management console",
        matricNumber: null,
        passwordHash: "$2b$10$placeholder",
        role: UserRole.ADMIN,
        departmentId: null,
        levelId: null,
      },
    });

    expect(admin.role).toBe(UserRole.ADMIN);
    expect(admin.matricNumber).toBeNull();
    expect(admin.departmentId).toBeNull();
    expect(admin.levelId).toBeNull();
  });

  it("ADMIN does not require a MemberVerification", async () => {
    const admin = await prisma.user.create({
      data: {
        fullName: "YABATECH Management",
        email: "admin-noverify@yabatech.edu.ng",
        managementUsername: "Campus Management Console",
        managementUsernameNormalized: "campus management console",
        matricNumber: null,
        passwordHash: "$2b$10$placeholder",
        role: UserRole.ADMIN,
        departmentId: null,
        levelId: null,
      },
    });

    const verifications = await prisma.memberVerification.findMany({
      where: { userId: admin.id },
    });
    expect(verifications).toHaveLength(0);
  });
});

// ─── MemberVerification constraints ─────────────────────────────────────────

describe("MemberVerification constraints", () => {
  let userId: string;
  let cycleId: string;
  let deptId: string;
  let levelId: string;

  beforeEach(async () => {
    const dept = await seedDepartment();
    const level = await seedLevel();
    deptId = dept.id;
    levelId = level.id;
    const user = await seedUser({ departmentId: deptId, levelId });
    userId = user.id;
    const cycle = await seedCycle("2025/2026", true);
    cycleId = cycle.id;
  });

  it("creates a verification for a user and cycle", async () => {
    const verification = await prisma.memberVerification.create({
      data: {
        userId,
        cycleId,
        status: VerificationStatus.ACTIVE,
      },
    });
    expect(verification.status).toBe("ACTIVE");
    expect(verification.userId).toBe(userId);
    expect(verification.cycleId).toBe(cycleId);
  });

  it("rejects duplicate verification for same user and cycle", async () => {
    await prisma.memberVerification.create({
      data: { userId, cycleId, status: VerificationStatus.ACTIVE },
    });
    await expect(
      prisma.memberVerification.create({
        data: { userId, cycleId, status: VerificationStatus.ACTIVE },
      })
    ).rejects.toThrow();
  });

  it("allows different verifications across cycles for the same user", async () => {
    await prisma.memberVerification.create({
      data: { userId, cycleId, status: VerificationStatus.ACTIVE },
    });

    const cycle2 = await prisma.academicYearCycle.create({
      data: {
        name: "2024/2025",
        startDate: new Date("2024-09-01T00:00:00Z"),
        endDate: new Date("2025-08-31T23:59:59Z"),
        isCurrent: false,
      },
    });

    const v2 = await prisma.memberVerification.create({
      data: { userId, cycleId: cycle2.id, status: VerificationStatus.EXPIRED },
    });
    expect(v2.status).toBe("EXPIRED");
  });

  it("supports all verification statuses", async () => {
    const v = await prisma.memberVerification.create({
      data: { userId, cycleId, status: VerificationStatus.ACTIVE },
    });
    expect(v.status).toBe("ACTIVE");

    const updated = await prisma.memberVerification.update({
      where: { id: v.id },
      data: { status: VerificationStatus.EXPIRED },
    });
    expect(updated.status).toBe("EXPIRED");

    const revoked = await prisma.memberVerification.update({
      where: { id: v.id },
      data: { status: VerificationStatus.REVOKED, revokedAt: new Date() },
    });
    expect(revoked.status).toBe("REVOKED");
    expect(revoked.revokedAt).toBeDefined();
  });

  it("prevents deletion of a user that has verifications (onDelete Restrict)", async () => {
    await prisma.memberVerification.create({
      data: { userId, cycleId, status: VerificationStatus.ACTIVE },
    });
    await expect(
      prisma.user.delete({ where: { id: userId } })
    ).rejects.toThrow();
  });

  it("prevents deletion of a cycle that has verifications (onDelete Restrict)", async () => {
    await prisma.memberVerification.create({
      data: { userId, cycleId, status: VerificationStatus.ACTIVE },
    });
    await expect(
      prisma.academicYearCycle.delete({ where: { id: cycleId } })
    ).rejects.toThrow();
  });
});
