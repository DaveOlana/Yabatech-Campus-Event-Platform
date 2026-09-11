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
  const secret =
    process.env.SESSION_SECRET || "ycep-dev-default-secret-do-not-use-in-production";

  const store = new PgSession({
    pool: pgPool,
    tableName: "session",
    createTableIfMissing: true,
  });

  return session({
    store,
    name: "ycep.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  });
}
