import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "../src/db.js";

export async function pruneExpiredSessions(): Promise<number> {
  const result = await pool.query('DELETE FROM "session" WHERE "expire" < NOW()');
  return result.rowCount ?? 0;
}

const directlyExecuted = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (directlyExecuted) {
  pruneExpiredSessions()
    .then((count) => console.log(`Pruned ${count} expired session(s).`))
    .catch((error: Error) => { console.error(`Session pruning failed: ${error.message}`); process.exitCode = 1; })
    .finally(() => pool.end());
}
