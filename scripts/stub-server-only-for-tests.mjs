#!/usr/bin/env node
// The real `server-only` package unconditionally throws when required under
// plain `node` (it only resolves to a no-op via the bundler-only "react-server"
// export condition that Next.js/webpack apply during `next build`). The test
// suite compiles lib/*.ts with plain tsc and runs the output with `node --test`,
// with no bundler in the loop, so any file that does `import "server-only"`
// (e.g. lib/supabase-server.ts) would always crash under test.
//
// This installs a local no-op stub inside the isolated .tmp/tests compile
// output only. Node's module resolution checks node_modules relative to the
// requiring file before walking up to the real node_modules/server-only, so
// this shadows the real package for the test sandbox without touching the
// actual dependency the production Next.js build relies on to catch
// accidental client-component imports.
// Accepts an optional target directory (relative to cwd) as argv[2] so the
// same stub can shadow "server-only" inside any plain-tsc compile output,
// not just .tmp/tests — e.g. .tmp/jobs, used by
// `npm run job:check-evidence-freshness` to compile
// lib/safe-fetch-external-source.ts for a cron script.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const targetDir = process.argv[2] || join(".tmp", "tests");
const stubDir = join(process.cwd(), targetDir, "node_modules", "server-only");
mkdirSync(stubDir, { recursive: true });
writeFileSync(join(stubDir, "package.json"), JSON.stringify({ name: "server-only", version: "0.0.1", main: "index.js" }));
writeFileSync(join(stubDir, "index.js"), "module.exports = {};\n");
