import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { EventStatus, LevelCode, OrganizerAuthorizationStatus, PrismaClient, UserRole } from "@prisma/client";
import { createApp } from "../src/app.js";
import { formatEventTimeRange, getLagosTodayDate } from "../src/utils/event-display.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL environment variable is required for tests");
const app = createApp();
let pool: pg.Pool;
let prisma: PrismaClient;
let categoryId: string, authorizationId: string, departmentId: string, levelId: string;

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
  const level = await prisma.level.create({ data: { code: LevelCode.ND1, label: "ND Year 1" } });
  const category = await prisma.eventCategory.create({ data: { name: "Technology", code: "TECH" } });
  const cycle = await prisma.academicYearCycle.create({ data: { name: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-08-31"), isCurrent: true } });
  const user = await prisma.user.create({ data: { fullName: "Private Owner", email: "owner@example.test", matricNumber: "F/ND/26/9999999", passwordHash: "private-hash", role: UserRole.MEMBER, departmentId: department.id, levelId: level.id } });
  const application = await prisma.organizerApplication.create({ data: { userId: user.id, cycleId: cycle.id, requestedPublicName: "YCT Builders", phoneNumber: "08000000000", reason: "Campus events", status: "APPROVED" } });
  const authorization = await prisma.organizerAuthorization.create({ data: { userId: user.id, cycleId: cycle.id, applicationId: application.id, approvedPublicName: "YCT Builders", status: OrganizerAuthorizationStatus.ACTIVE } });
  categoryId = category.id; authorizationId = authorization.id; departmentId = department.id; levelId = level.id;
});

async function createEvent(title: string, status: EventStatus, eventDate: Date, overrides: Record<string, unknown> = {}) {
  return prisma.event.create({ data: { title, description: `Public description for ${title}`, categoryId, eventDate, startTime: "10:00", endTime: "13:00", venue: "Multipurpose Hall", primaryOrganizerAuthorizationId: authorizationId, organizerPublicName: "YCT Builders", status, ...overrides } });
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
    for (const status of [EventStatus.DRAFT, EventStatus.PENDING_APPROVAL, EventStatus.REJECTED, EventStatus.CANCELLED, EventStatus.COMPLETED]) {
      const event = await createEvent(`Private ${status}`, status, future);
      const response = await request(app).get(`/events/${event.id}`).expect(404); bodies.push(response.text);
      expect(response.text).not.toContain(`Private ${status}`);
    }
    const missing = await request(app).get("/events/00000000-0000-0000-0000-000000000000").expect(404);
    expect(new Set([...bodies, missing.text]).size).toBe(1);
    expect(missing.text).toContain("The event you requested is not available.");
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

  it("keeps authentication and protected entry points unchanged", async () => {
    await request(app).get("/login").expect(200); await request(app).get("/register").expect(200);
    await request(app).get("/organizer/events").expect(302).expect("Location", "/login");
    await request(app).get("/admin/events").expect(302).expect("Location", "/admin/login");
  });
});
