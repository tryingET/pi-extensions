#!/usr/bin/env node
// ---
// summary: "Claude Code hook entrypoint that records one session's live state for the activity ribbon"
// read_when:
//   - "changing how Claude Code sessions publish live state to the ribbon"
// ---

// Claude Code runs this for each configured hook event and waits for it, so it must be cheap and
// must never fail the session: every path exits 0 and nothing is written to stdout.

import fs from "node:fs";
import {
  CLAUDE_EVENT_DIR,
  claudeEventPath,
  claudeEventRecord,
  isSessionEndEvent,
} from "../src/common/claude-events.mjs";

const STDIN_LIMIT_BYTES = 1024 * 1024;

async function readPayload() {
  const chunks = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    total += chunk.length;
    if (total > STDIN_LIMIT_BYTES) break;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const payload = await readPayload();
  if (!payload || typeof payload !== "object") return;
  const record = claudeEventRecord(payload, { env: process.env });
  if (!record) return;
  const filePath = claudeEventPath(record.sessionId);
  if (!filePath) return;

  if (isSessionEndEvent(record)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // The session never published, or another hook already retired it.
    }
    return;
  }

  const temporaryPath = `${filePath}.tmp.${process.pid}`;
  try {
    fs.mkdirSync(CLAUDE_EVENT_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporaryPath, JSON.stringify(record), { mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } catch {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Nothing was staged.
    }
  }
}

main()
  .catch(() => {})
  .finally(() => {
    process.exitCode = 0;
  });
