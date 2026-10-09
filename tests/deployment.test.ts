import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import request from "supertest";
import { app } from "../src/app.js";
import { pool, databasePoolOptions, prisma } from "../src/db.js";
import { migrationDatabaseUrl } from "../prisma.config.js";
import { normalizedClientAddress } from "../src/middleware/rate-limit.middleware.js";
import { sessionCookieOptions, sessionProxyEnabled, sessionStoreOptions } from "../src/session.js";
import { pruneExpiredSessions } from "../scripts/prune-sessions.js";
import {
  PRODUCTION_DEPARTMENTS, PRODUCTION_SEMESTERS, internalDepartmentCode,
  productionReferenceInput, seedProductionReferenceData,
} from "../scripts/seed-production-reference.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalVercel = process.env.VERCEL;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = originalVercel;
  vi.restoreAllMocks();
});

describe("Milestone 5C deployment configuration", () => {
  it("prefers the direct migration URL while retaining the local fallback", () => {
    expect(migrationDatabaseUrl({ DATABASE_URL: "pooled", DIRECT_DATABASE_URL: "direct" })).toBe("direct");
    expect(migrationDatabaseUrl({ DATABASE_URL: "local" })).toBe("local");
  });

  it("uses a bounded production pool", () => {
    const options = databasePoolOptions("production");
    expect(options).toMatchObject({ max: 5, min: 0, connectionTimeoutMillis: 15_000, idleTimeoutMillis: 10_000, allowExitOnIdle: true });
  });

  it("disables production table creation and pruning while preserving secure cookies", () => {
    process.env.NODE_ENV = "production";
    expect(sessionStoreOptions()).toMatchObject({ tableName: "session", createTableIfMissing: false, pruneSessionInterval: false });
    expect(sessionCookieOptions()).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 604_800_000 });
    process.env.NODE_ENV = "development";
    expect(sessionStoreOptions()).toMatchObject({ createTableIfMissing: true, pruneSessionInterval: 900 });
    expect(sessionCookieOptions().secure).toBe(false);
    process.env.VERCEL = "1"; expect(sessionProxyEnabled()).toBe(true);
    delete process.env.VERCEL; expect(sessionProxyEnabled()).toBe(false);
  });

  it("trusts one valid Vercel-controlled address and ignores generic or malformed forwarding", () => {
    const makeRequest = (headers: Record<string, string>, remoteAddress = "127.0.0.9") => ({
      get: (name: string) => headers[name.toLowerCase()], socket: { remoteAddress }, ip: remoteAddress,
    } as unknown as Request);
    process.env.VERCEL = "1";
    expect(normalizedClientAddress(makeRequest({ "x-vercel-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(normalizedClientAddress(makeRequest({ "x-vercel-forwarded-for": "203.0.113.7, 198.51.100.4" }))).toContain("127.0.0.9");
    delete process.env.VERCEL;
    expect(normalizedClientAddress(makeRequest({ "x-forwarded-for": "203.0.113.8" }))).toContain("127.0.0.9");
  });

  it("returns minimal readiness success and failure responses", async () => {
    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
    expect((await request(app).get("/ready")).body).toEqual({ status: "ready" });
    vi.spyOn(pool, "query").mockRejectedValueOnce(new Error("secret database detail"));
    const unavailable = await request(app).get("/ready").expect(503);
    expect(unavailable.body).toEqual({ status: "unavailable" });
    expect(unavailable.text).not.toContain("secret database detail");
  });

  it("requires explicit valid academic-cycle values", () => {
    expect(() => productionReferenceInput({})).toThrow(/required/);
    expect(() => productionReferenceInput({ YCEP_ACADEMIC_CYCLE_NAME: "2026/2027", YCEP_ACADEMIC_CYCLE_START: "bad", YCEP_ACADEMIC_CYCLE_END: "2027-08-31" })).toThrow(/valid/);
  });

  it("prunes only expired sessions", async () => {
    await pool.query('INSERT INTO "session" (sid, sess, expire) VALUES ($1, $2, NOW() - INTERVAL \'1 minute\'), ($3, $4, NOW() + INTERVAL \'1 hour\') ON CONFLICT (sid) DO UPDATE SET expire = EXCLUDED.expire', ["deployment-expired", {}, "deployment-live", {}]);
    expect(await pruneExpiredSessions()).toBeGreaterThanOrEqual(1);
    expect((await pool.query('SELECT sid FROM "session" WHERE sid = $1', ["deployment-expired"])).rowCount).toBe(0);
    expect((await pool.query('SELECT sid FROM "session" WHERE sid = $1', ["deployment-live"])).rowCount).toBe(1);
    await pool.query('DELETE FROM "session" WHERE sid = $1', ["deployment-live"]);
  });

  it("uses deterministic internal department codes", () => {
    expect(internalDepartmentCode("Computer Science")).toBe("YCEP-COMPUTER-SCIENCE");
    expect(new Set(PRODUCTION_DEPARTMENTS.map(internalDepartmentCode)).size).toBe(PRODUCTION_DEPARTMENTS.length);
  });

  it("seeds canonical reference data idempotently and preserves approved additions", async () => {
    const beforeUsers = await prisma.user.count(); const beforeEvents = await prisma.event.count();
    const existing = await prisma.department.upsert({ where: { code: "MGMT-ADDED" }, update: {}, create: { name: "Management Approved Programme", code: "MGMT-ADDED" } });
    const input = { cycleName: "DEPLOYMENT-TEST-CYCLE", cycleStart: new Date("2030-01-01T00:00:00Z"), cycleEnd: new Date("2030-12-31T23:59:59Z") };
    await seedProductionReferenceData(input); await seedProductionReferenceData(input);
    expect(await prisma.academicSemester.findMany({ orderBy: { code: "asc" } })).toHaveLength(2);
    expect((await prisma.academicSemester.findMany({ select: { name: true } })).map((item) => item.name).sort()).toEqual(PRODUCTION_SEMESTERS.map((item) => item.name).sort());
    for (const name of PRODUCTION_DEPARTMENTS) expect(await prisma.department.count({ where: { name } })).toBe(1);
    expect(await prisma.department.findUnique({ where: { id: existing.id } })).not.toBeNull();
    expect(await prisma.user.count()).toBe(beforeUsers); expect(await prisma.event.count()).toBe(beforeEvents);
  });
});
