import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "../src/db.js";
import { prunePosters } from "../src/services/poster-cleanup.service.js";

const directlyExecuted = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (directlyExecuted) {
  prunePosters()
    .then((result) => console.log(`Pruned ${result.processed} poster asset(s); ${result.failures} deletion failure(s).`))
    .catch((error: Error) => { console.error(`Poster pruning failed: ${error.name}`); process.exitCode = 1; })
    .finally(() => pool.end());
}
