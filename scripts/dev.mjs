#!/usr/bin/env node

/**
 * Development script: starts Python backend, Next.js dev server, and Electron concurrently.
 *
 * Usage: node scripts/dev.mjs
 *
 * You can also run each part separately:
 *   - Python backend: npm run dev:python (or: uv run python -m backend.main)
 *   - Next.js: npm run dev
 *   - Electron: wait for Next.js, then run `electron .`
 */

import { spawn } from "child_process";

const processes = [];

function run(name, cmd, args, opts = {}) {
  const proc = spawn(cmd, args, {
    stdio: "inherit",
    shell: true,
    ...opts,
  });
  proc.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
  });
  processes.push(proc);
  return proc;
}

// Start Python backend
run("python", "uv", ["run", "python", "-m", "backend.main"], {
  cwd: process.cwd(),
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
});

// Start Next.js dev server
run("nextjs", "npx", ["next", "dev"]);

// Clean up on exit
process.on("SIGINT", () => {
  processes.forEach((p) => p.kill("SIGTERM"));
  process.exit(0);
});

process.on("SIGTERM", () => {
  processes.forEach((p) => p.kill("SIGTERM"));
  process.exit(0);
});
