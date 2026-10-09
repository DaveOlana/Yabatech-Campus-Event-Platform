/**
 * Milestone 2 — YABATECH Management Admin Foundation & Audit Logging Tests
 *
 * Requirements covered:
 * 1. ADMIN can exist without matric number, department, level, or MemberVerification.
 * 2. Database rejects ADMIN with academic fields (User_admin_no_academic_identity_check).
 * 3. Database rejects a second ADMIN via partial unique index (User_one_admin).
 * 4. Admin bootstrap creates management account correctly.
 * 5. Admin bootstrap enforces the minimum 8-character password policy.
 * 6. Admin bootstrap accepts simple passwords meeting that minimum.
 * 7. Repeating bootstrap does not create another admin or silently reset password.
 * 8. Bootstrapping with conflicting identity fails with clear conflict error.
 * 9. Admin login page renders.
 * 10. Correct Management username/password authenticates successfully.
 * 11. Wrong password fails with a generic credential message.
 * 12. Unknown Management username fails with the same generic message.
 * 13. MEMBER credentials cannot authenticate through /admin/login.
 * 14. Unauthenticated users cannot access /admin (redirects to /admin/login).
 * 15. Authenticated MEMBER users cannot access /admin (403 Forbidden).
 * 16. Authenticated ADMIN can access /admin.
 * 17. Authenticated ADMIN accessing /account is redirected to /admin.
 * 18. Successful admin login produces an ADMIN_LOGIN audit record.
 * 19. If audit creation fails during login, session is destroyed (atomic safety).
 * 20. POST /admin/logout is protected by requireAdmin (MEMBER receives 403, no audit log).
 * 21. Authenticated admin logout creates ADMIN_LOGOUT audit record and destroys session.
 * 22. Logout session destruction succeeds even if audit logging throws.
 * 23. Audit service defensively sanitizes sensitive metadata (passwords, tokens, cookies).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "./helpers/http.js";
import supertest from "supertest";
import bcrypt from "bcrypt";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, LevelCode, UserRole } from "@prisma/client";
import dotenv from "dotenv";
import { createApp } from "../src/app.js";
import { ensureSessionTable } from "../src/session.js";
import { bootstrapAdmin, resetAdminPassword } from "../scripts/bootstrap-admin.js";
import * as auditService from "../src/services/audit.service.js";
import { AUDIT_ACTIONS } from "../src/services/audit.service.js";
import { normalizeManagementUsername } from "../src/validators/auth.validator.js";

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

const ADMIN_PASSWORD = "SecureAdminPassword2026!";
const ADMIN_USERNAME = "Campus Management Console";
let hashedAdminPassword: string;
const MEMBER_PASSWORD = "MemberPassword123";
let hashedMemberPassword: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
  await ensureSessionTable(pool);

  hashedAdminPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  hashedMemberPassword = await bcrypt.hash(MEMBER_PASSWORD, 10);
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

  // Baseline department and level
  const dept = await prisma.department.create({
    data: { name: "Computer Science", code: "CSC" },
  });
  testDeptId = dept.id;

  const lvl = await prisma.level.create({
    data: { code: LevelCode.ND1, label: "National Diploma 1" },
  });
  testLevelId = lvl.id;

  // Baseline Current Cycle
  const cycle = await prisma.academicYearCycle.create({
    data: {
      name: "2025/2026",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-08-31"),
      isCurrent: true,
    },
  });
  currentCycleId = cycle.id;
});

// Helper: Seed Admin
async function seedAdmin(username = ADMIN_USERNAME) {
  return prisma.user.create({
    data: {
      fullName: "YABATECH Management",
      email: "admin@ycep.local",
      managementUsername: username,
      managementUsernameNormalized: normalizeManagementUsername(username),
      passwordHash: hashedAdminPassword,
      role: UserRole.ADMIN,
      matricNumber: null,
      departmentId: null,
      levelId: null,
    },
  });
}

// Helper: Seed Member
async function seedMember(matricNumber = "F/ND/24/3210001", email = "student@yabatech.edu.ng") {
  return prisma.user.create({
    data: {
      fullName: "Student Member",
      email,
      matricNumber,
      passwordHash: hashedMemberPassword,
      role: UserRole.MEMBER,
      departmentId: testDeptId,
      levelId: testLevelId,
    },
  });
}

describe("Milestone 2 — Schema & Database Constraints", () => {
  it("allows an ADMIN to exist without matric number, department, level, or verification", async () => {
    const admin = await seedAdmin();
    expect(admin.id).toBeDefined();
    expect(admin.role).toBe(UserRole.ADMIN);
    expect(admin.matricNumber).toBeNull();
    expect(admin.departmentId).toBeNull();
    expect(admin.levelId).toBeNull();
  });

  it("database rejects ADMIN with academic fields via User_admin_no_academic_identity_check", async () => {
    await expect(
      prisma.user.create({
        data: {
          fullName: "Invalid Admin",
          email: "badadmin@ycep.local",
          managementUsername: "Invalid Management",
          managementUsernameNormalized: "invalid management",
          passwordHash: hashedAdminPassword,
          role: UserRole.ADMIN,
          matricNumber: "F/ND/24/9999999", // Forbidden for ADMIN
          departmentId: testDeptId,
          levelId: testLevelId,
        },
      })
    ).rejects.toThrow();
  });

  it("database rejects creation of a second ADMIN via partial unique index User_one_admin", async () => {
    await seedAdmin("First Management");

    await expect(
      prisma.user.create({
        data: {
          fullName: "Second Admin",
          email: "admin2@ycep.local",
          managementUsername: "Second Management",
          managementUsernameNormalized: "second management",
          passwordHash: hashedAdminPassword,
          role: UserRole.ADMIN,
          matricNumber: null,
          departmentId: null,
          levelId: null,
        },
      })
    ).rejects.toThrow();
  });
});

describe("Milestone 2 — Admin Bootstrapping", () => {
  it("bootstraps the initial management account successfully", async () => {
    const result = await bootstrapAdmin({
      name: "YABATECH Management",
      username: ADMIN_USERNAME,
      password: "SuperSecretAdminPassword123!",
    });

    expect(result.created).toBe(true);
    if (result.created) {
      expect(result.user.managementUsername).toBe(ADMIN_USERNAME);
      expect(result.user.role).toBe(UserRole.ADMIN);
      expect(result.user.matricNumber).toBeNull();
    }
  });

  it("rejects passwords shorter than 8 characters", async () => {
    await expect(
      bootstrapAdmin({
        name: "YABATECH Management",
        username: ADMIN_USERNAME,
        password: "short",
      })
    ).rejects.toThrow(/at least 8 characters/);
  });

  it("accepts a simple password that satisfies the 8-character minimum", async () => {
    const result = await bootstrapAdmin({ name: "YABATECH Management", username: ADMIN_USERNAME, password: "simple88" });
    expect(result.created).toBe(true);
  });

  it("is safely repeatable without silently resetting the password or creating a duplicate", async () => {
    const firstRun = await bootstrapAdmin({
      name: "YABATECH Management",
      username: ADMIN_USERNAME,
      password: "InitialPassword123!",
    });
    expect(firstRun.created).toBe(true);

    const originalHash = (firstRun as { user: { passwordHash: string } }).user.passwordHash;

    const secondRun = await bootstrapAdmin({
      name: "YABATECH Management",
      username: "  campus   management console  ",
      password: "AttemptedNewPassword123!",
    });

    expect(secondRun.created).toBe(false);
    if (!secondRun.created) {
      expect(secondRun.reason).toBe("ADMIN_ALREADY_EXISTS");
    }

    // Verify password hash in DB was not overwritten
    const adminInDb = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
    expect(adminInDb?.passwordHash).toBe(originalHash);
  });

  it("fails with clear error if bootstrap identity conflicts with existing admin", async () => {
    await bootstrapAdmin({
      name: "YABATECH Management",
      username: ADMIN_USERNAME,
      password: "InitialPassword123!",
    });

    await expect(
      bootstrapAdmin({
        name: "Conflicting Admin",
        username: "Different Management",
        password: "DifferentPassword123!",
      })
    ).rejects.toThrow(/different Management username/);
  });

  it("explicit update/reset preserves the ADMIN row and its relationships", async () => {
    const first = await bootstrapAdmin({ name: "YABATECH Management", username: ADMIN_USERNAME, password: "initial88" });
    const originalId = first.user.id;
    await auditService.createAuditLog({ actorUserId: originalId, action: "PRESERVE_ME" });
    const updated = await bootstrapAdmin({ name: "YABATECH Management", username: "Updated Management", password: "updated88", updateExistingCredentials: true });
    expect(updated.user.id).toBe(originalId);
    expect(await prisma.auditLog.count({ where: { actorUserId: originalId } })).toBe(1);
    await resetAdminPassword("resetpass");
    const preserved = await prisma.user.findUniqueOrThrow({ where: { id: originalId } });
    expect(await bcrypt.compare("resetpass", preserved.passwordHash)).toBe(true);
  });
});

describe("Milestone 2 — Admin Authentication", () => {
  it("renders the admin login page", async () => {
    const res = await request(app).get("/admin/login");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Management sign in");
    expect(res.text).toContain('name="username"');
    expect(res.text).toContain('autocomplete="username"');
    expect(res.text).toContain('name="password"');
    expect(res.text).toContain('autocomplete="current-password"');
  });

  it("successfully authenticates ADMIN with valid username and password", async () => {
    await seedAdmin();

    const res = await request(app)
      .post("/admin/login")
      .type("form")
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/admin");
    expect(res.header["set-cookie"]).toBeDefined();
  });

  it("normalizes username case and repeated whitespace during login", async () => {
    await seedAdmin();

    const res = await request(app)
      .post("/admin/login")
      .type("form")
      .send({ username: "  campus   MANAGEMENT console ", password: ADMIN_PASSWORD });

    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/admin");
  });

  it("regenerates the session identifier after successful Management login", async () => {
    await seedAdmin();
    const agent = supertest.agent(app);
    const before = await agent.get("/admin/login").expect(200);
    const csrf = before.headers["x-csrf-token"] as string;
    const beforeCookie = (before.headers["set-cookie"] as unknown as string[] | undefined)?.find((value) => value.startsWith("ycep.sid="));
    const after = await agent.post("/admin/login").set("X-CSRF-Token", csrf).type("form").send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }).expect(302);
    const afterCookie = (after.headers["set-cookie"] as unknown as string[] | undefined)?.find((value) => value.startsWith("ycep.sid="));
    expect(beforeCookie).toBeDefined();
    expect(afterCookie).toBeDefined();
    expect(afterCookie).not.toBe(beforeCookie);
  });

  it("fails with generic error message on incorrect password", async () => {
    await seedAdmin();

    const res = await request(app)
      .post("/admin/login")
      .send({ username: ADMIN_USERNAME, password: "WrongPassword123!" });

    expect(res.status).toBe(401);
    expect(res.text).toContain("Invalid username or password.");
  });

  it("fails with generic error message on unknown username", async () => {
    const res = await request(app)
      .post("/admin/login")
      .send({ username: "Unknown Management", password: ADMIN_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.text).toContain("Invalid username or password.");
  });

  it("does not accept the legacy ADMIN email as a login identifier", async () => {
    await seedAdmin();
    const res = await request(app).post("/admin/login").send({ username: "admin@ycep.local", password: ADMIN_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.text).toContain("Invalid username or password.");
  });

  it("MEMBER credentials cannot authenticate through /admin/login", async () => {
    await seedMember("F/ND/24/3210001", "student@yabatech.edu.ng");

    const res = await request(app)
      .post("/admin/login")
      .send({ username: "student@yabatech.edu.ng", password: MEMBER_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.text).toContain("Invalid username or password.");

    // Ensure no session cookie was granted
    const rawCookies = res.header["set-cookie"];
    if (rawCookies) {
      const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
      const sid = cookieList.find((c: string) => c.startsWith("ycep.sid="));
      expect(sid).toBeUndefined();
    }
  });
});

describe("Milestone 2 — Authorization & Routing", () => {
  it("unauthenticated request to /admin redirects to /admin/login", async () => {
    const res = await request(app).get("/admin");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/admin/login");
  });

  it("keeps every Management workspace destination protected", async () => {
    for (const path of ["/admin/organizers", "/admin/events", "/admin/events/history", "/admin/account"]) {
      await request(app).get(path).expect(302).expect("Location", "/admin/login");
    }
  });

  it("unauthenticated JSON request to /admin returns 401", async () => {
    const res = await request(app).get("/admin").set("Accept", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("authenticated MEMBER attempting access to /admin receives 403 Forbidden", async () => {
    const member = await seedMember();

    // Log in as member via member login
    const agent = request.agent(app);
    await agent
      .post("/login")
      .send({ matricNumber: "F/ND/24/3210001", password: MEMBER_PASSWORD });

    // Attempt to access /admin
    const res = await agent.get("/admin");
    expect(res.status).toBe(403);
    expect(res.text).toContain("Forbidden");
  });

  it("authenticated ADMIN can access /admin", async () => {
    await seedAdmin();

    const agent = request.agent(app);
    await agent
      .post("/admin/login")
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    const res = await agent.get("/admin");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Management workspace");
    expect(res.text).toContain(ADMIN_USERNAME);
    expect(res.text).toContain('href="/admin/organizers">Organizer applications</a>');
    expect(res.text).toContain('href="/admin/events">Event approvals</a>');
    expect(res.text).toContain('href="/admin/events/history">History</a>');
    expect(res.text).toContain('href="/admin/account">Account</a>');
    expect(res.text).toContain('action="/admin/logout" method="POST"');
  });

  it("authenticated ADMIN accessing /account is redirected to /admin", async () => {
    await seedAdmin();

    const agent = request.agent(app);
    await agent
      .post("/admin/login")
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    // Access member account page
    const res = await agent.get("/account");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/admin");
  });
});

describe("Management account security", () => {
  it("requires ADMIN access for the account page", async () => {
    await request(app).get("/admin/account").expect(302).expect("Location", "/admin/login");
    await seedMember();
    const member = request.agent(app);
    await member.post("/login").type("form").send({ matricNumber: "F/ND/24/3210001", password: MEMBER_PASSWORD }).expect(302);
    await member.get("/admin/account").expect(403);
  });

  it("requires the current password and changes the normalized username without replacing the ADMIN", async () => {
    const admin = await seedAdmin();
    const agent = request.agent(app);
    await agent.post("/admin/login").type("form").send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }).expect(302);
    await agent.get("/admin/account").expect(200);
    await agent.post("/admin/account/username").type("form").send({ currentPassword: "wrong-password", newUsername: "New Management Name" }).expect(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).managementUsername).toBe(ADMIN_USERNAME);
    await agent.post("/admin/account/username").type("form").send({ currentPassword: ADMIN_PASSWORD, newUsername: "  New   Management Name  " }).expect(302);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(updated.managementUsername).toBe("New Management Name");
    expect(updated.managementUsernameNormalized).toBe("new management name");
    await agent.get("/admin/account").expect(200);
    await request(app).post("/admin/login").type("form").send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }).expect(401);
    await request(app).post("/admin/login").type("form").send({ username: "NEW MANAGEMENT NAME", password: ADMIN_PASSWORD }).expect(302);
    expect(await prisma.auditLog.count({ where: { actorUserId: admin.id, action: AUDIT_ACTIONS.ADMIN_USERNAME_CHANGED } })).toBe(1);
  });

  it("requires the current password, enforces 8 characters, accepts a simple password, and invalidates old sessions", async () => {
    const admin = await seedAdmin();
    const first = request.agent(app);
    const second = request.agent(app);
    await first.post("/admin/login").type("form").send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }).expect(302);
    await second.post("/admin/login").type("form").send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }).expect(302);
    await first.post("/admin/account/password").type("form").send({ currentPassword: "wrong-password", newPassword: "simple88", confirmPassword: "simple88" }).expect(400);
    await first.post("/admin/account/password").type("form").send({ currentPassword: ADMIN_PASSWORD, newPassword: "short", confirmPassword: "short" }).expect(400);
    await first.post("/admin/account/password").type("form").send({ currentPassword: ADMIN_PASSWORD, newPassword: "simple88", confirmPassword: "simple88" }).expect(302);
    await first.get("/admin/account").expect(200);
    await second.get("/admin").expect(302).expect("Location", "/admin/login");
    await request(app).post("/admin/login").type("form").send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }).expect(401);
    await request(app).post("/admin/login").type("form").send({ username: ADMIN_USERNAME, password: "simple88" }).expect(302);
    expect(await prisma.auditLog.count({ where: { actorUserId: admin.id, action: AUDIT_ACTIONS.ADMIN_PASSWORD_CHANGED } })).toBe(1);
  });
});

describe("Milestone 2 — Audit Logging & Session Safety", () => {
  it("successful admin login produces an ADMIN_LOGIN audit record", async () => {
    const admin = await seedAdmin();

    await request(app)
      .post("/admin/login")
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    const auditRecords = await prisma.auditLog.findMany({
      where: { actorUserId: admin.id },
    });

    expect(auditRecords.length).toBe(1);
    expect(auditRecords[0].action).toBe(AUDIT_ACTIONS.ADMIN_LOGIN);
    expect(auditRecords[0].actorUserId).toBe(admin.id);
  });

  it("if audit creation fails during login, session is destroyed and login aborts", async () => {
    await seedAdmin();

    // Mock createAuditLog to simulate unexpected database/audit failure
    const spy = vi.spyOn(auditService, "createAuditLog").mockRejectedValueOnce(new Error("Audit DB Error"));

    const res = await request(app)
      .post("/admin/login")
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    // Login must fail / pass error to error handler (500)
    expect(res.status).toBe(500);

    // Verify no sessions remain in PostgreSQL session table
    const sessions = await pool.query('SELECT * FROM "session"');
    expect(sessions.rows.length).toBe(0);

    spy.mockRestore();
  });

  it("POST /admin/logout is protected by requireAdmin (MEMBER receives 403, no audit log)", async () => {
    await seedMember();

    const agent = request.agent(app);
    await agent
      .post("/login")
      .send({ matricNumber: "F/ND/24/3210001", password: MEMBER_PASSWORD });

    const res = await agent.post("/admin/logout");
    expect(res.status).toBe(403);

    // Ensure no ADMIN_LOGOUT record was written
    const logs = await prisma.auditLog.findMany({
      where: { action: AUDIT_ACTIONS.ADMIN_LOGOUT },
    });
    expect(logs.length).toBe(0);
  });

  it("authenticated admin logout creates ADMIN_LOGOUT audit record and destroys session", async () => {
    const admin = await seedAdmin();

    const agent = request.agent(app);
    await agent
      .post("/admin/login")
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    const res = await agent.post("/admin/logout");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/admin/login");

    // Check audit records
    const logs = await prisma.auditLog.findMany({
      where: { actorUserId: admin.id },
      orderBy: { createdAt: "asc" },
    });

    expect(logs.length).toBe(2);
    expect(logs[0].action).toBe(AUDIT_ACTIONS.ADMIN_LOGIN);
    expect(logs[1].action).toBe(AUDIT_ACTIONS.ADMIN_LOGOUT);

    // Verify session table is now empty
    const sessionRows = await pool.query('SELECT * FROM "session"');
    expect(sessionRows.rows.length).toBe(0);
  });

  it("logout session destruction succeeds even if audit logging throws", async () => {
    await seedAdmin();

    const agent = request.agent(app);
    await agent
      .post("/admin/login")
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    const spy = vi.spyOn(auditService, "createAuditLog").mockRejectedValueOnce(new Error("Audit failure during logout"));

    const res = await agent.post("/admin/logout");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/admin/login");

    // Session is still destroyed
    const sessionRows = await pool.query('SELECT * FROM "session"');
    expect(sessionRows.rows.length).toBe(0);

    spy.mockRestore();
  });

  it("audit service defensively sanitizes sensitive metadata", async () => {
    const admin = await seedAdmin();

    await auditService.createAuditLog({
      actorUserId: admin.id,
      action: "TEST_SENSITIVE_ACTION",
      metadata: {
        safeField: "safeValue",
        password: "ShouldNotBeSaved",
        passwordHash: "$2b$10$xyz",
        sessionSecret: "SuperSecretKey",
        cookie: "ycep.sid=123",
        authToken: "Bearer abc",
        authorization: "Basic xyz",
      },
    });

    const record = await prisma.auditLog.findFirst({
      where: { action: "TEST_SENSITIVE_ACTION" },
    });

    expect(record).toBeDefined();
    const meta = record?.metadata as Record<string, unknown>;
    expect(meta.safeField).toBe("safeValue");
    expect(meta.password).toBeUndefined();
    expect(meta.passwordHash).toBeUndefined();
    expect(meta.sessionSecret).toBeUndefined();
    expect(meta.cookie).toBeUndefined();
    expect(meta.authToken).toBeUndefined();
    expect(meta.authorization).toBeUndefined();
  });
});
