// Vercel serverless entrypoint — production only.
// Vercel's Node.js runtime detects this file and wraps the exported Express
// app in a Fluid-compute function. No `app.listen()` call is made here;
// the local server.ts file handles that separately for development.
//
// Node File Trace (nft) bundles this file and its transitive imports at
// deploy time, so the compiled views/ directory is declared in vercel.json
// via `includeFiles` to ensure EJS templates are included in the bundle.

import 'dotenv/config';
import { app } from '../src/app.js';

export default app;
