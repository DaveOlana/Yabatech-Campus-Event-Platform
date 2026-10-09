import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { pool } from "./db.js";

const PgSession = connectPgSimple(session);

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

/**
 * Ensures the PostgreSQL session table exists for connect-pg-simple.
 */
export async function ensureSessionTable(pgPool: pg.Pool = pool): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
}

export function sessionStoreOptions(pgPool: pg.Pool = pool) {
  const production = process.env.NODE_ENV === "production";
  return {
    pool: pgPool,
    tableName: "session",
    createTableIfMissing: !production,
    pruneSessionInterval: production ? false as const : 15 * 60,
  };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  };
}

export function sessionProxyEnabled(): boolean {
  return process.env.VERCEL === "1";
}

/**
 * Creates the express-session middleware backed by PostgreSQL via connect-pg-simple.
 *
 * Rules:
 * - Cookie is HTTP-only
 * - SameSite=Lax
 * - Secure in production
 * - Usable over normal HTTP in development/testing
 */
export function createSessionMiddleware(pgPool: pg.Pool = pool) {
  const configuredSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  const secret = configuredSecret || "ycep-dev-default-secret-do-not-use-in-production";

  const store = new PgSession(sessionStoreOptions(pgPool));

  return session({
    store,
    name: "ycep.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    proxy: sessionProxyEnabled(),
    cookie: sessionCookieOptions(),
  });
}
