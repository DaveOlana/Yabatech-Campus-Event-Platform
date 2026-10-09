/**
 * Apply migrations to the test database.
 * Usage: npx tsx scripts/migrate-test.ts
 *
 * This script overrides DATABASE_URL with TEST_DATABASE_URL
 * before invoking prisma migrate deploy.
 */
import dotenv from "dotenv";
import { execSync } from "child_process";

dotenv.config();

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error("TEST_DATABASE_URL is not set in .env");
  process.exit(1);
}

console.log("Applying migrations to test database...");

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: testUrl,
    DIRECT_DATABASE_URL: testUrl,
  },
});

console.log("Test database migrations applied successfully.");
