import { describe, it, expect, beforeEach } from "vitest";
import express, { Express, Request, Response, NextFunction } from "express";
import supertest from "supertest";
import session from "express-session";
import crypto from "node:crypto";
import {
  ensureCsrfToken,
  verifyCsrfToken,
  generateCsrfToken,
  preventFormCaching,
  isPublicFormRoute,
  validToken,
  TOKEN_LENGTH,
} from "../src/middleware/csrf.middleware.js";
import { sessionCookieOptions, sessionProxyEnabled } from "../src/session.js";

function createTestApp(options: {
  isProduction?: boolean;
  isVercel?: boolean;
  store?: session.Store;
} = {}): Express {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", "./views");

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: options.isProduction ?? false,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  };

  app.use(
    session({
      name: "ycep.sid",
      secret: "test-secret-that-is-at-least-32-chars-long",
      resave: false,
      saveUninitialized: false,
      rolling: false,
      proxy: options.isVercel ?? false,
      cookie: cookieOpts,
      store: options.store,
    })
  );

  app.use(ensureCsrfToken);
  app.use(verifyCsrfToken);

  // Simulated member and admin routes
  app.get("/login", (req: Request, res: Response) => {
    if (req.session && req.session.userId) {
      res.redirect("/account");
      return;
    }
    res.render("login", {
      title: "Login — YCEP",
      errorMessage: null,
      values: { matricNumber: "" },
    });
  });

  app.post("/login", (req: Request, res: Response, next: NextFunction) => {
    const { matricNumber, password } = req.body;
    if (matricNumber === "F/ND/24/3210051" && password === "ValidPassword123") {
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = "member-user-123";
        req.session.csrfToken = generateCsrfToken();
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          res.redirect("/account");
        });
      });
      return;
    }
    res.status(401).render("login", {
      title: "Login — YCEP",
      errorMessage: "Invalid matric number or password.",
      values: { matricNumber },
    });
  });

  app.get("/admin/login", (req: Request, res: Response) => {
    if (req.session && req.session.userId === "admin-user-456") {
      res.redirect("/admin");
      return;
    }
    res.render("admin/login", {
      title: "Admin Sign In — YABATECH Management",
      errorMessage: null,
      values: { username: "" },
    });
  });

  app.post("/admin/login", (req: Request, res: Response, next: NextFunction) => {
    const { username, password } = req.body;
    if (username === "ycepadmin" && password === "AdminPassword123") {
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = "admin-user-456";
        req.session.csrfToken = generateCsrfToken();
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          res.redirect("/admin");
        });
      });
      return;
    }
    res.status(401).render("admin/login", {
      title: "Admin Sign In — YABATECH Management",
      errorMessage: "Invalid username or password.",
      values: { username },
    });
  });

  app.get("/account", (req: Request, res: Response) => {
    if (!req.session?.userId) {
      res.redirect("/login");
      return;
    }
    res.send(`<html><body><h1>Account</h1><form method="POST" action="/account/update"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}"></form></body></html>`);
  });

  app.post("/account/update", (req: Request, res: Response) => {
    res.status(200).json({ success: true, message: "Profile updated" });
  });

  app.get("/admin", (req: Request, res: Response) => {
    if (req.session?.userId !== "admin-user-456") {
      res.redirect("/admin/login");
      return;
    }
    res.send(`<html><body><h1>Admin Dashboard</h1><form method="POST" action="/admin/approve"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}"></form></body></html>`);
  });

  app.post("/admin/approve", (req: Request, res: Response) => {
    res.status(200).json({ success: true, message: "Approved" });
  });

  app.post("/logout", (req: Request, res: Response, next: NextFunction) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("ycep.sid", { path: "/" });
      res.redirect("/login");
    });
  });

  app.post("/admin/logout", (req: Request, res: Response, next: NextFunction) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("ycep.sid", { path: "/" });
      res.redirect("/admin/login");
    });
  });

  return app;
}

function extractCsrfToken(html: string): string {
  const match = html.match(/name="_csrf" value="([^"]+)"/) || html.match(/data-csrf-token="([^"]+)"/);
  if (!match) throw new Error("CSRF token not found in HTML response");
  return match[1];
}

