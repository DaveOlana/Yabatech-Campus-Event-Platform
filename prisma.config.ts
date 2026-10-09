import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export function migrationDatabaseUrl(environment = process.env): string {
  return environment.DIRECT_DATABASE_URL || environment.DATABASE_URL || "";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationDatabaseUrl() || env("DATABASE_URL"),
  },
});
