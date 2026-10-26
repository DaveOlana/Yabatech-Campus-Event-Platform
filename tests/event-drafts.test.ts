import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "./helpers/http.js";
import supertest from "supertest";
import bcrypt from "bcrypt";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, LevelCode, UserRole, VerificationStatus, OrganizerAuthorizationStatus, EventStatus } from "@prisma/client";
import dotenv from "dotenv";
import { createApp } from "../src/app.js";
import { ensureSessionTable } from "../src/session.js";
import { cancelPublishedEventAsManagement, cancelPublishedEventAsOrganizer } from "../src/services/event.service.js";
import { deleteManagedPoster, verifyUploadedBlobPoster } from "../src/services/poster-storage.service.js";
import { expiredEventPosterWhere, prunePosters } from "../src/services/poster-cleanup.service.js";
import { getLagosTodayDate } from "../src/utils/event-display.js";
import { del, head, issueSignedToken, list } from "@vercel/blob";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://ycep-test.public.blob.vercel-storage.com/${pathname}`, pathname })),
  del: vi.fn(async () => undefined),
  head: vi.fn(),
  list: vi.fn(async () => ({ blobs: [], hasMore: false })),
  issueSignedToken: vi.fn(async () => "signed-test-token"),
}));
vi.mock("@vercel/blob/client", () => ({
  handleUploadPresigned: vi.fn(async ({ body, getSignedToken }: any) => body.type === "blob.generate-presigned-url"
    ? getSignedToken(body.payload?.pathname ?? "ycep/posters/00000000-0000-4000-8000-000000000099/00000000-0000-4000-8000-000000000001.png", body.payload?.clientPayload, false)
    : { type: "blob.upload-completed" }),
}));

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
  registrationUrl: "",
  eventDate: "2026-11-20",
  startTime: "10:00",
  endTime: "14:00",
  venue: "Multipurpose Hall",
  targetDepartmentIds: [departmentId],
  targetLevelIds: [levelId],
  ...overrides,
});

const PNG_POSTER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG_POSTER = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