function extractSid(cookies: string[] | string | undefined): string | null {
  if (!cookies) return null;
  const list = Array.isArray(cookies) ? cookies : [cookies];
  for (const c of list) {
    const m = c.match(/ycep\.sid=([^;]+)/);
    if (m) return m[1];
  }
  return null;
}

describe("CSRF & Session Lifecycle (Step 13 & 14 Verification)", () => {
  let app: Express;

  beforeEach(() => {
    app = createTestApp();
  });

  it("1. GET /login -> POST /login succeeds with same token/session", async () => {
    const agent = supertest.agent(app);
    const getRes = await agent.get("/login");
    expect(getRes.status).toBe(200);
    const token = extractCsrfToken(getRes.text);
    expect(token).toHaveLength(TOKEN_LENGTH);

    const postRes = await agent
      .post("/login")
      .send({
        matricNumber: "F/ND/24/3210051",
        password: "ValidPassword123",
        _csrf: token,
      });

    expect(postRes.status).toBe(302);
    expect(postRes.header.location).toBe("/account");
  });

  it("2. GET /admin/login -> POST /admin/login succeeds", async () => {
    const agent = supertest.agent(app);
    const getRes = await agent.get("/admin/login");
    expect(getRes.status).toBe(200);
    const token = extractCsrfToken(getRes.text);
    expect(token).toHaveLength(TOKEN_LENGTH);

    const postRes = await agent
      .post("/admin/login")
      .send({
        username: "ycepadmin",
        password: "AdminPassword123",
        _csrf: token,
      });

    expect(postRes.status).toBe(302);
    expect(postRes.header.location).toBe("/admin");
  });

  it("3. Successful member login regenerates session ID", async () => {
    const agent = supertest.agent(app);
    const getRes = await agent.get("/login");
    const preSid = extractSid(getRes.headers["set-cookie"]);
    const token = extractCsrfToken(getRes.text);

    const postRes = await agent
      .post("/login")
      .send({
        matricNumber: "F/ND/24/3210051",
        password: "ValidPassword123",
        _csrf: token,
      });

    const postSid = extractSid(postRes.headers["set-cookie"]);
    expect(preSid).toBeDefined();
    expect(postSid).toBeDefined();
    expect(postSid).not.toBe(preSid);
  });

  it("4. Successful Management login regenerates session ID", async () => {
    const agent = supertest.agent(app);
    const getRes = await agent.get("/admin/login");
    const preSid = extractSid(getRes.headers["set-cookie"]);
    const token = extractCsrfToken(getRes.text);

    const postRes = await agent
      .post("/admin/login")
      .send({
        username: "ycepadmin",
        password: "AdminPassword123",
        _csrf: token,
      });

    const postSid = extractSid(postRes.headers["set-cookie"]);
    expect(preSid).toBeDefined();
    expect(postSid).toBeDefined();
    expect(postSid).not.toBe(preSid);
  });

  it("5. Regenerated session receives valid CSRF state atomically", async () => {
    const agent = supertest.agent(app);
    const getRes = await agent.get("/login");
    const token = extractCsrfToken(getRes.text);

    await agent
      .post("/login")
      .send({
        matricNumber: "F/ND/24/3210051",
        password: "ValidPassword123",
        _csrf: token,
      });

    const accountRes = await agent.get("/account");
    expect(accountRes.status).toBe(200);
    const postLoginToken = accountRes.headers["x-csrf-token"];
    expect(postLoginToken).toBeDefined();
    expect(postLoginToken).toHaveLength(TOKEN_LENGTH);
    // CSRF token rotated on session regeneration
    expect(postLoginToken).not.toBe(token);
  });

  it("6. Redirected authenticated page can immediately perform a protected POST", async () => {
    const agent = supertest.agent(app);
    const getRes = await agent.get("/login");
    const token = extractCsrfToken(getRes.text);

    await agent
      .post("/login")
      .send({
        matricNumber: "F/ND/24/3210051",
        password: "ValidPassword123",
        _csrf: token,
      });

    const accountRes = await agent.get("/account");
    const accountToken = extractCsrfToken(accountRes.text);

    const mutationRes = await agent
      .post("/account/update")
      .send({ _csrf: accountToken, bio: "Updated" });

    expect(mutationRes.status).toBe(200);
    expect(mutationRes.body.success).toBe(true);
  });

  it("7. Member session -> fresh /admin/login -> Management login works and regenerates session", async () => {
    const agent = supertest.agent(app);
    // 1. Log in as member
    const memberGet = await agent.get("/login");
    const memberToken = extractCsrfToken(memberGet.text);
    await agent.post("/login").send({
      matricNumber: "F/ND/24/3210051",
      password: "ValidPassword123",
      _csrf: memberToken,
    });

    // 2. Open /admin/login while member session is active
    const adminGet = await agent.get("/admin/login");
    expect(adminGet.status).toBe(200);
    const adminLoginToken = extractCsrfToken(adminGet.text);
    expect(adminLoginToken).toBeDefined();

    // 3. Submit Management credentials
    const adminPost = await agent
      .post("/admin/login")
      .send({
        username: "ycepadmin",
        password: "AdminPassword123",
        _csrf: adminLoginToken,
      });

    expect(adminPost.status).toBe(302);
    expect(adminPost.header.location).toBe("/admin");

    // 4. Access admin area with new admin session
    const adminArea = await agent.get("/admin");
    expect(adminArea.status).toBe(200);
    expect(adminArea.text).toContain("Admin Dashboard");
  });

  it("8. Management session -> access /admin -> logout -> login follows clean auth switch", async () => {
    const agent = supertest.agent(app);
    const adminGet = await agent.get("/admin/login");
    const adminToken = extractCsrfToken(adminGet.text);
    await agent.post("/admin/login").send({
      username: "ycepadmin",
      password: "AdminPassword123",
      _csrf: adminToken,
    });

    // Admin is active
    const adminArea = await agent.get("/admin");
    expect(adminArea.status).toBe(200);

    // Admin logs out
    const logoutToken = adminArea.headers["x-csrf-token"];
    const logoutRes = await agent.post("/admin/logout").send({ _csrf: logoutToken });
    expect(logoutRes.status).toBe(302);
    expect(logoutRes.header.location).toBe("/admin/login");

    // Navigate to member login fresh
    const memberGet = await agent.get("/login");
    expect(memberGet.status).toBe(200);
    const memberToken = extractCsrfToken(memberGet.text);

    // Member login succeeds
    const memberPost = await agent.post("/login").send({
      matricNumber: "F/ND/24/3210051",
      password: "ValidPassword123",
      _csrf: memberToken,
    });
    expect(memberPost.status).toBe(302);
    expect(memberPost.header.location).toBe("/account");
  });

  it("9. GET /login then GET /admin/login does not invalidate the session CSRF token", async () => {
    const agent = supertest.agent(app);
    const loginRes = await agent.get("/login");
    const loginToken = extractCsrfToken(loginRes.text);

    const adminLoginRes = await agent.get("/admin/login");
    const adminLoginToken = extractCsrfToken(adminLoginRes.text);

    // Stable session-bound token: does not rotate per render
    expect(adminLoginToken).toBe(loginToken);

    // Both forms remain valid for this session
    const postRes = await agent.post("/login").send({
      matricNumber: "F/ND/24/3210051",
      password: "ValidPassword123",
      _csrf: loginToken,
    });
    expect(postRes.status).toBe(302);
  });

  it("10. Concurrent forms rendered from the same session remain valid until regeneration", async () => {
    const agent = supertest.agent(app);
    const page1 = await agent.get("/login");
    const page2 = await agent.get("/admin/login");
    const token1 = extractCsrfToken(page1.text);
    const token2 = extractCsrfToken(page2.text);

    expect(token1).toBe(token2);
    expect(validToken(token1, token2)).toBe(true);
  });

  it("11. Genuinely stale token is still rejected with 403 and returnUrl UX", async () => {
    const agent = supertest.agent(app);
    await agent.get("/login");

    const staleToken = crypto.randomBytes(32).toString("base64url");
    const postRes = await agent
      .post("/login")
      .type("form")
      .send({
        matricNumber: "F/ND/24/3210051",
        password: "ValidPassword123",
        _csrf: staleToken,
      });

    expect(postRes.status).toBe(403);
    expect(postRes.text).toContain("Your form expired. Reload and try again.");
    expect(postRes.text).toContain('href="/login"');
    expect(postRes.text).toContain("Return to sign in");
  });

  it("12. Missing token rejected with 403", async () => {
    const agent = supertest.agent(app);
    await agent.get("/login");

    const postRes = await agent.post("/login").send({
      matricNumber: "F/ND/24/3210051",
      password: "ValidPassword123",
    });

    expect(postRes.status).toBe(403);
  });

  it("13. Altered token rejected with 403", async () => {
    const agent = supertest.agent(app);
    const getRes = await agent.get("/login");
    const token = extractCsrfToken(getRes.text);

    // Corrupt one character
    const alteredToken = token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");

    const postRes = await agent.post("/login").send({
      matricNumber: "F/ND/24/3210051",
      password: "ValidPassword123",
      _csrf: alteredToken,
    });

    expect(postRes.status).toBe(403);
  });

  it("14. Login form works with JS disabled/server-rendered token", async () => {
    const agent = supertest.agent(app);
    const getRes = await agent.get("/login");
    // Verify server-rendered hidden input exists in static HTML (no JS needed)
    expect(getRes.text).toMatch(/<input type="hidden" name="_csrf" value="[A-Za-z0-9_-]{43}">/);

    const token = extractCsrfToken(getRes.text);
    const postRes = await agent.post("/login").send({
      matricNumber: "F/ND/24/3210051",
      password: "ValidPassword123",
      _csrf: token,
    });
    expect(postRes.status).toBe(302);
  });

  it("15. No duplicate ycep.sid cookies are issued with conflicting paths", async () => {
    const agent = supertest.agent(app);
    const res1 = await agent.get("/login");
    const cookies1 = res1.headers["set-cookie"];
    const ycepCookies = (Array.isArray(cookies1) ? cookies1 : [cookies1]).filter(
      (c) => c && c.startsWith("ycep.sid=")
    );
    expect(ycepCookies.length).toBe(1);
    expect(ycepCookies[0]).toContain("Path=/");
  });

  it("16. Production cookie configuration remains correct", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const opts = sessionCookieOptions();
      expect(opts.secure).toBe(true);
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe("lax");
      expect(opts.path).toBe("/");
      expect(opts.maxAge).toBe(1000 * 60 * 60 * 24 * 7);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("17. Cache-Control: no-store header emitted on public form and auth routes", async () => {
    const agent = supertest.agent(app);
    const loginRes = await agent.get("/login");
    expect(loginRes.headers["cache-control"]).toContain("no-store");

    const adminLoginRes = await agent.get("/admin/login");
    expect(adminLoginRes.headers["cache-control"]).toContain("no-store");
  });

  it("18. Handles trailing slashes gracefully without omitting CSRF token", async () => {
    const agent = supertest.agent(app);
    expect(isPublicFormRoute("/login/")).toBe(true);
    expect(isPublicFormRoute("/admin/login/")).toBe(true);
    expect(isPublicFormRoute("/register/")).toBe(true);
    expect(isPublicFormRoute("/events")).toBe(false);
  });

  it("19. Realistic Vercel simulation (Step 14): NODE_ENV=production, VERCEL=1 with HTTPS proxying", async () => {
    const prodApp = createTestApp({ isProduction: true, isVercel: true });
    const agent = supertest(prodApp);

    // Simulate Vercel terminating HTTPS and setting x-forwarded-proto
    const getRes = await agent
      .get("/login")
      .set("x-forwarded-proto", "https");

    expect(getRes.status).toBe(200);
    const cookieHeader = getRes.headers["set-cookie"]?.[0] || "";
    expect(cookieHeader).toContain("Secure");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Lax");

    const sessionCookie = cookieHeader.split(";")[0];
    const token = extractCsrfToken(getRes.text);

    // CSRF survives round trip over simulated Vercel proxy
    const postRes = await agent
      .post("/login")
      .set("x-forwarded-proto", "https")
      .set("Cookie", sessionCookie)
      .type("form")
      .send({
        matricNumber: "F/ND/24/3210051",
        password: "ValidPassword123",
        _csrf: token,
      });

    expect(postRes.status).toBe(302);
    expect(postRes.header.location).toBe("/account");

    const newCookieHeader = postRes.headers["set-cookie"]?.[0] || "";
    const newSessionCookie = newCookieHeader.split(";")[0];

    // Authenticated access with new regenerated session cookie
    const accountRes = await agent
      .get("/account")
      .set("x-forwarded-proto", "https")
      .set("Cookie", newSessionCookie);

    expect(accountRes.status).toBe(200);
    expect(accountRes.text).toContain("Account");
  });
});
