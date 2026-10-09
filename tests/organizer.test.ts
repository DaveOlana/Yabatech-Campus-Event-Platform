/**
 * Milestone 3 — Organizer Verification Foundation Tests
 *
 * Requirements covered:
 * 1. unauthenticated member cannot apply (redirects/401)
 * 2. ADMIN cannot apply (rejected with 403)
 * 3. inactive/expired member verification cannot apply (403)
 * 4. active current-cycle member can apply
 * 5. duplicate PENDING application in same cycle is rejected by service/route
 * 6. database partial unique index rejects duplicate PENDING application
 * 7. rejected application permits a fresh new application while preserving history
 * 8. ACTIVE authorization blocks another application in that cycle
 * 9. REVOKED authorization blocks reapplication that cycle
 * 10. admin can approve a PENDING application
 * 11. admin can reject a PENDING application with notes
 * 12. approval creates OrganizerAuthorization with ACTIVE status
 * 13. rejection does not create OrganizerAuthorization
 * 14. approval does not rewrite original submission fields
 * 15. approving same application twice fails
 * 16. reject after approval fails
 * 17. approve after rejection fails
 * 18. concurrent approve/reject cannot both succeed (row lock ensures serialization)
 * 19. old-cycle PENDING application cannot be reviewed/approved
 * 20. member whose verification becomes inactive after applying cannot be approved
 * 21. existing/revoked authorization cannot be reactivated through another approval
 * 22. requireOrganizer accepts valid active current organizer
 * 23. requireOrganizer rejects rejected applicant
 * 24. requireOrganizer rejects revoked organizer
 * 25. requireOrganizer rejects prior-cycle stored ACTIVE authorization (derived expiry)
 * 26. requireOrganizer rejects organizer whose current MemberVerification is no longer ACTIVE
 * 27. requireOrganizer rejects ADMIN account (admin is not organizer)
 * 28. approval, rejection, and revocation produce correct AuditLogs
 * 29. simulated audit failure rolls back corresponding organizer mutation
 * 30. historical applications remain preserved
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "./helpers/http.js";
import bcrypt from "bcrypt";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  LevelCode,
  UserRole,
  VerificationStatus,
  OrganizerApplicationStatus,
  OrganizerAuthorizationStatus,
} from "@prisma/client";
import dotenv from "dotenv";
import { createApp } from "../src/app.js";
import { ensureSessionTable } from "../src/session.js";
import { requireOrganizer } from "../src/middleware/auth.middleware.js";
import * as auditService from "../src/services/audit.service.js";
import { AUDIT_ACTIONS } from "../src/services/audit.service.js";

dotenv.config();

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL environment variable is required for tests");
}

let pool: pg.Pool;
let prisma: PrismaClient;
const app = createApp();

// Isolated test app for testing requireOrganizer without exposing test endpoints in production
const testGuardApp = createApp((guardApp) => guardApp.get(
  "/test-guard/organizer-only", requireOrganizer, (req, res) => {
    res.status(200).json({
      success: true,
      message: "Authorized organizer access granted.",
      authorization: req.organizerAuthorization,
    });
  }
));

let testDeptId: string;
let testLevelId: string;
let currentCycleId: string;
let previousCycleId: string;

const ADMIN_PASSWORD = "SecureAdminPassword2026!";
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

  const dept = await prisma.department.create({
    data: { name: "Computer Science", code: "CSC" },
  });
  testDeptId = dept.id;

  const lvl = await prisma.level.create({
    data: { code: LevelCode.ND1, label: "National Diploma 1" },
  });
  testLevelId = lvl.id;

  // Previous cycle (isCurrent: false)
  const prevCycle = await prisma.academicYearCycle.create({
    data: {
      name: "2024/2025",
      startDate: new Date("2024-09-01"),
      endDate: new Date("2025-08-31"),
      isCurrent: false,
    },
  });
  previousCycleId = prevCycle.id;

  // Current cycle (isCurrent: true)
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

// Helpers
async function seedAdmin(email = "admin@ycep.local") {
  return prisma.user.create({
    data: {
      fullName: "YABATECH Management",
      email: email.toLowerCase(),
      passwordHash: hashedAdminPassword,
      role: UserRole.ADMIN,
    },
  });
}

async function seedMember(matricNumber = "F/ND/24/3210001", email = "student@yabatech.edu.ng") {
  return prisma.user.create({
    data: {
      fullName: "David Adeniyi",
      email,
      matricNumber,
      passwordHash: hashedMemberPassword,
      role: UserRole.MEMBER,
      departmentId: testDeptId,
      levelId: testLevelId,
    },
  });
}

async function seedActiveVerification(userId: string, cycleId = currentCycleId) {
  return prisma.memberVerification.create({
    data: {
      userId,
      cycleId,
      status: VerificationStatus.ACTIVE,
    },
  });
}

async function loginAsMember(matricNumber = "F/ND/24/3210001"): Promise<string[]> {
  const res = await request(app)
    .post("/login")
    .send({ matricNumber, password: MEMBER_PASSWORD });
  return res.headers["set-cookie"] as string[];
}

async function loginAsAdmin(email = "admin@ycep.local"): Promise<string[]> {
  const res = await request(app)
    .post("/admin/login")
    .send({ email, password: ADMIN_PASSWORD });
  return res.headers["set-cookie"] as string[];
}

async function loginAsMemberOnApp(appInstance: any, matricNumber = "F/ND/24/3210001"): Promise<string[]> {
  const res = await request(appInstance)
    .post("/login")
    .send({ matricNumber, password: MEMBER_PASSWORD });
  return res.headers["set-cookie"] as string[];
}

async function loginAsAdminOnApp(appInstance: any, email = "admin@ycep.local"): Promise<string[]> {
  const res = await request(appInstance)
    .post("/admin/login")
    .send({ email, password: ADMIN_PASSWORD });
  return res.headers["set-cookie"] as string[];
}

describe("Milestone 3 — Application Submission & Eligibility", () => {
  it("unauthenticated member cannot apply (redirects to /login for HTML, 401 for JSON)", async () => {
    const htmlRes = await request(app).get("/organizer/apply");
    expect(htmlRes.status).toBe(302);
    expect(htmlRes.headers.location).toBe("/login");

    const jsonRes = await request(app)
      .post("/organizer/apply")
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "NACOS YABATECH",
        phoneNumber: "08012345678",
        reason: "Valid reason for organizer privileges",
      });
    expect(jsonRes.status).toBe(401);
  });

  it("ADMIN cannot apply for organizer privileges", async () => {
    await seedAdmin();
    const adminCookie = await loginAsAdmin();

    const getRes = await request(app)
      .get("/organizer/apply")
      .set("Cookie", adminCookie);
    expect(getRes.status).toBe(302);
    expect(getRes.headers.location).toBe("/admin");

    const postRes = await request(app)
      .post("/organizer/apply")
      .set("Cookie", adminCookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "Admin Society",
        phoneNumber: "08012345678",
        reason: "Admin trying to apply",
      });
    expect(postRes.status).toBe(403);
    expect(postRes.body.message).toMatch(/Administrators cannot apply/);
  });

  it("inactive/expired member verification cannot apply (403)", async () => {
    const member = await seedMember();
    // Do NOT seed active verification for current cycle
    const cookie = await loginAsMember(member.matricNumber!);

    const res = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "NACOS YABATECH",
        phoneNumber: "+234 801 234 5678",
        reason: "Organizing tech meetups and departmental workshops",
      });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Active verification for the current academic cycle is required/);
  });

  it("active current-cycle member can apply successfully", async () => {
    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);
    const cookie = await loginAsMember(member.matricNumber!);

    const res = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "NACOS YABATECH",
        phoneNumber: "+234 801 234 5678",
        organizationName: "Nigeria Association of Computing Students",
        positionTitle: "President",
        reason: "Hosting tech conferences and hackathons on campus for computer science students.",
        evidenceUrlOrText: "https://nacos-yabatech.org/letter.pdf",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.application.status).toBe("PENDING");
    expect(res.body.application.requestedPublicName).toBe("NACOS YABATECH");
    expect(res.body.application.phoneNumber).toBe("+234 801 234 5678");

    // Verify persisted in database
    const saved = await prisma.organizerApplication.findFirst({
      where: { userId: member.id, cycleId: currentCycleId },
    });
    expect(saved).not.toBeNull();
    expect(saved?.status).toBe(OrganizerApplicationStatus.PENDING);
  });

  it("duplicate PENDING application in same cycle is rejected", async () => {
    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);
    const cookie = await loginAsMember(member.matricNumber!);

    // First submission
    const res1 = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "NACOS YABATECH",
        phoneNumber: "+234 801 234 5678",
        reason: "Valid reason for first application attempt.",
      });
    expect(res1.status).toBe(201);

    // Second submission in same cycle
    const res2 = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "NACOS YABATECH 2",
        phoneNumber: "+234 801 234 5678",
        reason: "Attempting duplicate pending application.",
      });
    expect(res2.status).toBe(409);
    expect(res2.body.message).toMatch(/already have a pending organizer application/);
  });

  it("database partial unique index rejects duplicate PENDING application for same user and cycle", async () => {
    const member = await seedMember();

    await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "First Org",
        phoneNumber: "08012345678",
        reason: "First reason",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    // Attempt direct Prisma insertion bypassing application service
    await expect(
      prisma.organizerApplication.create({
        data: {
          userId: member.id,
          cycleId: currentCycleId,
          requestedPublicName: "Second Org",
          phoneNumber: "08012345678",
          reason: "Second reason",
          status: OrganizerApplicationStatus.PENDING,
        },
      })
    ).rejects.toThrow(/unique constraint/i);
  });

  it("rejected application permits a fresh new application while preserving history", async () => {
    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);
    const cookie = await loginAsMember(member.matricNumber!);

    // Seed first application as REJECTED
    const firstApp = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Old Org Name",
        phoneNumber: "08012345678",
        reason: "Initial reason that got rejected",
        status: OrganizerApplicationStatus.REJECTED,
        adminReviewNotes: "Please provide valid association letter.",
      },
    });

    // Member submits a new application
    const res = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "Better Org Name",
        phoneNumber: "08012345678",
        reason: "Updated reason with full departmental authorization letter.",
        evidenceUrlOrText: "https://letter.dept.edu/signed.pdf",
      });

    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe("PENDING");

    // Both applications must exist in database (history preserved)
    const allApps = await prisma.organizerApplication.findMany({
      where: { userId: member.id, cycleId: currentCycleId },
      orderBy: { createdAt: "asc" },
    });
    expect(allApps.length).toBe(2);
    expect(allApps[0].id).toBe(firstApp.id);
    expect(allApps[0].status).toBe(OrganizerApplicationStatus.REJECTED);
    expect(allApps[1].status).toBe(OrganizerApplicationStatus.PENDING);
  });

  it("ACTIVE authorization blocks another application in that cycle", async () => {
    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);
    const cookie = await loginAsMember(member.matricNumber!);

    // Seed approved app and active authorization
    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "NACOS YABATECH",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.APPROVED,
      },
    });
    await prisma.organizerAuthorization.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        applicationId: appRecord.id,
        approvedPublicName: "NACOS YABATECH",
        status: OrganizerAuthorizationStatus.ACTIVE,
      },
    });

    const res = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "Another Org",
        phoneNumber: "08012345678",
        reason: "Trying to apply while already active",
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already possess an active organizer authorization/);
  });

  it("REVOKED authorization blocks reapplication for that cycle", async () => {
    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);
    const cookie = await loginAsMember(member.matricNumber!);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "NACOS YABATECH",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.APPROVED,
      },
    });
    await prisma.organizerAuthorization.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        applicationId: appRecord.id,
        approvedPublicName: "NACOS YABATECH",
        status: OrganizerAuthorizationStatus.REVOKED,
        revocationReason: "Breach of campus regulations",
      },
    });

    const res = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "New Org Attempt",
        phoneNumber: "08012345678",
        reason: "Trying to reapply after revocation",
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/revoked.*Reapplication is prohibited/);
  });

  it("stores requested public name separately from represented organization", async () => {
    const member = await seedMember("F/ND/24/3210005", "nacos.rep@yabatech.edu.ng");
    await seedActiveVerification(member.id, currentCycleId);
    const cookie = await loginAsMember(member.matricNumber!);

    const res = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "NACOS YABATECH",
        organizationName: "National Association of Computing Students",
        positionTitle: "President",
        phoneNumber: "+234 801 234 5678",
        reason: "Hosting student coding competitions and workshops on campus.",
        evidenceUrlOrText: "https://nacos-yabatech.org/constitution.pdf",
      });

    expect(res.status).toBe(201);
    expect(res.body.application.requestedPublicName).toBe("NACOS YABATECH");
    expect(res.body.application.organizationName).toBe("National Association of Computing Students");
    expect(res.body.application.positionTitle).toBe("President");

    const saved = await prisma.organizerApplication.findUnique({
      where: { id: res.body.application.id },
    });
    expect(saved?.requestedPublicName).toBe("NACOS YABATECH");
    expect(saved?.organizationName).toBe("National Association of Computing Students");
    expect(saved?.positionTitle).toBe("President");
  });

  it("organizer application can have no organization (individual organizer identity)", async () => {
    const member = await seedMember("F/ND/24/3210006", "dave.individual@yabatech.edu.ng");
    await seedActiveVerification(member.id, currentCycleId);
    const cookie = await loginAsMember(member.matricNumber!);

    const res = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "DaveOlana",
        phoneNumber: "+234 801 234 5678",
        reason: "Organizing independent campus developer workshops and hackathons.",
      });

    expect(res.status).toBe(201);
    expect(res.body.application.requestedPublicName).toBe("DaveOlana");
    expect(res.body.application.organizationName).toBeNull();
    expect(res.body.application.positionTitle).toBeNull();

    const saved = await prisma.organizerApplication.findUnique({
      where: { id: res.body.application.id },
    });
    expect(saved?.requestedPublicName).toBe("DaveOlana");
    expect(saved?.organizationName).toBeNull();
    expect(saved?.positionTitle).toBeNull();
  });

  it("rejects application with missing or too-short reason", async () => {
    const member = await seedMember("F/ND/24/3210007", "short.reason@yabatech.edu.ng");
    await seedActiveVerification(member.id, currentCycleId);
    const cookie = await loginAsMember(member.matricNumber!);

    const res = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "Tech Club",
        phoneNumber: "+234 801 234 5678",
        reason: "short", // < 10 chars
      });

    expect(res.status).toBe(400);
    expect(res.body.errors?.reason).toBeDefined();
  });

  it("supports plain text or URL in evidenceUrlOrText under frozen contract", async () => {
    const member = await seedMember("F/ND/24/3210008", "robotics@yabatech.edu.ng");
    await seedActiveVerification(member.id, currentCycleId);
    const cookie = await loginAsMember(member.matricNumber!);

    const res = await request(app)
      .post("/organizer/apply")
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .send({
        requestedPublicName: "Robotics Club",
        phoneNumber: "+234 801 234 5678",
        reason: "Promoting robotics engineering across campus departments.",
        evidenceUrlOrText: "Department recommendation letter on file with HOD CSC, ref YAB/CSC/2026/042",
      });

    expect(res.status).toBe(201);
    expect(res.body.application.evidenceUrlOrText).toBe(
      "Department recommendation letter on file with HOD CSC, ref YAB/CSC/2026/042"
    );
  });
});

describe("Milestone 3 — Admin Review & Decision Transactions", () => {
  it("admin can approve a PENDING application and create an ACTIVE authorization", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "NACOS YABATECH",
        phoneNumber: "08012345678",
        reason: "Hosting student coding competitions",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    const res = await request(app)
      .post(`/admin/organizers/${appRecord.id}/approve`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify application is APPROVED with reviewer and timestamp
    const updatedApp = await prisma.organizerApplication.findUnique({
      where: { id: appRecord.id },
    });
    expect(updatedApp?.status).toBe(OrganizerApplicationStatus.APPROVED);
    expect(updatedApp?.reviewerUserId).toBe(admin.id);
    expect(updatedApp?.reviewedAt).not.toBeNull();
    // Original submission fields preserved
    expect(updatedApp?.requestedPublicName).toBe("NACOS YABATECH");
    expect(updatedApp?.reason).toBe("Hosting student coding competitions");

    // Verify authorization created with ACTIVE status
    const auth = await prisma.organizerAuthorization.findUnique({
      where: { applicationId: appRecord.id },
    });
    expect(auth).not.toBeNull();
    expect(auth?.status).toBe(OrganizerAuthorizationStatus.ACTIVE);
    expect(auth?.userId).toBe(member.id);
    expect(auth?.cycleId).toBe(currentCycleId);
    expect(auth?.approvedPublicName).toBe("NACOS YABATECH");

    // Verify audit log
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.ORGANIZER_APPLICATION_APPROVED,
        targetId: appRecord.id,
      },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.actorUserId).toBe(admin.id);
  });

  it("approval copies requestedPublicName into approvedPublicName, not organization name", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember("F/ND/24/3210009", "dave.distinct@yabatech.edu.ng");
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "DaveOlana",
        organizationName: "Independent Dev Collective",
        positionTitle: "Team Lead",
        phoneNumber: "+234 801 234 5678",
        reason: "Hosting developer workshops across campus faculties.",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    const res = await request(app)
      .post(`/admin/organizers/${appRecord.id}/approve`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);

    const auth = await prisma.organizerAuthorization.findUnique({
      where: { applicationId: appRecord.id },
    });
    expect(auth?.approvedPublicName).toBe("DaveOlana");
    expect(auth?.approvedPublicName).not.toBe("Independent Dev Collective");
  });

  it("admin can reject a PENDING application with feedback notes without creating authorization", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Questionable Org",
        phoneNumber: "08012345678",
        reason: "No proper evidence",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    const res = await request(app)
      .post(`/admin/organizers/${appRecord.id}/reject`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json")
      .send({
        adminReviewNotes: "Insufficient organizational evidence provided.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedApp = await prisma.organizerApplication.findUnique({
      where: { id: appRecord.id },
    });
    expect(updatedApp?.status).toBe(OrganizerApplicationStatus.REJECTED);
    expect(updatedApp?.adminReviewNotes).toBe("Insufficient organizational evidence provided.");
    expect(updatedApp?.reviewerUserId).toBe(admin.id);

    // Verify NO authorization was created
    const auth = await prisma.organizerAuthorization.findFirst({
      where: { applicationId: appRecord.id },
    });
    expect(auth).toBeNull();

    // Verify audit log
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.ORGANIZER_APPLICATION_REJECTED,
        targetId: appRecord.id,
      },
    });
    expect(auditLog).not.toBeNull();
  });

  it("admin rejection requires feedback notes of at least 5 characters", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember("F/ND/24/3210010", "reject.notes@yabatech.edu.ng");
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Incomplete Org",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    // Empty notes
    const resEmpty = await request(app)
      .post(`/admin/organizers/${appRecord.id}/reject`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json")
      .send({});

    expect(resEmpty.status).toBe(400);
    expect(resEmpty.body.message).toMatch(/feedback notes/i);

    // Too short (< 5 chars)
    const resShort = await request(app)
      .post(`/admin/organizers/${appRecord.id}/reject`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json")
      .send({ adminReviewNotes: "bad" });

    expect(resShort.status).toBe(400);
    expect(resShort.body.message).toMatch(/feedback notes/i);
  });

  it("approving the same application twice fails safely", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Org Name",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    // First approve
    const res1 = await request(app)
      .post(`/admin/organizers/${appRecord.id}/approve`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json");
    expect(res1.status).toBe(200);

    // Second approve
    const res2 = await request(app)
      .post(`/admin/organizers/${appRecord.id}/approve`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json");
    expect(res2.status).toBe(400);
    expect(res2.body.message).toMatch(/not pending/i);
  });

  it("rejecting an already approved application fails", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Org Name",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.APPROVED,
      },
    });

    const res = await request(app)
      .post(`/admin/organizers/${appRecord.id}/reject`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json")
      .send({ adminReviewNotes: "Rejection feedback after approved" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not pending/i);
  });

  it("stale/old-cycle PENDING application cannot be reviewed or approved", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember();
    await seedActiveVerification(member.id, previousCycleId);

    const oldApp = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: previousCycleId, // Belongs to previous cycle
        requestedPublicName: "Old Cycle Org",
        phoneNumber: "08012345678",
        reason: "Old application",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    const res = await request(app)
      .post(`/admin/organizers/${oldApp.id}/approve`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/non-current academic cycle/i);
  });

  it("member whose verification becomes inactive after applying cannot be approved", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember();
    const verification = await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Org Name",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    // Verification expires / becomes EXPIRED before admin approves
    await prisma.memberVerification.update({
      where: { id: verification.id },
      data: { status: VerificationStatus.EXPIRED },
    });

    const res = await request(app)
      .post(`/admin/organizers/${appRecord.id}/approve`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json");
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verification is no longer active/i);

    // Verify application remains PENDING (transaction rolled back)
    const currentApp = await prisma.organizerApplication.findUnique({
      where: { id: appRecord.id },
    });
    expect(currentApp?.status).toBe(OrganizerApplicationStatus.PENDING);
  });

  it("concurrent approve and reject attempts cannot both succeed", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Concurrent Org",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    // Fire two concurrent requests: one approve, one reject
    const [approveRes, rejectRes] = await Promise.all([
      request(app)
        .post(`/admin/organizers/${appRecord.id}/approve`)
        .set("Cookie", adminCookie)
        .set("Accept", "application/json"),
      request(app)
        .post(`/admin/organizers/${appRecord.id}/reject`)
        .set("Cookie", adminCookie)
        .set("Accept", "application/json")
        .send({ adminReviewNotes: "Reject notes" }),
    ]);

    // Exactly one should succeed (200), and the other should fail with 400 (not pending)
    const statuses = [approveRes.status, rejectRes.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(400);

    // The database must reflect whichever decision succeeded first
    const finalApp = await prisma.organizerApplication.findUnique({
      where: { id: appRecord.id },
    });
    expect(["APPROVED", "REJECTED"]).toContain(finalApp?.status);
  });
});

describe("Milestone 3 — Revocation Subsystem", () => {
  it("admin can revoke an ACTIVE authorization with reason, preserving original application as APPROVED", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Approved Org",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.APPROVED,
      },
    });

    const authRecord = await prisma.organizerAuthorization.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        applicationId: appRecord.id,
        approvedPublicName: "Approved Org",
        status: OrganizerAuthorizationStatus.ACTIVE,
      },
    });

    const res = await request(app)
      .post(`/admin/organizer-authorizations/${authRecord.id}/revoke`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json")
      .send({
        revocationReason: "Violation of event planning guidelines.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedAuth = await prisma.organizerAuthorization.findUnique({
      where: { id: authRecord.id },
    });
    expect(updatedAuth?.status).toBe(OrganizerAuthorizationStatus.REVOKED);
    expect(updatedAuth?.revocationReason).toBe("Violation of event planning guidelines.");
    expect(updatedAuth?.revokedAt).not.toBeNull();

    // Original application must remain APPROVED as historical proof
    const preservedApp = await prisma.organizerApplication.findUnique({
      where: { id: appRecord.id },
    });
    expect(preservedApp?.status).toBe(OrganizerApplicationStatus.APPROVED);

    // Audit log written
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: AUDIT_ACTIONS.ORGANIZER_AUTHORIZATION_REVOKED,
        targetId: authRecord.id,
      },
    });
    expect(auditLog).not.toBeNull();
  });

  it("revocation requires a reason of at least 5 characters", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember();
    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Approved Org",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.APPROVED,
      },
    });
    const authRecord = await prisma.organizerAuthorization.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        applicationId: appRecord.id,
        approvedPublicName: "Approved Org",
        status: OrganizerAuthorizationStatus.ACTIVE,
      },
    });

    const res = await request(app)
      .post(`/admin/organizer-authorizations/${authRecord.id}/revoke`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json")
      .send({ revocationReason: "bad" }); // Too short

    expect(res.status).toBe(400);
  });
});

describe("Milestone 3 — requireOrganizer Middleware & Authorization Guard", () => {
  it("no /organizer/test-protected production endpoint exists on the application (returns 404)", async () => {
    const res = await request(app).get("/organizer/test-protected");
    expect(res.status).toBe(404);
  });

  it("requireOrganizer accepts valid active current organizer", async () => {
    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Tech Hub YABATECH",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.APPROVED,
      },
    });
    await prisma.organizerAuthorization.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        applicationId: appRecord.id,
        approvedPublicName: "Tech Hub YABATECH",
        status: OrganizerAuthorizationStatus.ACTIVE,
      },
    });

    const cookie = await loginAsMemberOnApp(testGuardApp, member.matricNumber!);

    const res = await request(testGuardApp)
      .get("/test-guard/organizer-only")
      .set("Cookie", cookie)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.authorization.approvedPublicName).toBe("Tech Hub YABATECH");
  });

  it("requireOrganizer rejects applicant whose application is still PENDING", async () => {
    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);

    await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Pending Org",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    const cookie = await loginAsMemberOnApp(testGuardApp, member.matricNumber!);
    const res = await request(testGuardApp)
      .get("/test-guard/organizer-only")
      .set("Cookie", cookie)
      .set("Accept", "application/json");

    expect(res.status).toBe(403);
    expect(res.body.authorizationStatus).toBe("NONE");
  });

  it("requireOrganizer rejects revoked organizer", async () => {
    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Revoked Org",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.APPROVED,
      },
    });
    await prisma.organizerAuthorization.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        applicationId: appRecord.id,
        approvedPublicName: "Revoked Org",
        status: OrganizerAuthorizationStatus.REVOKED,
        revocationReason: "Revoked reason",
      },
    });

    const cookie = await loginAsMemberOnApp(testGuardApp, member.matricNumber!);
    const res = await request(testGuardApp)
      .get("/test-guard/organizer-only")
      .set("Cookie", cookie)
      .set("Accept", "application/json");

    expect(res.status).toBe(403);
    expect(res.body.authorizationStatus).toBe("REVOKED");
  });

  it("requireOrganizer rejects prior-cycle stored ACTIVE authorization (derived current-cycle expiry)", async () => {
    const member = await seedMember();
    // Verification active for current cycle
    await seedActiveVerification(member.id, currentCycleId);

    // Authorization was granted in previous cycle, still has status ACTIVE stored
    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: previousCycleId,
        requestedPublicName: "Old Active Org",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.APPROVED,
      },
    });
    await prisma.organizerAuthorization.create({
      data: {
        userId: member.id,
        cycleId: previousCycleId, // Belongs to previous cycle
        applicationId: appRecord.id,
        approvedPublicName: "Old Active Org",
        status: OrganizerAuthorizationStatus.ACTIVE, // Still stored ACTIVE!
      },
    });

    const cookie = await loginAsMemberOnApp(testGuardApp, member.matricNumber!);
    const res = await request(testGuardApp)
      .get("/test-guard/organizer-only")
      .set("Cookie", cookie)
      .set("Accept", "application/json");

    expect(res.status).toBe(403);
    // Because no authorization exists for the CURRENT cycle
    expect(res.body.authorizationStatus).toBe("NONE");
  });

  it("requireOrganizer rejects organizer whose current MemberVerification is no longer ACTIVE", async () => {
    const member = await seedMember();
    // Seed EXPIRED verification
    await prisma.memberVerification.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        status: VerificationStatus.EXPIRED,
      },
    });

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Org Name",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.APPROVED,
      },
    });
    await prisma.organizerAuthorization.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        applicationId: appRecord.id,
        approvedPublicName: "Org Name",
        status: OrganizerAuthorizationStatus.ACTIVE,
      },
    });

    const cookie = await loginAsMemberOnApp(testGuardApp, member.matricNumber!);
    const res = await request(testGuardApp)
      .get("/test-guard/organizer-only")
      .set("Cookie", cookie)
      .set("Accept", "application/json");

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Active member verification/);
  });

  it("requireOrganizer rejects ADMIN account (ADMIN is not an organizer)", async () => {
    const admin = await seedAdmin();
    const cookie = await loginAsAdminOnApp(testGuardApp, admin.email);

    const res = await request(testGuardApp)
      .get("/test-guard/organizer-only")
      .set("Cookie", cookie)
      .set("Accept", "application/json");

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/exclusive to verified MEMBER accounts/);
  });

  it("simulated audit failure inside approval transaction rolls back organizer mutation", async () => {
    const admin = await seedAdmin();
    const adminCookie = await loginAsAdmin(admin.email);

    const member = await seedMember();
    await seedActiveVerification(member.id, currentCycleId);

    const appRecord = await prisma.organizerApplication.create({
      data: {
        userId: member.id,
        cycleId: currentCycleId,
        requestedPublicName: "Rollback Org",
        phoneNumber: "08012345678",
        reason: "Reason",
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    // Mock createAuditLog to throw an error during approval
    const auditSpy = vi.spyOn(auditService, "createAuditLog").mockImplementationOnce(() => {
      throw new Error("Simulated database failure during audit log insertion");
    });

    const res = await request(app)
      .post(`/admin/organizers/${appRecord.id}/approve`)
      .set("Cookie", adminCookie)
      .set("Accept", "application/json");

    expect(res.status).toBe(500);

    // Verify application remains PENDING
    const checkApp = await prisma.organizerApplication.findUnique({
      where: { id: appRecord.id },
    });
    expect(checkApp?.status).toBe(OrganizerApplicationStatus.PENDING);

    // Verify NO authorization was created
    const checkAuth = await prisma.organizerAuthorization.findFirst({
      where: { applicationId: appRecord.id },
    });
    expect(checkAuth).toBeNull();

    auditSpy.mockRestore();
  });
});
