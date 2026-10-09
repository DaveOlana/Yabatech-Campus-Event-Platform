import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma, pool } from "../src/db.js";
import { syncProductionDepartments } from "./seed-production-reference.js";

export async function syncDepartments(): Promise<{ created: number; preserved: number; total: number }> {
  return prisma.$transaction((tx) => syncProductionDepartments(tx));
}

const directlyExecuted = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (directlyExecuted) {
  syncDepartments()
    .then(({ created, preserved, total }) => {
      console.log(`Department catalogue ready: ${created} created, ${preserved} already present, ${total} total.`);
    })
    .catch((error: Error) => {
      console.error(`Department catalogue sync failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
      await pool.end();
    });
}
