import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "./helpers/http.js";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { EventStatus, LevelCode, OrganizerAuthorizationStatus, PrismaClient, UserRole } from "@prisma/client";
import { createApp } from "../src/app.js";
import { formatEventTimeRange, getLagosTodayDate, getPublicDateRange } from "../src/utils/event-display.js";
import { PRODUCTION_DEPARTMENTS, syncProductionDepartments } from "../scripts/seed-production-reference.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL environment variable is required for tests");
const app = createApp();
let pool: pg.Pool;
let prisma: PrismaClient;
let categoryId: string, secondCategoryId: string, authorizationId: string, organizerUserId: string, departmentId: string, secondDepartmentId: string, levelId: string, secondLevelId: string;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: databaseUrl });
  prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
});
afterAll(async () => { await prisma.$disconnect(); await pool.end(); });

beforeEach(async () => {
  await pool.query('DELETE FROM "session"');
  await prisma.eventTargetDepartment.deleteMany(); await prisma.eventTargetLevel.deleteMany();
  await prisma.event.deleteMany(); await prisma.organizerAuthorization.deleteMany();
  await prisma.organizerApplication.deleteMany(); await prisma.auditLog.deleteMany();
  await prisma.memberVerification.deleteMany(); await prisma.user.deleteMany();
  await prisma.eventCategory.deleteMany(); await prisma.academicYearCycle.deleteMany();
  await prisma.department.deleteMany(); await prisma.level.deleteMany();
  const department = await prisma.department.create({ data: { name: "Computer Science", code: "CSC" } });
  const secondDepartment = await prisma.department.create({ data: { name: "Electrical Engineering", code: "EEE" } });
  const level = await prisma.level.create({ data: { code: LevelCode.ND1, label: "ND Year 1" } });
  const secondLevel = await prisma.level.create({ data: { code: LevelCode.ND2, label: "ND Year 2" } });
  const category = await prisma.eventCategory.create({ data: { name: "Technology", code: "TECH" } });
  const secondCategory = await prisma.eventCategory.create({ data: { name: "Career", code: "CAREER" } });
  const cycle = await prisma.academicYearCycle.create({ data: { name: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-08-31"), isCurrent: true } });
  const user = await prisma.user.create({ data: { fullName: "Private Owner", email: "owner@example.test", matricNumber: "F/ND/26/9999999", passwordHash: "private-hash", role: UserRole.MEMBER, departmentId: department.id, levelId: level.id } });
  const application = await prisma.organizerApplication.create({ data: { userId: user.id, cycleId: cycle.id, requestedPublicName: "YCT Builders", phoneNumber: "08000000000", reason: "Campus events", status: "APPROVED" } });
  const authorization = await prisma.organizerAuthorization.create({ data: { userId: user.id, cycleId: cycle.id, applicationId: application.id, approvedPublicName: "YCT Builders", status: OrganizerAuthorizationStatus.ACTIVE } });
  categoryId = category.id; secondCategoryId = secondCategory.id; authorizationId = authorization.id; organizerUserId = user.id;
  departmentId = department.id; secondDepartmentId = secondDepartment.id; levelId = level.id; secondLevelId = secondLevel.id;
});

async function createEvent(title: string, status: EventStatus, eventDate: Date, overrides: Record<string, unknown> = {}) {
  const cancellation = status === EventStatus.CANCELLED ? { cancelledAt: new Date(), cancellationReason: "This event was cancelled for testing.", cancelledByUserId: organizerUserId } : {};
  return prisma.event.create({ data: { title, description: `Public description for ${title}`, categoryId, eventDate, startTime: "10:00", endTime: "13:00", venue: "Multipurpose Hall", primaryOrganizerAuthorizationId: authorizationId, organizerPublicName: "YCT Builders", status, ...cancellation, ...overrides } });
}

describe("public event discovery", () => {
  it("shows only upcoming PUBLISHED events and their approved public fields", async () => {
    const today = getLagosTodayDate(); const past = new Date(today); past.setUTCDate(past.getUTCDate() - 1);
    const future = new Date(today); future.setUTCDate(future.getUTCDate() + 4);
    const visible = await createEvent("Visible Summit", EventStatus.PUBLISHED, future, { posterUrl: "https://example.com/poster.jpg" });
    await prisma.eventTargetDepartment.create({ data: { eventId: visible.id, departmentId } });
    await prisma.eventTargetLevel.create({ data: { eventId: visible.id, levelId } });
    await createEvent("Past Published", EventStatus.PUBLISHED, past);
    for (const status of [EventStatus.DRAFT, EventStatus.PENDING_APPROVAL, EventStatus.REJECTED, EventStatus.CANCELLED, EventStatus.COMPLETED]) await createEvent(`Hidden ${status}`, status, future);
    const response = await request(app).get("/").expect(200);
    for (const text of ["Visible Summit", "Technology", "Multipurpose Hall", "YCT Builders"]) expect(response.text).toContain(text);
    expect(response.text).not.toContain("Past Published"); expect(response.text).not.toContain("Hidden ");
  });

  it("orders deterministically and caps the homepage at 24", async () => {
    const date = getLagosTodayDate(); date.setUTCDate(date.getUTCDate() + 10);
    for (let index = 0; index < 26; index += 1) await createEvent(`Event ${String(index).padStart(2, "0")}`, EventStatus.PUBLISHED, date, { startTime: index < 2 ? "09:00" : "10:00" });
    const response = await request(app).get("/").expect(200);
    expect((response.text.match(/class="public-event-card"/g) ?? [])).toHaveLength(24);
    expect(response.text).toContain("Showing 24 of 26 events");
    expect(response.text.indexOf("Event 00")).toBeLessThan(response.text.indexOf("Event 01"));
    expect(response.text).not.toContain("Event 24"); expect(response.text).not.toContain("Event 25");
  });

  it("renders an empty state and poster fallback", async () => {
    expect((await request(app).get("/").expect(200)).text).toContain("No upcoming events yet.");
    const tomorrow = getLagosTodayDate(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await createEvent("No Poster Event", EventStatus.PUBLISHED, tomorrow);
    const response = await request(app).get("/").expect(200);
    expect(response.text).toContain("poster-fallback"); expect(response.text).toContain("No Poster Event");
  });

  it("allows direct access to past published event details and audiences", async () => {
    const past = getLagosTodayDate(); past.setUTCDate(past.getUTCDate() - 30);
    const event = await createEvent("Historic Public Event", EventStatus.PUBLISHED, past);
    await prisma.eventTargetDepartment.create({ data: { eventId: event.id, departmentId } });
    await prisma.eventTargetLevel.create({ data: { eventId: event.id, levelId } });
    const response = await request(app).get(`/events/${event.id}`).expect(200);
    for (const text of ["Historic Public Event", "Computer Science", "ND1"]) expect(response.text).toContain(text);
  });

  it("returns the same generic 404 for non-public statuses and unknown ids", async () => {
    const future = getLagosTodayDate(); future.setUTCDate(future.getUTCDate() + 1); const bodies: string[] = [];
    for (const status of [EventStatus.DRAFT, EventStatus.PENDING_APPROVAL, EventStatus.REJECTED, EventStatus.COMPLETED]) {
      const event = await createEvent(`Private ${status}`, status, future);
      const response = await request(app).get(`/events/${event.id}`).expect(404); bodies.push(response.text);
      expect(response.text).not.toContain(`Private ${status}`);
    }
    const missing = await request(app).get("/events/00000000-0000-0000-0000-000000000000").expect(404);
    expect(new Set([...bodies, missing.text]).size).toBe(1);
    expect(missing.text).toContain("The event you requested is not available.");
  });

  it("keeps cancelled events out of discovery but explains them at their direct URL", async () => {
    const future = getLagosTodayDate(); future.setUTCDate(future.getUTCDate() + 1);
    const event = await createEvent("Cancelled Public Event", EventStatus.CANCELLED, future, { cancellationReason: "The venue is no longer available." });
    expect((await request(app).get("/").expect(200)).text).not.toContain("Cancelled Public Event");
    expect((await request(app).get("/?q=Cancelled").expect(200)).text).not.toContain("Cancelled Public Event");
    const detail = await request(app).get(`/events/${event.id}`).expect(200);
    expect(detail.text).toContain("This event has been cancelled.");
    expect(detail.text).toContain("The venue is no longer available.");
    expect(detail.text).not.toContain(organizerUserId);
  });

  it("does not leak internal ownership, review, or account data", async () => {
    const future = getLagosTodayDate(); future.setUTCDate(future.getUTCDate() + 1);
    const event = await createEvent("Safe Public Event", EventStatus.PUBLISHED, future, { rejectionReason: "INTERNAL REVIEW SECRET" });
    const response = await request(app).get(`/events/${event.id}`).expect(200);
    for (const text of ["INTERNAL REVIEW SECRET", "owner@example.test", "private-hash", authorizationId]) expect(response.text).not.toContain(text);
  });

  it("formats campus time and uses the Lagos calendar boundary", () => {
    expect(formatEventTimeRange("10:00", "13:00")).toBe("10:00 AM – 1:00 PM");
    expect(getLagosTodayDate(new Date("2026-10-08T23:30:00Z")).toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("searches every approved field case-insensitively and normalizes whitespace", async () => {
    const date = getLagosTodayDate(); date.setUTCDate(date.getUTCDate() + 2);
    await createEvent("Career Launchpad", EventStatus.PUBLISHED, date, { description: "Build a standout portfolio", venue: "Innovation Hub", organizerPublicName: "Future Builders", categoryId: secondCategoryId });
    for (const query of ["career launchpad", "STANDOUT PORTFOLIO", "innovation hub", "future builders", "career"]) {
      expect((await request(app).get("/").query({ q: query }).expect(200)).text).toContain("Career Launchpad");
    }
    const normalized = await request(app).get("/?q=%20%20Career%20%20%20Launchpad%20%20").expect(200);
    expect(normalized.text).toContain('value="Career Launchpad"');
    expect((await request(app).get("/?q=%20%20%20").expect(200)).text).toContain("Career Launchpad");
    expect((await request(app).get("/?q=does-not-exist").expect(200)).text).toContain("No events match your search.");
    const formDefaults = await request(app).get("/?q=career&category=&department=&level=&date=upcoming").expect(200);
    expect(formDefaults.text).not.toContain("Some filters were not recognized.");
  });

  it("handles malformed, repeated, overlong, and unknown filters without broadening results", async () => {
    const date = getLagosTodayDate(); date.setUTCDate(date.getUTCDate() + 2);
    await createEvent("Must Stay Hidden By Bad Filter", EventStatus.PUBLISHED, date);
    for (const url of ["/?category=lowercase", "/?category=UNKNOWN", "/?department=UNKNOWN", "/?level=HND2", `/?q=${"x".repeat(101)}`, "/?q=one&q=two"]) {
      const response = await request(app).get(url).expect(200);
      expect(response.text).toContain("Some filters were not recognized.");
      expect(response.text).not.toContain("Must Stay Hidden By Bad Filter");
    }
  });

  it("filters categories exactly, persists state, and loads persisted reference options", async () => {
    const date = getLagosTodayDate(); date.setUTCDate(date.getUTCDate() + 2);
    await createEvent("Technology Event", EventStatus.PUBLISHED, date);
    await createEvent("Career Event", EventStatus.PUBLISHED, date, { categoryId: secondCategoryId });
    const response = await request(app).get("/?category=CAREER").expect(200);
    expect(response.text).toContain("Career Event"); expect(response.text).not.toContain("Technology Event");
    expect(response.text).toContain('value="CAREER" selected');
    expect(response.text).toContain("Electrical Engineering");
    expect(response.text).toContain("ND Year 2");
  });

  it("renders the complete canonical and Management-approved department catalogue in the searchable public picker", async () => {
    await syncProductionDepartments(prisma);
    await prisma.department.create({ data: { name: "Management Approved Studies", code: "MAS" } });
    const response = await request(app).get("/").expect(200);
    expect(response.text).toContain('class="department-picker__native js-department-picker');
    expect(response.text).toContain('name="department"');
    for (const name of PRODUCTION_DEPARTMENTS) expect(response.text).toContain(name);
    expect(response.text).toContain("Management Approved Studies");
    expect(response.text).not.toContain(">Other department<");
  });

  it("treats department filters as relevance and includes untargeted general events", async () => {
    const date = getLagosTodayDate(); date.setUTCDate(date.getUTCDate() + 2);
    const direct = await createEvent("CSC Target", EventStatus.PUBLISHED, date);
    const unrelated = await createEvent("EEE Target", EventStatus.PUBLISHED, date);
    await createEvent("General Campus", EventStatus.PUBLISHED, date);
    await prisma.eventTargetDepartment.create({ data: { eventId: direct.id, departmentId } });
    await prisma.eventTargetDepartment.create({ data: { eventId: unrelated.id, departmentId: secondDepartmentId } });
    const response = await request(app).get("/?department=CSC").expect(200);
    expect(response.text).toContain("CSC Target"); expect(response.text).toContain("General Campus"); expect(response.text).not.toContain("EEE Target");
    expect(response.text).toContain('value="CSC" selected');
    await request(app).get(`/events/${unrelated.id}`).expect(200);
  });

  it("treats level filters as relevance and combines dimensions with AND semantics", async () => {
    const date = getLagosTodayDate(); date.setUTCDate(date.getUTCDate() + 2);
    const match = await createEvent("Career Match", EventStatus.PUBLISHED, date, { categoryId: secondCategoryId });
    const wrongLevel = await createEvent("Career Wrong Level", EventStatus.PUBLISHED, date, { categoryId: secondCategoryId });
    const general = await createEvent("Career General", EventStatus.PUBLISHED, date, { categoryId: secondCategoryId });
    await prisma.eventTargetDepartment.createMany({ data: [{ eventId: match.id, departmentId }, { eventId: wrongLevel.id, departmentId }] });
    await prisma.eventTargetLevel.create({ data: { eventId: match.id, levelId } });
    await prisma.eventTargetLevel.create({ data: { eventId: wrongLevel.id, levelId: secondLevelId } });
    const response = await request(app).get("/?q=career&category=CAREER&department=CSC&level=ND1").expect(200);
    expect(response.text).toContain("Career Match"); expect(response.text).toContain("Career General"); expect(response.text).not.toContain("Career Wrong Level");
    expect(response.text).toContain('value="ND1" selected'); expect(response.text).toContain('href="/" class="clear-filters"');
    expect(general.id).toBeTruthy();
  });

  it("applies AND semantics to paired filters and never leaks private matches", async () => {
    const date = getLagosTodayDate(); date.setUTCDate(date.getUTCDate() + 2);
    const targeted = await createEvent("Public Career CSC", EventStatus.PUBLISHED, date, { categoryId: secondCategoryId });
    await prisma.eventTargetDepartment.create({ data: { eventId: targeted.id, departmentId } });
    await createEvent("Private Career CSC", EventStatus.DRAFT, date, { categoryId: secondCategoryId });
    await createEvent("Technology General", EventStatus.PUBLISHED, date);
    const categoryDepartment = await request(app).get("/?category=CAREER&department=CSC").expect(200);
    expect(categoryDepartment.text).toContain("Public Career CSC"); expect(categoryDepartment.text).not.toContain("Technology General");
    const searchCategory = await request(app).get("/?q=CSC&category=CAREER").expect(200);
    expect(searchCategory.text).toContain("Public Career CSC"); expect(searchCategory.text).not.toContain("Private Career CSC");
  });

  it("applies today, week, and month as Lagos calendar ranges", async () => {
    const today = getLagosTodayDate();
    const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await createEvent("Today Event", EventStatus.PUBLISHED, today);
    await createEvent("Tomorrow Event", EventStatus.PUBLISHED, tomorrow);
    const todayPage = await request(app).get("/?date=today").expect(200);
    expect(todayPage.text).toContain("Today Event"); expect(todayPage.text).not.toContain("Tomorrow Event"); expect(todayPage.text).toContain('value="today" selected');
    expect((await request(app).get("/?date=week").expect(200)).text).toContain("Today Event");
    expect((await request(app).get("/?date=month").expect(200)).text).toContain("Today Event");

    const saturday = new Date("2026-10-10T22:30:00Z");
    expect(getPublicDateRange("week", saturday).lte?.toISOString()).toBe("2026-10-11T00:00:00.000Z");
    const monthEnd = new Date("2026-10-31T22:30:00Z");
    const range = getPublicDateRange("month", monthEnd);
    expect(range.gte.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(range.lte?.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("keeps authentication and protected entry points unchanged", async () => {
    await request(app).get("/login").expect(200); await request(app).get("/register").expect(200);
    await request(app).get("/organizer/events").expect(302).expect("Location", "/login");
    await request(app).get("/admin/events").expect(302).expect("Location", "/admin/login");
  });
});
