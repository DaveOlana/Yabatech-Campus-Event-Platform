import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  absWorkingDir: repositoryRoot,
  entryPoints: [path.join(repositoryRoot, "client", "poster-direct-upload.ts")],
  outfile: path.join(repositoryRoot, "public", "js", "poster-direct-upload.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
});
