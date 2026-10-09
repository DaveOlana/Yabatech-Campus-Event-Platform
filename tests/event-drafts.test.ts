import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "./helpers/http.js";
import bcrypt from "bcrypt";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, LevelCode, UserRole, VerificationStatus, OrganizerAuthorizationStatus, EventStatus } from "@prisma/client";
import dotenv from "dotenv";
import { createApp } from "../src/app.js";
import { ensureSessionTable } from "../src/session.js";
import { cancelPublishedEventAsManagement, cancelPublishedEventAsOrganizer } from "../src/services/event.service.js";

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
      ? { fullName: "Management", email: `admin${serial}@yabatech.edu.ng`, managementUsername: `Management ${serial}`, managementUsernameNormalized: `management ${serial}`, passwordHash: await bcrypt.hash("SecureAdminPassword!", 4), role: UserRole.ADMIN }
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
    await adminAgent.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    await adminAgent.get("/organizer/events").expect(403);
  });

  it("allows an active organizer to access list and create pages", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    await agent.get("/organizer/events").expect(200);
    const page = await agent.get("/organizer/events/new").expect(200);
    expect(page.text).toContain("Recommended audience");
    expect(page.text).toContain("Department not listed?");
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

  it("requires a complete, valid department suggestion pair", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    const missingCode = await agent.post("/organizer/events").type("form").send(payload({ suggestedDepartmentName: "Marine Engineering" }));
    expect(missingCode.status).toBe(400);
    expect(missingCode.text).toContain("Enter both the new department name and short code");
    await agent.post("/organizer/events").type("form").send(payload({ suggestedDepartmentName: "Marine Engineering", suggestedDepartmentCode: "MRE!" })).expect(400);
    expect(await prisma.event.count()).toBe(0);
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

  it("accepts HTTPS posters and rejects insecure or unsafe schemes", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    await agent.post("/organizer/events").type("form").send(payload({ posterUrl: "http://example.com/a.jpg" })).expect(400);
    const response = await agent.post("/organizer/events").type("form").send(payload({ title: "Unsafe Poster", posterUrl: "javascript:alert(1)" }));
    expect(response.status).toBe(400);
    expect(response.text).toContain("Poster URL must use https");
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

  it("lets its owner view but not edit a non-draft", async () => {
    const { user, authorization } = await setupOrganizer();
    const event = await prisma.event.create({ data: { title: "Published Event", description: "A published event cannot use draft routes.", categoryId, posterUrl: null, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "14:00", venue: "Multipurpose Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PUBLISHED } });
    const agent = await login(user.matricNumber!);
    await agent.get(`/organizer/events/${event.id}`).expect(200);
    await agent.get(`/organizer/events/${event.id}/edit`).expect(404);
    await agent.post(`/organizer/events/${event.id}`).type("form").send(payload({ title: "Changed" })).expect(409);
  });

  it("submits an owned draft once and records the transition audit", async () => {
    const { user, authorization } = await setupOrganizer();
    const event = await prisma.event.create({ data: { title: "Review Me", description: "A complete proposal ready for management review.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName } });
    const agent = await login(user.matricNumber!);
    await agent.post(`/organizer/events/${event.id}/submit`).set("Accept", "application/json").expect(200);
    const submitted = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(submitted.status).toBe(EventStatus.PENDING_APPROVAL);
    expect(submitted.submittedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { targetId: event.id, action: "EVENT_SUBMITTED" } })).toBe(1);
    await agent.post(`/organizer/events/${event.id}/submit`).set("Accept", "application/json").expect(409);
  });

  it("allows management to approve a pending event and audits the reviewer", async () => {
    const { authorization } = await setupOrganizer();
    const admin = await createMember({ admin: true });
    const event = await prisma.event.create({ data: { title: "Pending Approval", description: "A complete proposal awaiting a management decision.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PENDING_APPROVAL, submittedAt: new Date() } });
    const agent = request.agent(app);
    await agent.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    await agent.get("/admin/events").expect(200);
    await agent.post(`/admin/events/${event.id}/approve`).set("Accept", "application/json").expect(200);
    const approved = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(approved.status).toBe(EventStatus.PUBLISHED);
    expect(approved.reviewerUserId).toBe(admin.id);
    expect(approved.reviewedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { targetId: event.id, action: "EVENT_APPROVED" } })).toBe(1);
  });

  it("keeps a suggested department private until Management approves the event", async () => {
    const { user } = await setupOrganizer();
    const organizer = await login(user.matricNumber!);
    await organizer.post("/organizer/events").type("form").send(payload({
      title: "Marine Innovation Day",
      targetDepartmentIds: [],
      suggestedDepartmentName: "Marine Engineering",
      suggestedDepartmentCode: "mre",
    })).expect(302);
    const draft = await prisma.event.findFirstOrThrow({ where: { title: "Marine Innovation Day" } });
    expect(draft.suggestedDepartmentCode).toBe("MRE");
    expect(await prisma.department.findUnique({ where: { code: "MRE" } })).toBeNull();

    await organizer.post(`/organizer/events/${draft.id}/submit`).expect(302);
    expect(await prisma.department.findUnique({ where: { code: "MRE" } })).toBeNull();

    const admin = await createMember({ admin: true });
    const management = request.agent(app);
    await management.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    const review = await management.get(`/admin/events/${draft.id}`).expect(200);
    expect(review.text).toContain("Marine Engineering");
    await management.post(`/admin/events/${draft.id}/approve`).expect(302);

    const approvedDepartment = await prisma.department.findUniqueOrThrow({ where: { code: "MRE" } });
    expect(approvedDepartment.name).toBe("Marine Engineering");
    expect(await prisma.eventTargetDepartment.count({ where: { eventId: draft.id, departmentId: approvedDepartment.id } })).toBe(1);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(EventStatus.PUBLISHED);
  });

  it("blocks approval after organizer revocation but permits a reasoned rejection", async () => {
    const { authorization } = await setupOrganizer();
    const admin = await createMember({ admin: true });
    const event = await prisma.event.create({ data: { title: "Trust Changed", description: "A pending proposal whose organizer trust later changed.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PENDING_APPROVAL, submittedAt: new Date() } });
    await prisma.organizerAuthorization.update({ where: { id: authorization.id }, data: { status: OrganizerAuthorizationStatus.REVOKED, revokedAt: new Date(), revocationReason: "Trust withdrawn" } });
    const agent = request.agent(app);
    await agent.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    await agent.post(`/admin/events/${event.id}/approve`).set("Accept", "application/json").expect(409);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(EventStatus.PENDING_APPROVAL);
    await agent.post(`/admin/events/${event.id}/reject`).set("Accept", "application/json").send({ rejectionReason: "The organizer authorization is no longer active." }).expect(200);
    const rejected = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(rejected.status).toBe(EventStatus.REJECTED);
    expect(rejected.rejectionReason).toContain("no longer active");
    expect(await prisma.auditLog.count({ where: { targetId: event.id, action: "EVENT_REJECTED" } })).toBe(1);
  });

  it("protects management review routes and validates rejection feedback", async () => {
    const { authorization } = await setupOrganizer();
    const event = await prisma.event.create({ data: { title: "Protected Review", description: "A proposal used to verify protected management decisions.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PENDING_APPROVAL, submittedAt: new Date() } });
    await request(app).get("/admin/events").set("Accept", "application/json").expect(401);
    const admin = await createMember({ admin: true });
    const agent = request.agent(app);
    await agent.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    await agent.post(`/admin/events/${event.id}/reject`).set("Accept", "application/json").send({ rejectionReason: "no" }).expect(400);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(EventStatus.PENDING_APPROVAL);
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

  it("organizes lifecycle history with derived past state without mutating status", async () => {
    const { user, authorization } = await setupOrganizer();
    const past = await prisma.event.create({ data: { title: "Past Published Event", description: "A historical published campus event.", categoryId, eventDate: new Date("2026-09-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PUBLISHED } });
    await prisma.event.create({ data: { title: "Current Draft Event", description: "A current editable draft event.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName } });
    const agent = await login(user.matricNumber!);
    const history = await agent.get("/organizer/events?view=history").expect(200);
    expect(history.text).toContain("Past Published Event"); expect(history.text).toContain("Past event"); expect(history.text).not.toContain("Current Draft Event");
    const drafts = await agent.get("/organizer/events?view=drafts").expect(200);
    expect(drafts.text).toContain("Current Draft Event"); expect(drafts.text).not.toContain("Past Published Event");
    expect((await prisma.event.findUniqueOrThrow({ where: { id: past.id } })).status).toBe(EventStatus.PUBLISHED);
  });

  it("lets the active owner cancel a published event atomically and preserves public history", async () => {
    const { user, authorization } = await setupOrganizer();
    const event = await prisma.event.create({ data: { title: "Organizer Cancellation", description: "A published event that can no longer proceed.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PUBLISHED } });
    const agent = await login(user.matricNumber!);
    await agent.post(`/organizer/events/${event.id}/cancel`).type("form").send({ cancellationReason: "The campus venue is unexpectedly unavailable." }).expect(302);
    const cancelled = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(cancelled.status).toBe(EventStatus.CANCELLED); expect(cancelled.cancelledAt).not.toBeNull(); expect(cancelled.cancelledByUserId).toBe(user.id);
    expect(cancelled.cancellationReason).toContain("venue");
    expect(await prisma.auditLog.count({ where: { targetId: event.id, action: "EVENT_CANCELLED" } })).toBe(1);
    expect((await request(app).get("/").expect(200)).text).not.toContain("Organizer Cancellation");
    const publicDetail = await request(app).get(`/events/${event.id}`).expect(200);
    expect(publicDetail.text).toContain("This event has been cancelled."); expect(publicDetail.text).toContain("campus venue");
    await agent.post(`/organizer/events/${event.id}/cancel`).set("Accept", "application/json").send({ cancellationReason: "Trying to cancel this event a second time." }).expect(409);
  });

  it("rejects invalid, unauthorized, and trust-lapsed organizer cancellation", async () => {
    const owner = await setupOrganizer("Owner");
    const event = await prisma.event.create({ data: { title: "Protected Cancellation", description: "A published event protected by ownership checks.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: owner.authorization.id, organizerPublicName: owner.authorization.approvedPublicName, status: EventStatus.PUBLISHED } });
    const ownerAgent = await login(owner.user.matricNumber!);
    await ownerAgent.post(`/organizer/events/${event.id}/cancel`).set("Accept", "application/json").send({ cancellationReason: "short" }).expect(400);
    const other = await setupOrganizer("Other");
    await (await login(other.user.matricNumber!)).post(`/organizer/events/${event.id}/cancel`).set("Accept", "application/json").send({ cancellationReason: "Another organizer cannot cancel this event." }).expect(404);
    await prisma.organizerAuthorization.update({ where: { id: owner.authorization.id }, data: { status: OrganizerAuthorizationStatus.REVOKED, revokedAt: new Date(), revocationReason: "Authority withdrawn" } });
    await ownerAgent.post(`/organizer/events/${event.id}/cancel`).set("Accept", "application/json").send({ cancellationReason: "The owner should now be blocked from cancelling." }).expect(403);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(EventStatus.PUBLISHED);
  });

  it("keeps the Management queue focused and supports protected withdrawal history", async () => {
    const { authorization } = await setupOrganizer();
    const admin = await createMember({ admin: true });
    const published = await prisma.event.create({ data: { title: "Management Withdrawal", description: "A published event requiring emergency withdrawal.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PUBLISHED, reviewedAt: new Date(), reviewerUserId: admin.id } });
    const pending = await prisma.event.create({ data: { title: "Still Pending", description: "A separate event awaiting review.", categoryId, eventDate: new Date("2026-11-21"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PENDING_APPROVAL, submittedAt: new Date() } });
    await request(app).get("/admin/events/history").expect(302);
    const agent = request.agent(app);
    await agent.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    const queue = await agent.get("/admin/events").expect(200);
    expect(queue.text).toContain(pending.title); expect(queue.text).not.toContain(published.title);
    const history = await agent.get("/admin/events/history?status=published").expect(200);
    expect(history.text).toContain(published.title); expect(history.text).not.toContain(pending.title);
    await prisma.organizerAuthorization.update({ where: { id: authorization.id }, data: { status: OrganizerAuthorizationStatus.REVOKED, revokedAt: new Date(), revocationReason: "Trust withdrawn" } });
    await agent.post(`/admin/events/${published.id}/cancel`).type("form").send({ cancellationReason: "Management has withdrawn institutional approval." }).expect(302);
    const cancelled = await prisma.event.findUniqueOrThrow({ where: { id: published.id } });
    expect(cancelled.status).toBe(EventStatus.CANCELLED); expect(cancelled.cancelledByUserId).toBe(admin.id);
    expect((await agent.get("/admin/events/history?status=cancelled").expect(200)).text).toContain(published.title);
  });

  it("serializes concurrent organizer and Management cancellation attempts", async () => {
    const { authorization } = await setupOrganizer();
    const admin = await createMember({ admin: true });
    const event = await prisma.event.create({ data: { title: "Cancellation Race", description: "Only one cancellation decision may commit.", categoryId, eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PUBLISHED } });
    const results = await Promise.allSettled([
      cancelPublishedEventAsOrganizer(event.id, authorization.id, "The organizer cancelled because plans changed."),
      cancelPublishedEventAsManagement(admin.id, event.id, "Management withdrew approval for safety reasons."),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(EventStatus.CANCELLED);
    expect(await prisma.auditLog.count({ where: { targetId: event.id, action: "EVENT_CANCELLED" } })).toBe(1);
  });
});
