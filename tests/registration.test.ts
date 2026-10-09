/**
 * Milestone 1B — Member Registration & Automatic Verification Tests
 *
 * Requirements covered:
 * 1. Valid registration succeeds
 * 2. Matric number normalization works
 * 3. Malformed matric number is rejected
 * 4. Duplicate matric number is rejected
 * 5. Duplicate email is rejected
 * 6. Invalid department is rejected
 * 7. Invalid level is rejected
 * 8. Password mismatch is rejected
 * 9. Password is stored hashed, never plaintext
 * 10. Successful registration automatically creates ACTIVE verification for current cycle
 * 11. Registration transaction rolls back if verification creation fails
 * 12. Registration fails safely if there is no current academic cycle
 * 13. UI GET /register renders successfully
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, LevelCode, VerificationStatus } from "@prisma/client";
import dotenv from "dotenv";
import { createApp } from "../src/app.js";
import { normalizeMatricNumber, isValidMatricNumber } from "../src/utils/matric.js";
import {
  registerMember,
  DuplicateConflictError,
  CycleConfigurationError,
  ValidationError,
} from "../src/services/registration.service.js";

dotenv.config();

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL environment variable is required for tests");
}

let pool: pg.Pool;
let prisma: PrismaClient;
const app = createApp();

let testDepartmentId: string;
let testLevelId: string;
let testCycleId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

beforeEach(async () => {
  // Clean all tables in proper order
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

  // Seed baseline department, level, and current cycle
  const dept = await prisma.department.create({
    data: { name: "Computer Science", code: "CSC" },
  });
  testDepartmentId = dept.id;

  const lvl = await prisma.level.create({
    data: { code: LevelCode.ND1, label: "National Diploma 1" },
  });
  testLevelId = lvl.id;

  const cycle = await prisma.academicYearCycle.create({
    data: {
      name: "2025/2026",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-08-31"),
      isCurrent: true,
    },
  });
  testCycleId = cycle.id;
});

// ── 1. Matric Number Utility Tests ──────────────────────────────────────────

describe("Matric Number Normalization & Validation", () => {
  it("normalizes lowercase and whitespace around separators", () => {
    expect(normalizeMatricNumber("  f / nd / 24 / 3210051  ")).toBe("F/ND/24/3210051");
    expect(normalizeMatricNumber("pt/hnd/25/2100001")).toBe("PT/HND/25/2100001");
  });

  it("validates correct matric numbers according to the frozen rule", () => {
    expect(isValidMatricNumber("F/ND/24/3210051")).toBe(true);
    expect(isValidMatricNumber("PT/HND/25/2100001")).toBe(true);
    expect(isValidMatricNumber("f / nd / 24 / 3210051")).toBe(true);
  });

  it("rejects malformed matric numbers", () => {
    expect(isValidMatricNumber("NOT-A-MATRIC")).toBe(false);
    expect(isValidMatricNumber("F/ND/24/12345")).toBe(false); // only 5 digits
    expect(isValidMatricNumber("F/ND/2024/1234567")).toBe(false); // 4-digit year
    expect(isValidMatricNumber("F//24/1234567")).toBe(false); // missing programme
  });
});

// ── 2. Member Registration Integration Tests ─────────────────────────────────

describe("POST /register (Member Registration)", () => {
  const validPayload = {
    fullName: "Babafemi Babatunde",
    matricNumber: "F/ND/24/3210051",
    email: "babafemi@yabatech.edu.ng",
    departmentId: "",
    levelId: "",
    password: "Password123",
    passwordConfirmation: "Password123",
  };

  it("successfully registers a member and automatically grants ACTIVE verification", async () => {
    const payload = {
      ...validPayload,
      departmentId: testDepartmentId,
      levelId: testLevelId,
    };

    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.fullName).toBe("Babafemi Babatunde");
    expect(res.body.user.matricNumber).toBe("F/ND/24/3210051");
    expect(res.body.user.email).toBe("babafemi@yabatech.edu.ng");
    expect(res.body.user.role).toBe("MEMBER");
    expect(res.body.user.passwordHash).toBeUndefined(); // Never expose password hash

    // Verify verification in database
    expect(res.body.verification).toBeDefined();
    expect(res.body.verification.status).toBe(VerificationStatus.ACTIVE);
    expect(res.body.verification.cycleId).toBe(testCycleId);

    const dbVerification = await prisma.memberVerification.findUnique({
      where: {
        userId_cycleId: {
          userId: res.body.user.id,
          cycleId: testCycleId,
        },
      },
    });
    expect(dbVerification).not.toBeNull();
    expect(dbVerification?.status).toBe(VerificationStatus.ACTIVE);
  });

  it("normalizes matric number on submission", async () => {
    const payload = {
      ...validPayload,
      matricNumber: "  f / nd / 24 / 3210051  ",
      email: "normalized@example.com",
      departmentId: testDepartmentId,
      levelId: testLevelId,
    };

    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.user.matricNumber).toBe("F/ND/24/3210051");

    // Verify database stored the normalized value
    const dbUser = await prisma.user.findUnique({
      where: { matricNumber: "F/ND/24/3210051" },
    });
    expect(dbUser).not.toBeNull();
  });

  it("rejects malformed matric number", async () => {
    const payload = {
      ...validPayload,
      matricNumber: "INVALID-MATRIC-123",
      departmentId: testDepartmentId,
      levelId: testLevelId,
    };

    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.matricNumber).toBeDefined();
  });

  it("rejects duplicate matric number with understandable message", async () => {
    const payload1 = {
      ...validPayload,
      matricNumber: "F/ND/24/3210051",
      email: "student1@example.com",
      departmentId: testDepartmentId,
      levelId: testLevelId,
    };

    const payload2 = {
      ...validPayload,
      matricNumber: "f / nd / 24 / 3210051", // same matric, different formatting
      email: "student2@example.com",
      departmentId: testDepartmentId,
      levelId: testLevelId,
    };

    // Register first user
    const res1 = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload1);
    expect(res1.status).toBe(201);

    // Attempt second registration with same matric
    const res2 = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload2);

    expect([400, 409]).toContain(res2.status);
    expect(res2.body.success).toBe(false);
    expect(res2.body.message).toMatch(/matric number already exists/i);
  });

  it("rejects duplicate email with understandable message", async () => {
    const payload1 = {
      ...validPayload,
      matricNumber: "F/ND/24/3210051",
      email: "duplicate@example.com",
      departmentId: testDepartmentId,
      levelId: testLevelId,
    };

    const payload2 = {
      ...validPayload,
      matricNumber: "F/ND/24/9999999",
      email: "DUPLICATE@EXAMPLE.COM", // same email, uppercase
      departmentId: testDepartmentId,
      levelId: testLevelId,
    };

    const res1 = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload1);
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload2);

    expect([400, 409]).toContain(res2.status);
    expect(res2.body.success).toBe(false);
    expect(res2.body.message).toMatch(/email address already exists/i);
  });

  it("existing member registration still requires matric number", async () => {
    const { matricNumber, ...missingMatric } = validPayload;
    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send({ ...missingMatric, departmentId: testDepartmentId, levelId: testLevelId });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.matricNumber).toBeDefined();
  });

  it("existing member registration still requires department", async () => {
    const { departmentId, ...missingDept } = validPayload;
    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send({ ...missingDept, levelId: testLevelId });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.departmentId).toBeDefined();
  });

  it("existing member registration still requires level", async () => {
    const { levelId, ...missingLevel } = validPayload;
    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send({ ...missingLevel, departmentId: testDepartmentId });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.levelId).toBeDefined();
  });

  it("rejects non-existent department", async () => {
    const payload = {
      ...validPayload,
      departmentId: "00000000-0000-0000-0000-000000000000",
      levelId: testLevelId,
    };

    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/department does not exist/i);
  });

  it("rejects non-existent level", async () => {
    const payload = {
      ...validPayload,
      departmentId: testDepartmentId,
      levelId: "00000000-0000-0000-0000-000000000000",
    };

    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/level does not exist/i);
  });

  it("rejects password mismatch", async () => {
    const payload = {
      ...validPayload,
      departmentId: testDepartmentId,
      levelId: testLevelId,
      password: "Password123",
      passwordConfirmation: "MismatchPassword456",
    };

    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.passwordConfirmation).toBeDefined();
  });

  it("rejects password shorter than 8 characters", async () => {
    const payload = {
      ...validPayload,
      departmentId: testDepartmentId,
      levelId: testLevelId,
      password: "short",
      passwordConfirmation: "short",
    };

    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.password).toBeDefined();
  });

  it("stores password securely hashed with bcrypt, never plaintext", async () => {
    const rawPassword = "SuperSecretPassword123";
    const payload = {
      ...validPayload,
      email: "security@example.com",
      matricNumber: "PT/HND/24/7654321",
      departmentId: testDepartmentId,
      levelId: testLevelId,
      password: rawPassword,
      passwordConfirmation: rawPassword,
    };

    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload);

    expect(res.status).toBe(201);

    const dbUser = await prisma.user.findUnique({
      where: { email: "security@example.com" },
    });

    expect(dbUser).not.toBeNull();
    expect(dbUser?.passwordHash).not.toBe(rawPassword);
    expect(dbUser?.passwordHash.startsWith("$2")).toBe(true); // bcrypt prefix

    const isMatch = await bcrypt.compare(rawPassword, dbUser!.passwordHash);
    expect(isMatch).toBe(true);
  });

  it("fails safely if there is no current academic cycle", async () => {
    // Deactivate the current cycle
    await prisma.academicYearCycle.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });

    const payload = {
      ...validPayload,
      departmentId: testDepartmentId,
      levelId: testLevelId,
    };

    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send(payload);

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/no active academic cycle/i);

    // Verify user was NOT created
    const count = await prisma.user.count();
    expect(count).toBe(0);
  });

  it("rolls back the entire transaction if verification creation fails", async () => {
    const input = {
      fullName: "Rollback Test User",
      matricNumber: "F/ND/24/1112223",
      email: "rollback@example.com",
      departmentId: testDepartmentId,
      levelId: testLevelId,
      password: "Password123",
      passwordConfirmation: "Password123",
    };

    // Simulate verification creation failure during atomic transaction
    await expect(
      registerMember(input, {
        prismaClient: prisma,
        simulateVerificationFailure: true,
      })
    ).rejects.toThrow("Simulated verification creation failure");

    // Verify User record was completely rolled back
    const userInDb = await prisma.user.findUnique({
      where: { email: "rollback@example.com" },
    });
    expect(userInDb).toBeNull();

    // Verify MemberVerification was not created
    const verificationsCount = await prisma.memberVerification.count();
    expect(verificationsCount).toBe(0);
  });
});

// ── 3. Registration Page UI Test ─────────────────────────────────────────────

describe("GET /register", () => {
  it("renders the registration page with 200 OK and populated options", async () => {
    const res = await request(app).get("/register");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Create your account");
    expect(res.text).toContain("Computer Science");
    expect(res.text).toContain("ND1");
    expect(res.text).toContain("name=\"matricNumber\"");
  });

  it("renders with correct semantic autocomplete attributes to prevent credential confusion", async () => {
    const res = await request(app).get("/register");

    expect(res.status).toBe(200);
    expect(res.text).toContain('id="fullName"');
    expect(res.text).toContain('name="fullName"');
    expect(res.text).toContain('autocomplete="name"');

    expect(res.text).toContain('id="matricNumber"');
    expect(res.text).toContain('name="matricNumber"');
    expect(res.text).toContain('autocomplete="username"');

    expect(res.text).toContain('id="email"');
    expect(res.text).toContain('name="email"');
    expect(res.text).toContain('autocomplete="email"');

    expect(res.text).toContain('id="password"');
    expect(res.text).toContain('name="password"');
    expect(res.text).toContain('autocomplete="new-password"');

    expect(res.text).toContain('id="passwordConfirmation"');
    expect(res.text).toContain('name="passwordConfirmation"');
  });

  it("returns 'Full name is required' when fullName is empty or whitespace", async () => {
    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send({
        fullName: "   ",
        matricNumber: "F/ND/24/3210051",
        email: "student@example.com",
        departmentId: testDepartmentId,
        levelId: testLevelId,
        password: "Password123",
        passwordConfirmation: "Password123",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors.fullName).toContain("Full name is required");
  });

  it("returns 'Full name must be at least 2 characters' when fullName is a single character", async () => {
    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send({
        fullName: "D",
        matricNumber: "F/ND/24/3210051",
        email: "student@example.com",
        departmentId: testDepartmentId,
        levelId: testLevelId,
        password: "Password123",
        passwordConfirmation: "Password123",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors.fullName).toContain("Full name must be at least 2 characters");
  });

  it("does not report a fullName error when a valid name such as DaveOlana is provided", async () => {
    const res = await request(app)
      .post("/register")
      .set("Accept", "application/json")
      .send({
        fullName: "DaveOlana",
        matricNumber: "invalid-matric",
        email: "student@example.com",
        departmentId: testDepartmentId,
        levelId: testLevelId,
        password: "Password123",
        passwordConfirmation: "Password123",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors.fullName).toBeUndefined();
    expect(res.body.errors.matricNumber).toBeDefined();
  });
});
