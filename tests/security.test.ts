import { beforeAll, describe, expect, it } from "vitest";
import rawRequest from "supertest";
import { app } from "../src/app.js";
import { ensureSessionTable } from "../src/session.js";

function token(html: string): string {
  const value = html.match(/data-csrf-token="([A-Za-z0-9_-]{43})"/)?.[1];
  if (!value) throw new Error("Missing CSRF token");
  return value;
}

beforeAll(async () => ensureSessionTable());

describe("Milestone 5A security boundary", () => {
  it("rejects missing, incorrect, and unrelated-session CSRF tokens", async () => {
    await rawRequest(app).post("/login").send({ matricNumber: "x", password: "x" }).expect(403);
    const first = rawRequest.agent(app); const second = rawRequest.agent(app);
    const firstToken = token((await first.get("/login")).text);
    const secondToken = token((await second.get("/login")).text);
    await first.post("/login").set("X-CSRF-Token", secondToken).send({ matricNumber: "x", password: "x" }).expect(403);
    await first.post("/login").set("X-CSRF-Token", firstToken + "x").send({ matricNumber: "x", password: "x" }).expect(403);
  });

  it("allows a valid token to reach normal authentication validation", async () => {
    const agent = rawRequest.agent(app); const csrf = token((await agent.get("/login")).text);
    await agent.post("/login").set("X-CSRF-Token", csrf).send({ matricNumber: "unknown", password: "wrong" }).expect(401);
  });

  it("limits failed member and Management authentication independently", async () => {
    const member = rawRequest.agent(app); const memberCsrf = token((await member.get("/login")).text);
    for (let i = 0; i < 10; i++) await member.post("/login").set("X-CSRF-Token", memberCsrf).send({ matricNumber: "unknown", password: "wrong" }).expect(401);
    await member.post("/login").set("X-CSRF-Token", memberCsrf).send({ matricNumber: "unknown", password: "wrong" }).expect(429);
    const admin = rawRequest.agent(app); const adminCsrf = token((await admin.get("/admin/login")).text);
    for (let i = 0; i < 5; i++) await admin.post("/admin/login").set("X-CSRF-Token", adminCsrf).send({ email: "unknown@example.test", password: "wrong" }).expect(401);
    await admin.post("/admin/login").set("X-CSRF-Token", adminCsrf).send({ email: "unknown@example.test", password: "wrong" }).expect(429);
  });

  it("limits registration attempts without limiting public discovery", async () => {
    const agent = rawRequest.agent(app); const csrf = token((await agent.get("/register")).text);
    for (let i = 0; i < 5; i++) await agent.post("/register").set("X-CSRF-Token", csrf).send({}).expect(400);
    await agent.post("/register").set("X-CSRF-Token", csrf).send({}).expect(429);
    await agent.get("/").expect(200); await agent.get("/?q=security").expect(200);
  });

  it("sends the approved security headers", async () => {
    const response = await rawRequest(app).get("/").expect(200);
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["permissions-policy"]).toContain("camera=()");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["strict-transport-security"]).toBeUndefined();
  });

  it("handles malformed and oversized bodies without exposing parser errors", async () => {
    const malformed = await rawRequest(app).post("/login").set("Content-Type", "application/json").send('{');
    expect(malformed.status).toBe(400); expect(malformed.text).not.toContain("SyntaxError");
    const oversized = await rawRequest(app).post("/login").set("Content-Type", "application/json").send(JSON.stringify({ value: "x".repeat(40_000) }));
    expect(oversized.status).toBe(413); expect(oversized.text).not.toContain("PayloadTooLargeError");
  });
});
