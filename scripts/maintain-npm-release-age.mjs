#!/usr/bin/env node
// Maintain the npm release-age gate date.
//
// The governed runtime policy requires `before` in the effective npm config to
// equal now minus `min-release-age` days (±5 minutes) at verification time.
// npm only accepts absolute dates for `before`, so it must be refreshed
// continuously. This script keeps the operator's ~/.npmrc `before=` line
// current without touching anything else in that file.
//
// Modes:
//   (default) refresh ~/.npmrc `before` if missing or stale > 4 minutes
//   --check   exit 1 if missing or stale > 5 minutes; never write
//   --print   print the current and target values; never write
//
// Exit codes: 0 ok, 1 stale/missing (check mode), 2 tool failure.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const NPMRC = resolve(homedir(), ".npmrc");
const STALE_MS = 4 * 60 * 1000;
const HARD_STALE_MS = 5 * 60 * 1000;

const mode = process.argv[2] ?? "apply";

function npmConfigGet(key) {
  return execFileSync("npm", ["config", "get", key], { encoding: "utf8" }).trim();
}

function targetBeforeMs(minReleaseAgeDays) {
  return Date.now() - minReleaseAgeDays * 24 * 60 * 60 * 1000;
}

try {
  const minAgeRaw = npmConfigGet("min-release-age");
  const minAgeDays = Number(minAgeRaw);
  if (!Number.isFinite(minAgeDays) || minAgeDays < 7) {
    console.error(`maintain-npm-release-age: min-release-age must be >= 7 days (observed '${minAgeRaw}')`);
    process.exit(2);
  }

  const targetMs = targetBeforeMs(minAgeDays);
  const targetIso = new Date(targetMs).toISOString();
  const currentRaw = npmConfigGet("before");
  const currentMs = Date.parse(currentRaw);
  const ageErrorMs = currentMs ? Math.abs(Date.now() - minAgeDays * 86400000 - currentMs) : Infinity;

  if (mode === "--print") {
    console.log(`min-release-age: ${minAgeDays} days`);
    console.log(`before (current): ${currentRaw}`);
    console.log(`before (target):  ${targetIso}`);
    console.log(`drift: ${Number.isFinite(ageErrorMs) ? `${Math.round(ageErrorMs / 1000)}s` : "unset"}`);
    process.exit(0);
  }

  if (mode === "--check") {
    if (!Number.isFinite(currentMs) || ageErrorMs > HARD_STALE_MS) {
      console.error(
        `maintain-npm-release-age: npm 'before' is ${!Number.isFinite(currentMs) ? "unset" : `${Math.round(ageErrorMs / 60000)}min stale`}; run 'node scripts/maintain-npm-release-age.mjs'`,
      );
      process.exit(1);
    }
    console.log(`maintain-npm-release-age: ok (before=${currentRaw})`);
    process.exit(0);
  }

  if (Number.isFinite(currentMs) && ageErrorMs <= STALE_MS) {
    console.log(`maintain-npm-release-age: fresh (before=${currentRaw})`);
    process.exit(0);
  }

  // Byte-preserving targeted update: only the before= lines change; every other
  // byte (CRLF endings, comments, tokens, ordering) is kept verbatim, guarded by
  // an advisory lock so a concurrent npm rewrite cannot be lost.
  const raw = existsSync(NPMRC) ? readFileSync(NPMRC, "utf8") : "";
  const updated = raw.replace(/^[ \t]*before[ \t]*=.*\r?\n?/gm, "");
  const separator = updated.endsWith("\n") || updated === "" ? "" : "\n";
  const next = `${updated}${separator}before=${targetIso}\n`;
  const lockPath = `${NPMRC}.maintain-npm-release-age.lock`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      break;
    } catch {
      if (attempt === 49) throw new Error("could not acquire npmrc lock");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      try {
        const holder = Number(readFileSync(lockPath, "utf8"));
        process.kill(holder, 0);
      } catch {
        try {
          rmSync(lockPath);
        } catch {
          // raced
        }
      }
    }
  }
  try {
    writeFileSync(NPMRC, next);
  } finally {
    try {
      rmSync(lockPath);
    } catch {
      // already gone
    }
  }

  console.log(`maintain-npm-release-age: set before=${targetIso} (min-release-age=${minAgeDays}d)`);
} catch (error) {
  console.error(`maintain-npm-release-age: ${error?.message ?? error}`);
  process.exit(2);
}
