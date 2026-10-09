/**
 * Shared Prisma client instance for the YCEP application.
 *
 * Uses @prisma/adapter-pg to connect Prisma 7 to PostgreSQL.
 * The connection pool and client are created lazily and exported
 * for use across the application.
 */
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const connectionString =
  process.env.NODE_ENV === "test" && process.env.TEST_DATABASE_URL
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

export function databasePoolOptions(environment = process.env.NODE_ENV): pg.PoolConfig {
  return environment === "production"
    ? {
        connectionString,
        max: 5,
        min: 0,
        connectionTimeoutMillis: 15_000,
        idleTimeoutMillis: 10_000,
        allowExitOnIdle: true,
      }
    : { connectionString };
}

const pool = new pg.Pool(databasePoolOptions());
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
export { pool };
