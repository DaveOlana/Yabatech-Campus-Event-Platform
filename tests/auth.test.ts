/**
 * Milestone 1C — Login, Session Authentication & Active-Verification Guards Tests
 *
 * Requirements covered:
 * 1. Login page renders
 * 2. Valid matric/password login succeeds
 * 3. Matric normalization works during login
 * 4. Incorrect password fails
 * 5. Unknown matric fails with the same generic credentials message
 * 6. Successful login creates an authenticated session
 * 7. Unauthenticated user cannot access /account (redirects HTML, 401 JSON)
 * 8. Authenticated user can access /account
 * 9. Logout invalidates the session and clears cookie
 * 10. Expired member can still log in
 * 11. Expired member can access /account
 * 12. Expired member fails requireActiveVerification
 * 13. Active current-cycle member passes requireActiveVerification
 * 14. An ACTIVE verification from an old/non-current cycle does not satisfy the guard
 * 15. Missing current academic cycle fails safely
 * 16. ADMIN is not blocked by annual member-verification expiry
 * 17. Passwords or password hashes are never placed into the session or rendered to the browser
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "./helpers/http.js";
import bcrypt from "bcrypt";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, LevelCode, UserRole, VerificationStatus } from "@prisma/client";
import dotenv from "dotenv";
import { createApp } from "../src/app.js";
import { createSessionMiddleware, ensureSessionTable } from "../src/session.js";

dotenv.config();

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL environment variable is required for tests");
}

let pool: pg.Pool;
let prisma: PrismaClient;
const app = createApp();

let testDeptId: string;
let testLevelId: string;
let currentCycleId: string;
let oldCycleId: string;

const RAW_PASSWORD = "ValidPassword123";
let hashedPassword: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
  await ensureSessionTable(pool);
  hashedPassword = await bcrypt.hash(RAW_PASSWORD, 10);
});

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

beforeEach(async () => {
  // Clean all data in proper foreign key order
  await pool.query('DELETE FROM "session"');
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

  // Baseline Department & Level
  const dept = await prisma.department.create({
    data: { name: "Computer Science", code: "CSC" },
  });
  testDeptId = dept.id;

  const lvl = await prisma.level.create({
    data: { code: LevelCode.ND1, label: "National Diploma 1" },
  });
  testLevelId = lvl.id;

  // Baseline Current Cycle (2025/2026)
  const cycle = await prisma.academicYearCycle.create({
    data: {
      name: "2025/2026",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-08-31"),
      isCurrent: true,
    },
  });
  currentCycleId = cycle.id;

  // Baseline Old/Past Cycle (2024/2025)
  const oldCycle = await prisma.academicYearCycle.create({
    data: {
      name: "2024/2025",
      startDate: new Date("2024-09-01"),
      endDate: new Date("2025-08-31"),
      isCurrent: false,
    },
  });
  oldCycleId = oldCycle.id;
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function createUser(overrides: Partial<any> = {}) {
  const isAdmin = overrides.role === UserRole.ADMIN;
  return prisma.user.create({
    data: {
      fullName: overrides.fullName || (isAdmin ? "YABATECH Management" : "Test Student"),
      email: overrides.email || (isAdmin ? "admin@yabatech.edu.ng" : "student@yabatech.edu.ng"),
      managementUsername: isAdmin ? (overrides.managementUsername || "Campus Management Console") : null,
      managementUsernameNormalized: isAdmin ? (overrides.managementUsernameNormalized || "campus management console") : null,
      matricNumber: isAdmin ? null : (overrides.matricNumber !== undefined ? overrides.matricNumber : "F/ND/24/3210051"),
      passwordHash: overrides.passwordHash || hashedPassword,
      role: overrides.role || UserRole.MEMBER,
      departmentId: isAdmin ? null : (overrides.departmentId !== undefined ? overrides.departmentId : testDeptId),
      levelId: isAdmin ? null : (overrides.levelId !== undefined ? overrides.levelId : testLevelId),
    },
  });
}

async function createVerification(userId: string, cycleId: string, status: VerificationStatus) {
  return prisma.memberVerification.create({
    data: {
      userId,
      cycleId,
      status,
      verifiedAt: new Date(),
      expiresAt: new Date("2026-08-31"),
    },
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Authentication: Login & Sessions", () => {
  it("refuses to start in production without an explicit session secret", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.SESSION_SECRET;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.SESSION_SECRET;

      expect(() => createSessionMiddleware()).toThrow(
        "SESSION_SECRET must be at least 32 characters in production"
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;

      if (previousSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSecret;
    }
  });

  it("renders the login page with correct username/password autocomplete attributes", async () => {
    const res = await request(app).get("/login");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Sign In");
    expect(res.text).toContain('id="matricNumber"');
    expect(res.text).toContain('name="matricNumber"');
    expect(res.text).toContain('autocomplete="username"');
    expect(res.text).toContain('id="password"');
    expect(res.text).toContain('name="password"');
    expect(res.text).toContain('autocomplete="current-password"');
    expect(res.text).toContain('href="/admin/login">Management sign in</a>');
    expect(res.text).not.toContain('name="fullName"');
  });

  it("successfully logs in with valid matric number and password", async () => {
    await createUser({ matricNumber: "F/ND/24/3210051" });

    const agent = request.agent(app);
    const res = await agent
      .post("/login")
      .set("Accept", "application/json")
      .send({
        matricNumber: "F/ND/24/3210051",
        password: RAW_PASSWORD,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.matricNumber).toBe("F/ND/24/3210051");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("normalizes matric number during login", async () => {
    await createUser({ matricNumber: "F/ND/24/3210051" });

    const agent = request.agent(app);
    // Submit with messy whitespace and lowercase letters
    const res = await agent
      .post("/login")
      .set("Accept", "application/json")
      .send({
        matricNumber: "  f / nd / 24 / 3210051  ",
        password: RAW_PASSWORD,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("fails with generic error message on incorrect password", async () => {
    await createUser({ matricNumber: "F/ND/24/3210051" });

    const res = await request(app)
      .post("/login")
      .set("Accept", "application/json")
      .send({
        matricNumber: "F/ND/24/3210051",
        password: "WrongPassword999",
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Invalid matric number or password.");
  });

  it("fails with same generic error message on unknown matric number", async () => {
    const res = await request(app)
      .post("/login")
      .set("Accept", "application/json")
      .send({
        matricNumber: "F/ND/24/0000000",
        password: RAW_PASSWORD,
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    // Generic error: does not reveal whether matric or password failed
    expect(res.body.message).toBe("Invalid matric number or password.");
  });

  it("creates an authenticated session in PostgreSQL", async () => {
    const user = await createUser({ matricNumber: "F/ND/24/3210051" });

    const agent = request.agent(app);
    const loginRes = await agent
      .post("/login")
      .set("Accept", "application/json")
      .send({
        matricNumber: "F/ND/24/3210051",
        password: RAW_PASSWORD,
      });
    expect(loginRes.status).toBe(200);

    // Verify session stored in PostgreSQL
    const sessionQueryResult = await pool.query('SELECT sess FROM "session"');
    expect(sessionQueryResult.rows.length).toBeGreaterThan(0);

    const sessionData = sessionQueryResult.rows[0].sess;
    expect(sessionData.userId).toBe(user.id);
    // Critical security check: ensure password and hash are NEVER in session
    expect(sessionData.password).toBeUndefined();
    expect(sessionData.passwordHash).toBeUndefined();
  });

  it("redirects unauthenticated HTML requests to /login", async () => {
    const res = await request(app).get("/account");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/login");
  });

  it("returns 401 for unauthenticated JSON requests to /account", async () => {
    const res = await request(app)
      .get("/account")
      .set("Accept", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("allows authenticated user to access /account", async () => {
    await createUser({
      fullName: "Jane Doe",
      matricNumber: "F/ND/24/3210051",
    });

    const agent = request.agent(app);
    await agent
      .post("/login")
      .send({ matricNumber: "F/ND/24/3210051", password: RAW_PASSWORD });

    const res = await agent.get("/account");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Jane Doe");
    expect(res.text).toContain("F/ND/24/3210051");
    expect(res.text).toContain("Computer Science");
    expect(res.text).toContain("ND1");
    expect(res.text).toContain("Organizer workspace");
    expect(res.text).toContain("Management access");
    expect(res.text).toContain("For authorized YABATECH event-management personnel.");
    expect(res.text).toContain('href="/admin/login">Management sign in</a>');
    expect(res.text).not.toContain("badge-active");
    // Password hash must never be rendered
    expect(res.text).not.toContain(hashedPassword);
  });

  it("lets a member update editable profile details without changing identity or verification", async () => {
    const user = await createUser({ matricNumber: "F/ND/24/3210051" });
    const verification = await createVerification(user.id, currentCycleId, VerificationStatus.ACTIVE);
    const department = await prisma.department.create({ data: { name: "Mass Communication", code: "MAC" } });
    const level = await prisma.level.create({ data: { code: LevelCode.ND2, label: "National Diploma 2" } });
    const agent = request.agent(app);
    await agent.post("/login").send({ matricNumber: user.matricNumber, password: RAW_PASSWORD });

    const editPage = await agent.get("/account/edit");
    expect(editPage.status).toBe(200);
    expect(editPage.text).toContain("Edit your details");
    expect(editPage.text).toContain('disabled');

    const response = await agent.post("/account/edit").set("Accept", "application/json").send({
      fullName: "Jane Updated", email: "jane.updated@yabatech.edu.ng",
      departmentId: department.id, levelId: level.id,
      matricNumber: "ATTEMPTED/CHANGE",
    });
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.fullName).toBe("Jane Updated");
    expect(updated.email).toBe("jane.updated@yabatech.edu.ng");
    expect(updated.departmentId).toBe(department.id);
    expect(updated.levelId).toBe(level.id);
    expect(updated.matricNumber).toBe("F/ND/24/3210051");
    expect(await prisma.memberVerification.findUnique({ where: { id: verification.id } })).toMatchObject({ status: VerificationStatus.ACTIVE });
  });

  it("rejects invalid profile references and duplicate email without partial updates", async () => {
    const user = await createUser({ matricNumber: "F/ND/24/3210051" });
    await createUser({ matricNumber: "F/ND/24/9999999", email: "taken@yabatech.edu.ng" });
    const agent = request.agent(app);
    await agent.post("/login").send({ matricNumber: user.matricNumber, password: RAW_PASSWORD });

    const invalidReference = await agent.post("/account/edit").set("Accept", "application/json").send({
      fullName: "Changed Name", email: "changed@yabatech.edu.ng",
      departmentId: "00000000-0000-0000-0000-000000000000", levelId: testLevelId,
    });
    expect(invalidReference.status).toBe(400);

    const duplicateEmail = await agent.post("/account/edit").set("Accept", "application/json").send({
      fullName: "Changed Name", email: "taken@yabatech.edu.ng",
      departmentId: testDeptId, levelId: testLevelId,
    });
    expect(duplicateEmail.status).toBe(409);

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.fullName).toBe("Test Student");
    expect(unchanged.email).toBe("student@yabatech.edu.ng");
  });

  it("logout invalidates the session and prevents subsequent access", async () => {
    await createUser({ matricNumber: "F/ND/24/3210051" });

    const agent = request.agent(app);
    await agent
      .post("/login")
      .send({ matricNumber: "F/ND/24/3210051", password: RAW_PASSWORD });

    // Confirm authenticated
    const acc1 = await agent.get("/account");
    expect(acc1.status).toBe(200);

    // Logout
    const logoutRes = await agent.post("/logout");
    expect([200, 302]).toContain(logoutRes.status);

    // /account should now redirect to /login
    const acc2 = await agent.get("/account");
    expect(acc2.status).toBe(302);
    expect(acc2.header.location).toBe("/login");
  });
});

describe("Verification Guards & Yearly Expiry Behaviour", () => {
  it("allows an expired member to log in and access /account", async () => {
    const user = await createUser({ matricNumber: "F/ND/24/3210051" });
    // User verification for current cycle is EXPIRED
    await createVerification(user.id, currentCycleId, VerificationStatus.EXPIRED);

    const agent = request.agent(app);
    const loginRes = await agent
      .post("/login")
      .type("form")
      .send({ matricNumber: "F/ND/24/3210051", password: RAW_PASSWORD });
    expect(loginRes.status).toBe(302); // Redirects to /account

    const accountRes = await agent.get("/account");
    expect(accountRes.status).toBe(200);
    expect(accountRes.text).toContain("EXPIRED");
  });

  it("blocks an expired member from requireActiveVerification", async () => {
    const user = await createUser({ matricNumber: "F/ND/24/3210051" });
    await createVerification(user.id, currentCycleId, VerificationStatus.EXPIRED);

    const agent = request.agent(app);
    await agent
      .post("/login")
      .send({ matricNumber: "F/ND/24/3210051", password: RAW_PASSWORD });

    const res = await agent
      .get("/account/protected-action")
      .set("Accept", "application/json");

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/active verification.*required/i);
    expect(res.body.verificationStatus).toBe("EXPIRED");
  });

  it("allows an active current-cycle member to pass requireActiveVerification", async () => {
    const user = await createUser({ matricNumber: "F/ND/24/3210051" });
    await createVerification(user.id, currentCycleId, VerificationStatus.ACTIVE);

    const agent = request.agent(app);
    await agent
      .post("/login")
      .send({ matricNumber: "F/ND/24/3210051", password: RAW_PASSWORD });

    const res = await agent
      .get("/account/protected-action")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/active verification confirmed/i);
  });

  it("rejects an ACTIVE verification from an old/non-current cycle", async () => {
    const user = await createUser({ matricNumber: "F/ND/24/3210051" });
    // User had ACTIVE verification in the old cycle (2024/2025), but none in current cycle (2025/2026)
    await createVerification(user.id, oldCycleId, VerificationStatus.ACTIVE);

    const agent = request.agent(app);
    await agent
      .post("/login")
      .send({ matricNumber: "F/ND/24/3210051", password: RAW_PASSWORD });

    const res = await agent
      .get("/account/protected-action")
      .set("Accept", "application/json");

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/active verification.*required/i);
  });

  it("fails safely if there is no current academic cycle configured", async () => {
    const user = await createUser({ matricNumber: "F/ND/24/3210051" });
    await createVerification(user.id, currentCycleId, VerificationStatus.ACTIVE);

    // Disable current cycle
    await prisma.academicYearCycle.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });

    const agent = request.agent(app);
    await agent
      .post("/login")
      .send({ matricNumber: "F/ND/24/3210051", password: RAW_PASSWORD });

    const res = await agent
      .get("/account/protected-action")
      .set("Accept", "application/json");

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/no active academic cycle/i);
  });

  it("exempts YABATECH Management ADMIN accounts from yearly member-verification expiry", async () => {
    const adminUser = await createUser({
      email: "admin@yabatech.edu.ng",
      role: UserRole.ADMIN,
    });
    // Admin has NO member verification at all

    const agent = request.agent(app);
    await agent
      .post("/admin/login")
      .send({ username: "Campus Management Console", password: RAW_PASSWORD });

    // Should pass requireActiveVerification without issue
    const res = await agent
      .get("/account/protected-action")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.userId).toBe(adminUser.id);
  });

  it("ensures passwords and password hashes are never stored in session or rendered", async () => {
    const user = await createUser({ matricNumber: "F/ND/24/3210051" });

    const agent = request.agent(app);
    await agent
      .post("/login")
      .send({ matricNumber: "F/ND/24/3210051", password: RAW_PASSWORD });

    // Inspect database session record directly
    const sessionRows = await pool.query('SELECT sess FROM "session"');
    expect(sessionRows.rows.length).toBeGreaterThan(0);
    const sessionObj = sessionRows.rows[0].sess;

    expect(sessionObj.userId).toBe(user.id);
    expect(sessionObj.password).toBeUndefined();
    expect(sessionObj.passwordHash).toBeUndefined();

    // Inspect rendered /account HTML output
    const accountRes = await agent.get("/account");
    expect(accountRes.text).not.toContain(RAW_PASSWORD);
    expect(accountRes.text).not.toContain(hashedPassword);
  });
});