function createDraftWithPoster(agent: any, overrides: Record<string, unknown> = {}) {
  const fields = Object.fromEntries(Object.entries(payload(overrides)).filter(([, value]) => value !== undefined));
  return agent.post("/organizer/events")
    .field(fields)
    .attach("poster", PNG_POSTER, { filename: "poster.png", contentType: "image/png" });
}

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
    expect(page.text).toContain('name="targetDepartmentIds"');
    expect(page.text).toContain('multiple size="8"');
    expect(page.text).toContain("Search target departments");
    expect(page.text).toContain('name="poster"');
    expect(page.text).toContain('name="poster" type="file"');
    expect(page.text).toContain("required");
    expect(page.text).toContain("Add an event poster before saving this draft.");
    expect(page.text).toContain('name="registrationUrl"');
    expect(page.text).toContain('name="_csrf"');
    expect(page.text).toContain('data-event-draft-form');
    expect(page.text).toContain('data-event-draft-key="new"');
    expect(page.text).toContain('/js/event-form-recovery.js');
    expect(page.text).toContain('Unsaved changes restored');
    expect(page.text).toContain('data-checklist-actions="targetLevelIds"');
    expect(page.text).toContain('data-select-all');
    expect(page.text).toContain('data-clear-all');
    expect(page.text).toContain('1080 × 1350 px');
    expect(page.text).toContain('shown in full without cropping');
    expect(page.text).toContain('name="posterUrl"');
    expect(page.text).toContain('name="posterBlobPath"');
    expect(page.text).toContain('/js/poster-direct-upload.js');
    expect(page.headers["content-security-policy"]).toContain("img-src 'self' https: data: blob:");
    expect(page.headers["content-security-policy"]).toContain("connect-src 'self' https://vercel.com");
    expect(page.text).not.toContain(process.env.BLOB_WEBHOOK_PUBLIC_KEY || "never-a-rendered-provider-key");
    expect(page.text).not.toContain("Registration Limit");
    expect(page.text).not.toContain("Application Questions");
  });

  it("accepts the rendered CSRF field in a multipart browser submission", async () => {
    const { user } = await setupOrganizer();
    const browserAgent = supertest.agent(app);
    const loginPage = await browserAgent.get("/login").expect(200);
    const loginToken = loginPage.text.match(/name="_csrf" value="([A-Za-z0-9_-]{43})"/)?.[1];
    expect(loginToken).toBeTruthy();
    await browserAgent.post("/login").type("form").send({ matricNumber: user.matricNumber, password: "password123", _csrf: loginToken }).expect(302);
    const page = await browserAgent.get("/organizer/events/new").expect(200);
    const token = page.text.match(/name="_csrf" value="([A-Za-z0-9_-]{43})"/)?.[1];
    expect(token).toBeTruthy();
    await browserAgent.post("/organizer/events")
      .field({ ...payload({ title: "Multipart Browser Draft" }), _csrf: token! })
      .attach("poster", PNG_POSTER, { filename: "poster.png", contentType: "image/png" })
      .expect(302);
    const draft = await prisma.event.findFirstOrThrow({ where: { title: "Multipart Browser Draft" } });
    expect(draft.posterUrl).toMatch(/^\/uploads\/event-posters\//);
    expect(draft.posterBlobPath).toMatch(/^local:event-posters\//);
    expect(await prisma.event.count({ where: { title: "Multipart Browser Draft" } })).toBe(1);
    const savedPage = await browserAgent.get(`/organizer/events/${draft.id}?saved=1`).expect(200);
    expect(savedPage.text).toContain("Draft saved successfully.");
  });

  it("blocks the first save until a poster has been persisted", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    const response = await agent.post("/organizer/events").type("form").send(payload({ title: "Poster Required" })).expect(400);
    expect(response.text).toContain("Add an event poster before saving this draft.");
    expect(await prisma.event.count({ where: { title: "Poster Required" } })).toBe(0);
  });

  it("creates a DRAFT bound to the authorization with server-derived identity", async () => {
    const { user, authorization } = await setupOrganizer("YCT Tech Club");
    const agent = await login(user.matricNumber!);
    const creation = await createDraftWithPoster(agent).expect(302);
    expect(creation.headers.location).toMatch(/^\/organizer\/events\/[0-9a-f-]{36}\?saved=1$/);
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
    await agent.post("/organizer/events").field(payload({
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
    })).attach("poster", PNG_POSTER, { filename: "poster.png", contentType: "image/png" }).expect(302);
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
    await createDraftWithPoster(agent, { title: "No Targets", targetDepartmentIds: undefined, targetLevelIds: undefined }).expect(302);
    await createDraftWithPoster(agent, { title: "Deduplicated Targets", targetDepartmentIds: [departmentId, departmentId], targetLevelIds: [levelId, levelId] }).expect(302);
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

  it("accepts optional HTTPS registration links and rejects unsafe schemes", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    await createDraftWithPoster(agent, { registrationUrl: "https://forms.example/register" }).expect(302);
    await agent.post("/organizer/events").type("form").send(payload({ title: "Insecure Registration", registrationUrl: "http://example.com/register" })).expect(400);
    const response = await agent.post("/organizer/events").type("form").send(payload({ title: "Unsafe Registration", registrationUrl: "javascript:alert(1)" }));
    expect(response.status).toBe(400);
    expect(response.text).toContain("Registration link must use https");
  });

  it("accepts valid JPEG, PNG, and WebP posters and rejects unsafe files", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    const files = [
      { title: "JPEG Poster", data: Buffer.from([0xff, 0xd8, 0xff, 0x00]), filename: "poster.jpg", contentType: "image/jpeg" },
      { title: "PNG Poster", data: PNG_POSTER, filename: "poster.png", contentType: "image/png" },
      { title: "WebP Poster", data: Buffer.from("RIFF0000WEBP", "ascii"), filename: "poster.webp", contentType: "image/webp" },
    ];
    for (const file of files) {
      await agent.post("/organizer/events").field(payload({ title: file.title })).attach("poster", file.data, { filename: file.filename, contentType: file.contentType }).expect(302);
      const stored = await prisma.event.findFirstOrThrow({ where: { title: file.title } });
      expect(stored.posterUrl).toMatch(/^\/uploads\/event-posters\/[0-9a-f-]+\.(?:jpg|png|webp)$/);
      expect(stored.posterBlobPath).toMatch(/^local:event-posters\/[0-9a-f-]+\.(?:jpg|png|webp)$/);
    }
    await agent.post("/organizer/events").field(payload({ title: "SVG Poster" })).attach("poster", Buffer.from("<svg></svg>"), { filename: "poster.svg", contentType: "image/svg+xml" }).expect(400);
    await agent.post("/organizer/events").field(payload({ title: "Invalid MIME" })).attach("poster", files[1].data, { filename: "poster.bin", contentType: "application/octet-stream" }).expect(400);
    await agent.post("/organizer/events").field(payload({ title: "Oversized Poster" })).attach("poster", Buffer.alloc(4 * 1024 * 1024 + 1, 0xff), { filename: "large.jpg", contentType: "image/jpeg" }).expect(400);
  });

  it("accepts a large Select all audience without misreporting it as multiple poster uploads", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    const requestWithAudience = agent.post("/organizer/events").field(payload({ title: "All Departments Event" }))
      .attach("poster", PNG_POSTER, { filename: "poster.png", contentType: "image/png" });
    for (let index = 0; index < 75; index += 1) requestWithAudience.field("targetDepartmentIds", departmentId);
    const response = await requestWithAudience.expect(302);
    expect(response.headers.location).toMatch(/^\/organizer\/events\/[0-9a-f-]{36}\?saved=1$/);
    const stored = await prisma.event.findFirstOrThrow({ where: { title: "All Departments Event" }, include: { targetDepartments: true } });
    expect(stored.targetDepartments).toHaveLength(1);
  });

  it("stores and serves posters locally when cloud storage is absent outside production", async () => {
    const { user } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    let localPosterPath: string | null = null;
    try {
      const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]);
      await agent.post("/organizer/events").field(payload({ title: "Local Poster Event" })).attach("poster", png, { filename: "poster.png", contentType: "image/png" }).expect(302);
      const stored = await prisma.event.findFirstOrThrow({ where: { title: "Local Poster Event" } });
      localPosterPath = stored.posterBlobPath;
      expect(stored.posterUrl).toMatch(/^\/uploads\/event-posters\/[0-9a-f-]+\.png$/);
      await agent.get(stored.posterUrl!).expect(200).expect("Content-Type", /image\/png/);
    } finally {
      await deleteManagedPoster(localPosterPath);
    }
  });

  it("authorizes direct uploads only for a live organizer and keeps provider credentials out of HTML", async () => {
    const secret = "provider-secret-that-must-not-render";
    const previous = process.env.BLOB_WEBHOOK_PUBLIC_KEY;
    process.env.BLOB_WEBHOOK_PUBLIC_KEY = secret;
    try {
      await request(app).post("/organizer/posters/upload").send({ type: "blob.generate-presigned-url", payload: {} }).expect(401);
      const member = await createMember();
      await (await login(member.matricNumber!)).post("/organizer/posters/upload").send({ type: "blob.generate-presigned-url", payload: {} }).expect(403);
      const { user, authorization } = await setupOrganizer();
      const organizer = await login(user.matricNumber!);
      const pathname = `ycep/posters/${authorization.id}/00000000-0000-4000-8000-000000000001.png`;
      await organizer.post("/organizer/posters/upload").send({ type: "blob.generate-presigned-url", payload: { pathname } }).expect(200);
      expect(issueSignedToken).toHaveBeenCalledWith(expect.objectContaining({
        pathname,
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
        maximumSizeInBytes: 4 * 1024 * 1024,
      }));
      expect((await organizer.get("/organizer/events/new")).text).not.toContain(secret);
    } finally {
      if (previous === undefined) delete process.env.BLOB_WEBHOOK_PUBLIC_KEY; else process.env.BLOB_WEBHOOK_PUBLIC_KEY = previous;
    }
  });

  it("never falls back to local poster storage in production", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { storePoster } = await import("../src/services/poster-storage.service.js");
      await expect(storePoster({ buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: "image/jpeg", originalname: "x.jpg", size: 3 }))
        .rejects.toThrow(/directly to managed storage/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("verifies direct Blob metadata and signature before attaching a poster", async () => {
    const ownerId = "00000000-0000-4000-8000-000000000099";
    const pathname = `ycep/posters/${ownerId}/00000000-0000-4000-8000-000000000020.png`;
    const url = `https://test.public.blob.vercel-storage.com/${pathname}`;
    vi.mocked(head).mockResolvedValueOnce({ pathname, url, downloadUrl: url, contentType: "image/png", contentDisposition: "inline", size: 9, uploadedAt: new Date() });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]), { status: 206 })));
    try {
      await expect(verifyUploadedBlobPoster({ pathname, url }, ownerId)).resolves.toEqual({ pathname, url });
      await expect(verifyUploadedBlobPoster({ pathname, url }, "00000000-0000-4000-8000-000000000098"))
        .rejects.toThrow(/does not belong/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a spoofed direct-upload reference owned by another organizer", async () => {
    const owner = await setupOrganizer("Poster Owner");
    const attacker = await setupOrganizer("Different Organizer");
    const attackerAgent = await login(attacker.user.matricNumber!);
    const pathname = `ycep/posters/${owner.authorization.id}/00000000-0000-4000-8000-000000000021.png`;
    const response = await attackerAgent.post("/organizer/events").type("form").send(payload({
      title: "Spoofed Poster Draft",
      posterUrl: `https://test.public.blob.vercel-storage.com/${pathname}`,
      posterBlobPath: pathname,
    })).expect(400);
    expect(response.text).toContain("does not belong to this organizer authorization");
    expect(await prisma.event.count({ where: { title: "Spoofed Poster Draft" } })).toBe(0);
  });

  it("does not allow one managed poster reference to be shared by two events", async () => {
    const owner = await setupOrganizer("Single Poster Owner");
    const ownerAgent = await login(owner.user.matricNumber!);
    const pathname = `ycep/posters/${owner.authorization.id}/00000000-0000-4000-8000-000000000022.png`;
    const url = `https://test.public.blob.vercel-storage.com/${pathname}`;
    await prisma.event.create({ data: {
      title: "Original Poster Event",
      description: "The event that owns the managed poster reference.",
      categoryId,
      posterUrl: url,
      posterBlobPath: pathname,
      eventDate: new Date("2026-11-20"),
      startTime: "10:00",
      endTime: "12:00",
      venue: "Hall",
      primaryOrganizerAuthorizationId: owner.authorization.id,
      organizerPublicName: owner.authorization.approvedPublicName,
    } });
    vi.mocked(head).mockResolvedValueOnce({ pathname, url, downloadUrl: url, contentType: "image/png", contentDisposition: "inline", size: PNG_POSTER.length, uploadedAt: new Date() });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(PNG_POSTER, { status: 206 })));
    try {
      const response = await ownerAgent.post("/organizer/events").type("form").send(payload({
        title: "Duplicate Poster Event",
        posterUrl: url,
        posterBlobPath: pathname,
      })).expect(400);
      expect(response.text).toContain("already attached to another event");
      expect(await prisma.event.count({ where: { posterBlobPath: pathname } })).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("replaces and removes only managed draft posters while preserving published immutability", async () => {
    const { user, authorization } = await setupOrganizer();
    const agent = await login(user.matricNumber!);
    const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]);
    const jpg = Buffer.from([0xff,0xd8,0xff,0x00]);
    await agent.post("/organizer/events").field(payload({ title: "Replace Poster" })).attach("poster", png, { filename: "old.png", contentType: "image/png" }).expect(302);
    const event = await prisma.event.findFirstOrThrow({ where: { title: "Replace Poster" } });
    const oldUrl = event.posterUrl!;
    await agent.post(`/organizer/events/${event.id}`).field(payload({ title: "Replaced Poster" })).attach("poster", jpg, { filename: "new.jpg", contentType: "image/jpeg" }).expect(302);
    const replaced = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(replaced.posterUrl).toMatch(/\.jpg$/);
    await agent.get(oldUrl).expect(404);
    const removeWithoutReplacement = await agent.post(`/organizer/events/${event.id}`).type("form").send(payload({ title: "Poster Removed", removePoster: "on" })).expect(400);
    expect(removeWithoutReplacement.text).toContain("Add an event poster before saving this draft.");
    expect(await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ title: "Replaced Poster", posterUrl: replaced.posterUrl, posterBlobPath: replaced.posterBlobPath });

    const external = await prisma.event.create({ data: { title: "External Historical Poster", description: "A historical external poster URL.", categoryId, posterUrl: "https://images.example/external.jpg", eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName } });
    await agent.post(`/organizer/events/${external.id}`).type("form").send(payload({ title: "External Cleared", removePoster: "on" })).expect(400);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: external.id } })).posterUrl).toBe("https://images.example/external.jpg");
    expect(del).not.toHaveBeenCalledWith("https://images.example/external.jpg");

    await prisma.event.update({ where: { id: event.id }, data: { status: EventStatus.PUBLISHED } });
    await agent.post(`/organizer/events/${event.id}`).type("form").send(payload({ removePoster: "on" })).expect(409);
  });

  it("prunes expired event posters and old unreferenced Blobs without deleting Events or live references", async () => {
    const { authorization } = await setupOrganizer();
    const oldPath = "ycep/posters/00000000-0000-4000-8000-000000000010.png";
    const livePath = "ycep/posters/00000000-0000-4000-8000-000000000011.png";
    const orphanPath = "ycep/posters/00000000-0000-4000-8000-000000000012.png";
    const now = new Date("2026-10-10T12:00:00Z");
    const base = { description: "Poster retention policy integration fixture.", categoryId, startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName };
    const expired = await prisma.event.create({ data: { ...base, title: "Expired Published Poster", status: EventStatus.PUBLISHED, eventDate: new Date("2026-09-01"), posterUrl: `https://test.public.blob.vercel-storage.com/${oldPath}`, posterBlobPath: oldPath } });
    const retained = await prisma.event.create({ data: { ...base, title: "Retained Published Poster", status: EventStatus.PUBLISHED, eventDate: new Date("2026-09-20"), posterUrl: `https://test.public.blob.vercel-storage.com/${livePath}`, posterBlobPath: livePath } });
    vi.mocked(list).mockResolvedValueOnce({ blobs: [
      { url: `https://test.public.blob.vercel-storage.com/${oldPath}`, downloadUrl: "", pathname: oldPath, size: 9, uploadedAt: new Date("2026-08-01") },
      { url: `https://test.public.blob.vercel-storage.com/${livePath}`, downloadUrl: "", pathname: livePath, size: 9, uploadedAt: new Date("2026-08-01") },
      { url: `https://test.public.blob.vercel-storage.com/${orphanPath}`, downloadUrl: "", pathname: orphanPath, size: 9, uploadedAt: new Date("2026-10-08") },
    ], hasMore: false, cursor: undefined });
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const cleanup = await prunePosters(now);
      expect(cleanup.processed).toBe(2);
    } finally {
      process.env.NODE_ENV = previous;
    }
    expect(await prisma.event.findUnique({ where: { id: expired.id } })).toMatchObject({ posterUrl: null, posterBlobPath: null });
    expect(await prisma.event.findUnique({ where: { id: retained.id } })).toMatchObject({ posterBlobPath: livePath });
    expect((await request(app).get(`/events/${expired.id}`).expect(200)).text).toContain("poster-fallback--detail");
    expect(del).toHaveBeenCalledWith(oldPath);
    expect(del).toHaveBeenCalledWith(orphanPath);
    expect(del).not.toHaveBeenCalledWith(livePath);
  });

  it("uses lifecycle-specific 30-day retention for cancelled, rejected, draft, and pending posters", async () => {
    const { user, authorization } = await setupOrganizer();
    const now = new Date("2026-10-10T12:00:00Z");
    const old = new Date("2026-09-01T12:00:00Z");
    const recent = new Date("2026-09-20T12:00:00Z");
    const base = { description: "Lifecycle-specific poster retention fixture.", categoryId, startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, posterUrl: "https://test.public.blob.vercel-storage.com/ycep/posters/fixture.png" };
    const fixtures = [
      { title: "Old Cancelled", status: EventStatus.CANCELLED, eventDate: recent, cancelledAt: old, cancellationReason: "Cancelled for a valid operational reason.", cancelledByUserId: user.id },
      { title: "Recent Cancelled", status: EventStatus.CANCELLED, eventDate: old, cancelledAt: recent, cancellationReason: "Cancelled for a valid operational reason.", cancelledByUserId: user.id },
      { title: "Old Rejected", status: EventStatus.REJECTED, eventDate: recent, reviewedAt: old, rejectionReason: "A sufficiently clear rejection reason." },
      { title: "Recent Rejected", status: EventStatus.REJECTED, eventDate: old, reviewedAt: recent, rejectionReason: "A sufficiently clear rejection reason." },
      { title: "Old Draft", status: EventStatus.DRAFT, eventDate: old },
      { title: "Future Draft", status: EventStatus.DRAFT, eventDate: new Date("2026-11-01") },
      { title: "Old Pending", status: EventStatus.PENDING_APPROVAL, eventDate: old, submittedAt: old },
      { title: "Future Pending", status: EventStatus.PENDING_APPROVAL, eventDate: new Date("2026-11-01"), submittedAt: old },
    ];
    for (let index = 0; index < fixtures.length; index += 1) {
      await prisma.event.create({ data: { ...base, ...fixtures[index], posterBlobPath: `ycep/posters/00000000-0000-4000-8000-${String(index).padStart(12, "0")}.png` } });
    }
    const eligible = (await prisma.event.findMany({ where: expiredEventPosterWhere(now), select: { title: true } })).map((event) => event.title).sort();
    expect(eligible).toEqual(["Old Cancelled", "Old Draft", "Old Pending", "Old Rejected"]);
  });

  it("offers a direct return to the event form after a CSRF failure", async () => {
    const response = await request(app).post("/organizer/events").set("X-CSRF-Token", "invalid").type("form").send(payload());
    expect(response.status).toBe(403);
    expect(response.text).toContain('href="/organizer/events/new"');
    expect(response.text).toContain("Return to event form");
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
    await createDraftWithPoster(agent).expect(302);
    const event = await prisma.event.findFirstOrThrow({ where: { primaryOrganizerAuthorizationId: authorization.id } });
    await agent.get(`/organizer/events/${event.id}`).expect(200);
    const editPage = await agent.get(`/organizer/events/${event.id}/edit`).expect(200);
    expect(editPage.text).toContain(`data-event-draft-key="${event.id}"`);
    const update = await agent.post(`/organizer/events/${event.id}`).type("form").send(payload({ title: "Updated Campus Summit", status: "PUBLISHED", organizerPublicName: "Spoof" })).expect(302);
    expect(update.headers.location).toBe(`/organizer/events/${event.id}?saved=1`);
    const updated = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.title).toBe("Updated Campus Summit");
    expect(updated.status).toBe(EventStatus.DRAFT);
    expect(updated.organizerPublicName).toBe("Original Organizer");
  });

  it("returns 404 to another organizer", async () => {
    const first = await setupOrganizer("First");
    const firstAgent = await login(first.user.matricNumber!);
    await createDraftWithPoster(firstAgent).expect(302);
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

  it("lets the owner revise a rejected event and resubmit it for a fresh review", async () => {
    const { user, authorization } = await setupOrganizer();
    const previousSubmittedAt = new Date("2026-10-10T08:00:00Z");
    const previousReviewedAt = new Date("2026-10-10T09:00:00Z");
    const event = await prisma.event.create({ data: {
      title: "Rejected Proposal",
      description: "An event proposal that needs clearer public information.",
      categoryId,
      eventDate: new Date("2026-11-20"),
      startTime: "10:00",
      endTime: "12:00",
      venue: "Old Hall",
      primaryOrganizerAuthorizationId: authorization.id,
      organizerPublicName: authorization.approvedPublicName,
      status: EventStatus.REJECTED,
      submittedAt: previousSubmittedAt,
      reviewedAt: previousReviewedAt,
      rejectionReason: "Clarify the venue and intended event outcome.",
    } });
    const agent = await login(user.matricNumber!);

    const detail = await agent.get(`/organizer/events/${event.id}`).expect(200);
    expect(detail.text).toContain("Revise event");
    expect(detail.text).toContain("Clarify the venue and intended event outcome.");
    const editor = await agent.get(`/organizer/events/${event.id}/edit`).expect(200);
    expect(editor.text).toContain("Revision requested");
    expect(editor.text).toContain("Clarify the venue and intended event outcome.");

    await agent.post(`/organizer/events/${event.id}`).field(payload({
      title: "Revised Proposal",
      venue: "Multipurpose Hall",
    })).attach("poster", PNG_POSTER, { filename: "poster.png", contentType: "image/png" }).expect(302);
    const revised = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(revised).toMatchObject({
      status: EventStatus.DRAFT,
      title: "Revised Proposal",
      venue: "Multipurpose Hall",
      submittedAt: null,
      reviewedAt: null,
      reviewerUserId: null,
      rejectionReason: "Clarify the venue and intended event outcome.",
    });
    expect(await prisma.auditLog.count({ where: { targetId: event.id, action: "EVENT_REVISION_STARTED" } })).toBe(1);
    expect((await agent.get(`/organizer/events/${event.id}`).expect(200)).text).toContain("Previous Management feedback");

    await agent.post(`/organizer/events/${event.id}/submit`).expect(302);
    const resubmitted = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(resubmitted.status).toBe(EventStatus.PENDING_APPROVAL);
    expect(resubmitted.submittedAt).not.toBeNull();
    expect(resubmitted.rejectionReason).toBeNull();
    expect(await prisma.auditLog.count({ where: { targetId: event.id, action: "EVENT_SUBMITTED" } })).toBe(1);
    await request(app).get(`/events/${event.id}`).expect(404);
  });

  it("publishes exactly the fully revised submission that Management reviewed", async () => {
    const { user } = await setupOrganizer("YCT Innovation Hub");
    const organizer = await login(user.matricNumber!);
    const career = await prisma.eventCategory.create({ data: { name: "Career", code: "CAREER" } });
    const future = getLagosTodayDate();
    future.setUTCDate(future.getUTCDate() + 60);
    const revisedDate = future.toISOString().slice(0, 10);

    await createDraftWithPoster(organizer, {
      title: "YABATECH Student Innovation Fair",
      description: "Original event",
      venue: "Venue A",
      registrationUrl: "https://forms.example/original",
      targetDepartmentIds: [departmentId],
      targetLevelIds: [levelId],
    }).expect(302);
    const original = await prisma.event.findFirstOrThrow({ where: { title: "YABATECH Student Innovation Fair" } });
    const originalPosterUrl = original.posterUrl;
    await organizer.post(`/organizer/events/${original.id}/submit`).expect(302);
    const firstSubmission = await prisma.event.findUniqueOrThrow({ where: { id: original.id } });

    const admin = await createMember({ admin: true });
    const management = request.agent(app);
    await management.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    const originalReview = await management.get(`/admin/events/${original.id}`).expect(200);
    expect(originalReview.text).toContain("YABATECH Student Innovation Fair");
    expect(originalReview.text).toContain("Original event");
    await management.post(`/admin/events/${original.id}/reject`).type("form").send({
      expectedSubmittedAt: firstSubmission.submittedAt!.toISOString(),
      rejectionReason: "Replace the proposal with the finalized showcase information.",
    }).expect(302);

    await organizer.post(`/organizer/events/${original.id}`)
      .field(payload({
        title: "YCT Map Showcase Event",
        description: "Completely different description",
        venue: "Venue B",
        categoryId: career.id,
        eventDate: revisedDate,
        startTime: "15:00",
        endTime: "18:30",
        registrationUrl: "https://register.example/map-showcase",
        targetDepartmentIds: [secondDepartmentId],
        targetLevelIds: [secondLevelId],
      }))
      .attach("poster", JPEG_POSTER, { filename: "map-showcase.jpg", contentType: "image/jpeg" })
      .expect(302);
    const revised = await prisma.event.findUniqueOrThrow({
      where: { id: original.id },
      include: { targetDepartments: true, targetLevels: true },
    });
    expect(revised.id).toBe(original.id);
    expect(revised.posterUrl).not.toBe(originalPosterUrl);
    expect(revised).toMatchObject({
      title: "YCT Map Showcase Event",
      description: "Completely different description",
      venue: "Venue B",
      categoryId: career.id,
      startTime: "15:00",
      endTime: "18:30",
      registrationUrl: "https://register.example/map-showcase",
      status: EventStatus.DRAFT,
    });
    expect(revised.eventDate.toISOString().slice(0, 10)).toBe(revisedDate);
    expect(revised.targetDepartments.map((target) => target.departmentId)).toEqual([secondDepartmentId]);
    expect(revised.targetLevels.map((target) => target.levelId)).toEqual([secondLevelId]);

    await organizer.post(`/organizer/events/${original.id}/submit`).expect(302);
    const secondSubmission = await prisma.event.findUniqueOrThrow({ where: { id: original.id } });
    const revisedReview = await management.get(`/admin/events/${original.id}`).expect(200);
    for (const value of ["YCT Map Showcase Event", "Completely different description", "Venue B", "Career", "15:00", "18:30", "Electrical Engineering", "HND1", "https://register.example/map-showcase"]) {
      expect(revisedReview.text).toContain(value);
    }
    expect(revisedReview.text).not.toContain("YABATECH Student Innovation Fair");
    expect(revisedReview.text).toContain(revised.posterUrl!);
    await organizer.get(originalPosterUrl!).expect(404);

    await management.post(`/admin/events/${original.id}/approve`).type("form").send({
      expectedSubmittedAt: secondSubmission.submittedAt!.toISOString(),
    }).expect(302);
    const published = await prisma.event.findUniqueOrThrow({ where: { id: original.id } });
    expect(published.status).toBe(EventStatus.PUBLISHED);

    const homepage = await request(app).get("/").expect(200);
    expect(homepage.text).toContain("YCT Map Showcase Event");
    expect(homepage.text).not.toContain("YABATECH Student Innovation Fair");
    expect(homepage.text).not.toContain("https://forms.example/original");
    expect(homepage.text).toContain(revised.posterUrl!);
    const detail = await request(app).get(`/events/${original.id}`).expect(200);
    for (const value of ["YCT Map Showcase Event", "Completely different description", "Venue B", "Career", "https://register.example/map-showcase", revised.posterUrl!]) {
      expect(detail.text).toContain(value);
    }
    expect(detail.text).not.toContain("YABATECH Student Innovation Fair");
    expect(detail.text).not.toContain("https://forms.example/original");
    expect(await prisma.event.count({ where: { title: "YABATECH Student Innovation Fair", status: EventStatus.PUBLISHED } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { targetId: original.id, action: "EVENT_REJECTED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { targetId: original.id, action: "EVENT_REVISION_STARTED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { targetId: original.id, action: "EVENT_SUBMITTED" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { targetId: original.id, action: "EVENT_APPROVED" } })).toBe(1);
    const revisionAudit = await prisma.auditLog.findFirstOrThrow({ where: { targetId: original.id, action: "EVENT_REVISION_STARTED" } });
    expect(revisionAudit.metadata).toMatchObject({ previousRejectionReason: "Replace the proposal with the finalized showcase information." });
  });

  it("rejects a stale Management decision after rejection, revision, and resubmission", async () => {
    const { user } = await setupOrganizer();
    const organizer = await login(user.matricNumber!);
    await createDraftWithPoster(organizer, { title: "Submission One" }).expect(302);
    const event = await prisma.event.findFirstOrThrow({ where: { title: "Submission One" } });
    await organizer.post(`/organizer/events/${event.id}/submit`).expect(302);
    const first = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });

    const admin = await createMember({ admin: true });
    const management = request.agent(app);
    await management.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    await management.get(`/admin/events/${event.id}`).expect(200);
    await management.post(`/admin/events/${event.id}/reject`).type("form").send({
      expectedSubmittedAt: first.submittedAt!.toISOString(),
      rejectionReason: "This first submission needs a material revision.",
    }).expect(302);

    await organizer.post(`/organizer/events/${event.id}`).type("form").send(payload({ title: "Submission Two" })).expect(302);
    await organizer.post(`/organizer/events/${event.id}/submit`).expect(302);
    const second = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(second.submittedAt?.toISOString()).not.toBe(first.submittedAt?.toISOString());

    const staleDecision = await management.post(`/admin/events/${event.id}/approve`).type("form").send({
      expectedSubmittedAt: first.submittedAt!.toISOString(),
    }).expect(409);
    expect(staleDecision.text).toContain("submission changed");
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(EventStatus.PENDING_APPROVAL);
    expect(await prisma.auditLog.count({ where: { targetId: event.id, action: "EVENT_APPROVED" } })).toBe(0);
  });

  it("serializes concurrent decisions so a submission is published and audited once", async () => {
    const { user } = await setupOrganizer();
    const organizer = await login(user.matricNumber!);
    await createDraftWithPoster(organizer, { title: "Concurrent Review" }).expect(302);
    const event = await prisma.event.findFirstOrThrow({ where: { title: "Concurrent Review" } });
    await organizer.post(`/organizer/events/${event.id}/submit`).expect(302);
    const submitted = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });

    const admin = await createMember({ admin: true });
    const firstReviewer = request.agent(app);
    const secondReviewer = request.agent(app);
    await firstReviewer.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    await secondReviewer.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    const decision = { expectedSubmittedAt: submitted.submittedAt!.toISOString() };
    const outcomes = await Promise.all([
      firstReviewer.post(`/admin/events/${event.id}/approve`).set("Accept", "application/json").send(decision),
      secondReviewer.post(`/admin/events/${event.id}/approve`).set("Accept", "application/json").send(decision),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([200, 409]);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(EventStatus.PUBLISHED);
    expect(await prisma.auditLog.count({ where: { targetId: event.id, action: "EVENT_APPROVED" } })).toBe(1);
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
    const event = await prisma.event.create({ data: { title: "Pending Approval", description: "A complete proposal awaiting a management decision.", categoryId, registrationUrl: "https://forms.example/pending", eventDate: new Date("2026-11-20"), startTime: "10:00", endTime: "12:00", venue: "Hall", primaryOrganizerAuthorizationId: authorization.id, organizerPublicName: authorization.approvedPublicName, status: EventStatus.PENDING_APPROVAL, submittedAt: new Date() } });
    const agent = request.agent(app);
    await agent.post("/admin/login").type("form").send({ username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    await agent.get("/admin/events").expect(200);
    const review = await agent.get(`/admin/events/${event.id}`).expect(200);
    expect(review.text).toContain("https://forms.example/pending");
    expect(review.text).toContain("Inspect this external destination manually");
    await agent.post(`/admin/events/${event.id}/approve`).set("Accept", "application/json").send({ expectedSubmittedAt: event.submittedAt!.toISOString() }).expect(200);
    const approved = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(approved.status).toBe(EventStatus.PUBLISHED);
    expect(approved.reviewerUserId).toBe(admin.id);
    expect(approved.reviewedAt).not.toBeNull();
    expect(approved.registrationUrl).toBe("https://forms.example/pending");
    expect(await prisma.auditLog.count({ where: { targetId: event.id, action: "EVENT_APPROVED" } })).toBe(1);
  });

  it("submits organizer and Management lifecycle forms without JavaScript", async () => {
    const { user, authorization } = await setupOrganizer();
    const draft = await prisma.event.create({ data: {
      title: "No Script Lifecycle",
      description: "A complete event used to exercise server-rendered CSRF fields.",
      categoryId,
      eventDate: new Date("2026-11-20"),
      startTime: "10:00",
      endTime: "12:00",
      venue: "Hall",
      primaryOrganizerAuthorizationId: authorization.id,
      organizerPublicName: authorization.approvedPublicName,
    } });
    const organizer = supertest.agent(app);
    const memberLogin = await organizer.get("/login").expect(200);
    const memberLoginToken = memberLogin.text.match(/name="_csrf" value="([A-Za-z0-9_-]{43})"/)?.[1];
    await organizer.post("/login").type("form").send({ _csrf: memberLoginToken, matricNumber: user.matricNumber, password: "password123" }).expect(302);
    const organizerList = await organizer.get("/organizer/events").expect(200);
    const organizerToken = organizerList.text.match(/name="_csrf" value="([A-Za-z0-9_-]{43})"/)?.[1];
    expect(organizerToken).toBeTruthy();
    await organizer.post(`/organizer/events/${draft.id}/submit`).type("form").send({ _csrf: organizerToken }).expect(302);
    const submitted = await prisma.event.findUniqueOrThrow({ where: { id: draft.id } });

    const admin = await createMember({ admin: true });
    const management = supertest.agent(app);
    const adminLogin = await management.get("/admin/login").expect(200);
    const adminLoginToken = adminLogin.text.match(/name="_csrf" value="([A-Za-z0-9_-]{43})"/)?.[1];
    await management.post("/admin/login").type("form").send({ _csrf: adminLoginToken, username: admin.managementUsername, password: "SecureAdminPassword!" }).expect(302);
    const review = await management.get(`/admin/events/${draft.id}`).expect(200);
    const managementToken = review.text.match(/name="_csrf" value="([A-Za-z0-9_-]{43})"/)?.[1];
    expect(managementToken).toBeTruthy();
    expect(review.text).toContain(`name="expectedSubmittedAt" value="${submitted.submittedAt!.toISOString()}"`);
    await management.post(`/admin/events/${draft.id}/approve`).type("form").send({
      _csrf: managementToken,
      expectedSubmittedAt: submitted.submittedAt!.toISOString(),
    }).expect(302);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(EventStatus.PUBLISHED);
  });

  it("keeps a suggested department private until Management approves the event", async () => {
    const { user } = await setupOrganizer();
    const organizer = await login(user.matricNumber!);
    await organizer.post("/organizer/events").field(payload({
      title: "Marine Innovation Day",
      targetDepartmentIds: [],
      suggestedDepartmentName: "Marine Engineering",
      suggestedDepartmentCode: "mre",
    })).attach("poster", PNG_POSTER, { filename: "poster.png", contentType: "image/png" }).expect(302);
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
    const submittedDraft = await prisma.event.findUniqueOrThrow({ where: { id: draft.id } });
    await management.post(`/admin/events/${draft.id}/approve`).type("form").send({ expectedSubmittedAt: submittedDraft.submittedAt!.toISOString() }).expect(302);

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
    await agent.post(`/admin/events/${event.id}/approve`).set("Accept", "application/json").send({ expectedSubmittedAt: event.submittedAt!.toISOString() }).expect(409);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(EventStatus.PENDING_APPROVAL);
    await agent.post(`/admin/events/${event.id}/reject`).set("Accept", "application/json").send({ expectedSubmittedAt: event.submittedAt!.toISOString(), rejectionReason: "The organizer authorization is no longer active." }).expect(200);
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
    await agent.post(`/admin/events/${event.id}/reject`).set("Accept", "application/json").send({ expectedSubmittedAt: event.submittedAt!.toISOString(), rejectionReason: "no" }).expect(400);
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
