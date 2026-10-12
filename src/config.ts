import "dotenv/config";

export type NodeEnvironment = "development" | "test" | "production";

function nodeEnvironment(): NodeEnvironment {
  const value = process.env.NODE_ENV || "development";
  if (!(["development", "test", "production"] as string[]).includes(value)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  return value as NodeEnvironment;
}

function port(): number {
  const value = Number(process.env.PORT || 3000);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error("PORT must be an integer from 1 to 65535");
  return value;
}

export const config = {
  nodeEnv: nodeEnvironment(),
  port: port(),
  isProduction: (process.env.NODE_ENV || "development") === "production",
};

export function validateRuntimeEnvironment(): void {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL environment variable is required");
  if (config.nodeEnv === "test" && !process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL environment variable is required during tests");
  if (config.isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  if (config.isProduction && !process.env.BLOB_STORE_ID) {
    throw new Error("BLOB_STORE_ID environment variable is required in production");
  }
  if (config.isProduction && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error("VERCEL_OIDC_TOKEN environment variable is required in production");
  }
  if (config.isProduction && !process.env.BLOB_WEBHOOK_PUBLIC_KEY) {
    throw new Error("BLOB_WEBHOOK_PUBLIC_KEY environment variable is required in production");
  }
  if (config.isProduction && (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16)) {
    throw new Error("CRON_SECRET must be at least 16 characters in production");
  }
  if (process.env.TRUST_PROXY) throw new Error("TRUST_PROXY is not supported until the deployment topology is approved");
}
