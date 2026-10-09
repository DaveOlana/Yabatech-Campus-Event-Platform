import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, LevelCode, UserRole, VerificationStatus, OrganizerAuthorizationStatus, EventStatus } from "@prisma/client";
import dotenv from "dotenv";
import { createApp } from "../src/app.js";
import { ensureSessionTable } from "../src/session.js";

dotenv.config();
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL environment variable is required for tests");

let pool: pg.Pool;
let prisma: PrismaClient;
const app = createApp();
let departmentId: string;
let secondDepartmentId: string;
let levelId: string;
let secondLevelId: string;
let cycleId: string;
let categoryId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  await ensureSessionTable(pool);
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
  await prisma.organizerAuthorization.deleteMany();
  await prisma.organizerApplication.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.memberVerification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.eventCategory.deleteMany();
  await prisma.academicYearCycle.deleteMany();
  await prisma.department.deleteMany();
  await prisma.level.deleteMany();

  const department = await prisma.department.create({ data: { name: "Computer Science", code: "CSC" } });
  const secondDepartment = await prisma.department.create({ data: { name: "Electrical Engineering", code: "EEE" } });
  const level = await prisma.level.create({ data: { code: LevelCode.ND2, label: "ND Year 2" } });
  const secondLevel = await prisma.level.create({ data: { code: LevelCode.HND1, label: "HND Year 1" } });
  const cycle = await prisma.academicYearCycle.create({ data: { name: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-08-31"), isCurrent: true } });
  const category = await prisma.eventCategory.create({ data: { name: "Technology", code: "TECH" } });
  departmentId = department.id;
  secondDepartmentId = secondDepartment.id;
  levelId = level.id;
  secondLevelId = secondLevel.id;
  cycleId = cycle.id;
  categoryId = category.id;
});

let serial = 1000000;
async function createMember(options: { admin?: boolean; verified?: boolean } = {}) {
  serial += 1;
  const admin = options.admin ?? false;
  const user = await prisma.user.create({
    data: admin
      ? { fullName: "Management", email: `admin${serial}@yabatech.edu.ng`, passwordHash: await bcrypt.hash("SecureAdminPassword!", 4), role: UserRole.ADMIN }
      : { fullName: "Test Organizer", email: `member${serial}@student.yabatech.edu.ng`, matricNumber: `F/ND/26/${serial}`, departmentId, levelId, passwordHash: await bcrypt.hash("password123", 4), role: UserRole.MEMBER },
  });
  if (!admin && options.verified !== false) {
    await prisma.memberVerification.create({ data: { userId: user.id, cycleId, status: VerificationStatus.ACTIVE } });
  }
  return user;
}

async function setupOrganizer(publicName = "NACOS YABATECH") {
  const user = await createMember();
  const application = await prisma.organizerApplication.create({
    data: { userId: user.id, cycleId, requestedPublicName: publicName, phoneNumber: "08012345678", reason: "Organize trusted campus events", status: "APPROVED" },
  });
  const authorization = await prisma.organizerAuthorization.create({
    data: { userId: user.id, cycleId, applicationId: application.id, approvedPublicName: publicName, status: OrganizerAuthorizationStatus.ACTIVE },
  });
  return { user, authorization };
}

async function login(matricNumber: string, password = "password123") {
  const agent = request.agent(app);
  await agent.post("/login").type("form").send({ matricNumber, password }).expect(302);
  return agent;
}

const payload = (overrides: Record<string, unknown> = {}) => ({
  title: "Campus Technology Summit",
  description: "A practical campus technology event for YABATECH students.",
  categoryId,
  posterUrl: "https://example.com/poster.jpg",
  eventDate: "2026-11-20",
  startTime: "10:00",
  endTime: "14:00",
  venue: "Multipurpose Hall",
  targetDepartmentIds: [departmentId],
  targetLevelIds: [levelId],
  ...overrides,
});

describe("simplified Layer 1 event drafts", () => {
  it("enforces authentication and organizer authorization", async () => {
    await request(app).get("/organizer/events").expect(302).expect("Location", "/login");
    await request(app).get("/organizer/events").set("Accept", "application/json").expect(401);
    const member = await createMember();
    const memberAgent = await login(member.matricNumber!);
    await memberAgent.get("/organizer/events").expect(403);
  });

  it("rejects revoked organizers and ADMIN accounts", async () => {
    const { user, authorization } = await setupOrganizer();
    await prisma.organizerAuthorization.update({ where: { id: authorization.id }, data: { status: OrganizerAuthorizationStatus.REVOKED, revokedAt: new Date(), revocationReason: "Authority withdrawn" } });
    await (await login(user.matricNumber!)).get("/organizer/events").expect(403);
    const admin = await createMember({ admin: true });
    const adminAgent = request.agent(app);
    await adminAgent.post("/admin/login").type("form").send({ email: admin.email, password: "SecureAdminPassword!" }).expect(302);
    await adminAgent.get("/organizer/events").expect(403);
  });

  it("allows an active organizer to access list and create pages", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    await agent.get("/organizer/events").expect(200);
    const page = await agent.get("/organizer/events/new").expect(200);
    expect(page.text).toContain("Recommended Audience");
    expect(page.text).not.toContain("Registration Limit");
    expect(page.text).not.toContain("Application Questions");
  });

  it("creates a DRAFT bound to the authorization with server-derived identity", async () => {
    const { user, authorization } = await setupOrganizer("YCT Tech Club");
    const agent = await login(user.matricNumber!);
    await agent.post("/organizer/events").type("form").send(payload()).expect(302);
    const event = await prisma.event.findFirstOrThrow({ where: { title: "Campus Technology Summit" }, include: { targetDepartments: true, targetLevels: true } });
    expect(event.primaryOrganizerAuthorizationId).toBe(authorization.id);
    expect(event.organizerPublicName).toBe("YCT Tech Club");
    expect(event.status).toBe(EventStatus.DRAFT);
    expect(event.targetDepartments).toHaveLength(1);
    expect(event.targetLevels).toHaveLength(1);
  });

  it("strips spoofed identity, status, and legacy participation properties", async () => {
    const { user, authorization } = await setupOrganizer("Trusted Name");
    const agent = await login(user.matricNumber!);
    await agent.post("/organizer/events").type("form").send(payload({
      primaryOrganizerAuthorizationId: "00000000-0000-0000-0000-000000000000",
      organizerPublicName: "Spoofed Name",
      status: "PUBLISHED",
      participationMode: "APPROVAL_REQUIRED",
      registrationDeadline: "2026-11-01T10:00",
      registrationLimit: "10",
      eligibilityInstructions: "Private audience only",
      eligibleDepartmentIds: [secondDepartmentId],
      eligibleLevelIds: [secondLevelId],
      questions: ["Legacy question"],
    })).expect(302);
    const event = await prisma.event.findFirstOrThrow({ where: { title: "Campus Technology Summit" } });
    expect(event.primaryOrganizerAuthorizationId).toBe(authorization.id);
    expect(event.organizerPublicName).toBe("Trusted Name");
    expect(event.status).toBe(EventStatus.DRAFT);
    for (const key of ["participationMode", "registrationDeadline", "registrationLimit", "eligibilityInstructions", "eligibleDepartments", "eligibleLevels", "questions"]) {
      expect(key in event).toBe(false);
    }
  });

  it("supports empty targeting and deduplicates repeated target IDs", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    await agent.post("/organizer/events").type("form").send(payload({ title: "No Targets", targetDepartmentIds: undefined, targetLevelIds: undefined })).expect(302);
    await agent.post("/organizer/events").type("form").send(payload({ title: "Deduplicated Targets", targetDepartmentIds: [departmentId, departmentId], targetLevelIds: [levelId, levelId] })).expect(302);
    const none = await prisma.event.findFirstOrThrow({ where: { title: "No Targets" }, include: { targetDepartments: true, targetLevels: true } });
    const deduped = await prisma.event.findFirstOrThrow({ where: { title: "Deduplicated Targets" }, include: { targetDepartments: true, targetLevels: true } });
    expect(none.targetDepartments).toHaveLength(0);
    expect(none.targetLevels).toHaveLength(0);
    expect(deduped.targetDepartments).toHaveLength(1);
    expect(deduped.targetLevels).toHaveLength(1);
  });

  it("rejects invalid title and description", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    expect((await agent.post("/organizer/events").type("form").send(payload({ title: "A" }))).status).toBe(400);
    expect((await agent.post("/organizer/events").type("form").send(payload({ description: "short" }))).status).toBe(400);
  });

  it("rejects impossible dates and invalid time order", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    const dateResponse = await agent.post("/organizer/events").type("form").send(payload({ eventDate: "2026-02-31" }));
    expect(dateResponse.status).toBe(400);
    expect(dateResponse.text).toContain("valid calendar date");
    const timeResponse = await agent.post("/organizer/events").type("form").send(payload({ startTime: "14:00", endTime: "13:00" }));
    expect(timeResponse.status).toBe(400);
    expect(timeResponse.text).toContain("End time must be after start time");
  });

  it("accepts HTTP/HTTPS posters and rejects unsafe schemes", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    await agent.post("/organizer/events").type("form").send(payload({ posterUrl: "http://example.com/a.jpg" })).expect(302);
    const response = await agent.post("/organizer/events").type("form").send(payload({ title: "Unsafe Poster", posterUrl: "javascript:alert(1)" }));
    expect(response.status).toBe(400);
    expect(response.text).toContain("Poster URL must use http or https");
  });

  it("rejects missing categories and nonexistent target references transactionally", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    await agent.post("/organizer/events").type("form").send(payload({ categoryId: "00000000-0000-0000-0000-000000000000" })).expect(400);
    await agent.post("/organizer/events").type("form").send(payload({ targetDepartmentIds: ["00000000-0000-0000-0000-000000000000"] })).expect(400);
    await agent.post("/organizer/events").type("form").send(payload({ targetLevelIds: ["00000000-0000-0000-0000-000000000000"] })).expect(400);
    expect(await prisma.event.count()).toBe(0);
  });

  it("allows its owner to view and update a draft while preserving server fields", async () => {
    const { user, authorization } = await setupOrganizer("Original Organizer");
    const agent = await login(user.matricNumber!);
    await agent.post("/organizer/events").type("form").send(payload()).expect(302);
    const event = await prisma.event.findFirstOrThrow({ where: { primaryOrganizerAuthorizationId: authorization.id } });
    await agent.get(`/organizer/events/${event.id}`).expect(200);
    await agent.get(`/organizer/events/${event.id}/edit`).expect(200);
    await agent.post(`/organizer/events/${event.id}`).type("form").send(payload({ title: "Updated Campus Summit", status: "PUBLISHED", organizerPublicName: "Spoof" })).expect(302);
    const updated = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.title).toBe("Updated Campus Summit");
    expect(updated.status).toBe(EventStatus.DRAFT);
    expect(updated.organizerPublicName).toBe("Original Organizer");
  });

  it("returns 404 to another organizer", async () => {
    const first = await setupOrganizer("First");
    const firstAgent = await login(first.user.matricNumber!);
    await firstAgent.post("/organizer/events").type("form").send(payload()).expect(302);
    const event = await prisma.event.findFirstOrThrow({ where: { primaryOrganizerAuthorizationId: first.authorization.id } });
    const second = await setupOrganizer("Second");
    const secondAgent = await login(second.user.matricNumber!);
    await secondAgent.get(`/organizer/events/${event.id}`).expect(404);
    await secondAgent.get(`/organizer/events/${event.id}/edit`).expect(404);
    await secondAgent.post(`/organizer/events/${event.id}`).type("form").send(payload({ title: "Hijacked" })).expect(404);
  });

  it("does not expose or edit a non-draft through draft routes", async () => {
    const { user, authorization } = await setupOrganizer();
    const event = await prisma.event.create({ data: { title: "Published Event", description: "A published event cannot use draft routes.", categoryId, posterUrl: null, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "14:00", venue: "Multipurpose Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PUBLISHED } });
    const agent = await login(user.matricNumber!);
    await agent.get(`/organizer/events/${event.id}`).expect(404);
    await agent.get(`/organizer/events/${event.id}/edit`).expect(404);
    await agent.post(`/organizer/events/${event.id}`).type("form").send(payload({ title: "Changed" })).expect(400);
  });

  it("isolates drafts across organizer authorization cycles", async () => {
    const { user, authorization } = await setupOrganizer();
    const event = await prisma.event.create({ data: { title: "Old Cycle Draft", description: "A historical draft event.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName } });
    await prisma.academicYearCycle.update({ where: { id: cycleId }, data: { isCurrent: false } });
    const nextCycle = await prisma.academicYearCycle.create({ data: { name: "2027/2028", startDate: new Date("2027-09-01"), endDate: new Date("2028-08-31"), isCurrent: true } });
    await prisma.memberVerification.create({ data: { userId: user.id, cycleId: nextCycle.id, status: VerificationStatus.ACTIVE } });
    const nextApplication = await prisma.organizerApplication.create({ data: { userId: user.id, cycleId: nextCycle.id, requestedPublicName: "Next Cycle", phoneNumber: "08012345678", reason: "Continue organizing campus events", status: "APPROVED" } });
    await prisma.organizerAuthorization.create({ data: { userId: user.id, cycleId: nextCycle.id, applicationId: nextApplication.id, approvedPublicName: "Next Cycle", status: OrganizerAuthorizationStatus.ACTIVE } });
    const agent = await login(user.matricNumber!);
    await agent.get(`/organizer/events/${event.id}`).expect(404);
    await agent.get(`/organizer/events/${event.id}/edit`).expect(404);
  });

  it("keeps drafts absent from public pages", async () => {
    const { authorization } = await setupOrganizer();
    const event = await prisma.event.create({ data: { title: "Hidden Draft", description: "This draft must remain private.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName } });
    const home = await request(app).get("/").expect(200);
    expect(home.text).not.toContain("Hidden Draft");
    await request(app).get(`/events/${event.id}`).expect(404);
  });
});
