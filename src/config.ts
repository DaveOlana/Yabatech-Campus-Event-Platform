import "dotenv/config";

export type NodeEnvironment = "development" | "test" | "production";

function nodeEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeEnvironment {
  const value = environment.NODE_ENV || "development";
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

export function validateRuntimeEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  const runtimeNodeEnvironment = nodeEnvironment(environment);
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL environment variable is required");
  if (runtimeNodeEnvironment === "test" && !environment.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL environment variable is required during tests");
  if (runtimeNodeEnvironment === "production" && (!environment.SESSION_SECRET || environment.SESSION_SECRET.length < 32)) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  if (runtimeNodeEnvironment === "production" && !environment.BLOB_STORE_ID?.trim()) {
    throw new Error("BLOB_STORE_ID is required in production");
  }
  if (runtimeNodeEnvironment === "production" && !environment.VERCEL_OIDC_TOKEN?.trim()) {
    throw new Error("VERCEL_OIDC_TOKEN is required in production");
  }
  if (runtimeNodeEnvironment === "production" && !environment.BLOB_WEBHOOK_PUBLIC_KEY?.trim()) {
    throw new Error("BLOB_WEBHOOK_PUBLIC_KEY is required in production");
  }
  if (runtimeNodeEnvironment === "production" && (!environment.CRON_SECRET || environment.CRON_SECRET.length < 16)) {
    throw new Error("CRON_SECRET must be at least 16 characters in production");
  }
  if (environment.TRUST_PROXY) throw new Error("TRUST_PROXY is not supported until the deployment topology is approved");
}
