/**
 * Tests for the external emitter and the session-JSONL backfill projector.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { backfillSessionsTelemetry } from "../src/backfill.ts";
import { recordCompactionFailureTelemetry } from "../src/emit.ts";
import { readTelemetryEvents } from "../src/store.ts";

test("emit: compaction failure records stage and collapsed error signature", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-telemetry-"));
  await recordCompactionFailureTelemetry(
    { stage: "preset", error: new Error("Summarization failed: 503 after 3 tries") },
    { dir },
  );

  const files = await readdir(dir);
  assert.ok(files.some((name) => name.endsWith(".jsonl")));
  const events = await readTelemetryEvents(dir, 1);
  const failure = events.find((event) => event.kind === "compaction_failure");
  assert.ok(failure);
  assert.equal(failure.stage, "preset");
  assert.equal(failure.errorSignature, "Summarization failed: N after N tries");

  await rm(dir, { recursive: true, force: true });
});

function sessionFile(entries) {
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

test("backfill: derives compaction, turns, tool calls, and skill loads from session JSONL", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-telemetry-"));
  const sessionsDir = path.join(root, "sessions");
  const telemetryDir = path.join(root, "telemetry");
  await mkdir(path.join(sessionsDir, "--repo--"), { recursive: true });
  await mkdir(telemetryDir, { recursive: true });

  const now = Date.now();
  const ts = (minutesAgo) => now - minutesAgo * 60 * 1000;
  await writeFile(
    path.join(sessionsDir, "--repo--", "old-session.jsonl"),
    sessionFile([
      { type: "session", id: "s-old", timestamp: new Date(ts(200)).toISOString() },
      {
        type: "message",
        timestamp: new Date(ts(180)).toISOString(),
        message: { role: "user", content: "do work", timestamp: ts(180) },
      },
      {
        type: "message",
        timestamp: new Date(ts(170)).toISOString(),
        message: {
          role: "assistant",
          timestamp: ts(170),
          content: [
            { type: "text", text: "thinking" },
            {
              type: "toolCall",
              id: "c1",
              name: "read",
              arguments: { path: "/home/x/.pi/agent/skills/refactorops/SKILL.md" },
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: new Date(ts(169)).toISOString(),
        message: {
          role: "toolResult",
          toolCallId: "c1",
          toolName: "read",
          isError: false,
          content: [{ type: "text", text: "ok" }],
          timestamp: ts(169),
        },
      },
      {
        type: "message",
        timestamp: new Date(ts(160)).toISOString(),
        message: {
          role: "toolResult",
          toolCallId: "c2",
          toolName: "bash",
          isError: true,
          content: [{ type: "text", text: "Error: ENOENT file 7 gone" }],
          timestamp: ts(160),
        },
      },
      {
        type: "compaction",
        timestamp: new Date(ts(150)).toISOString(),
        tokensBefore: 292055,
        summary: "x".repeat(7000),
        fromHook: true,
        firstKeptEntryId: "e5",
      },
    ]),
  );

  const result = await backfillSessionsTelemetry({ sessionsDir, telemetryDir, days: 1, now });
  assert.equal(result.filesBackfilled, 1);
  assert.ok(result.events >= 5);
  assert.ok(result.byKind.some((entry) => entry.kind === "compaction"));
  assert.ok(result.byKind.some((entry) => entry.kind === "skill_load"));

  const events = await readTelemetryEvents(telemetryDir, 1, now);
  const compaction = events.find((event) => event.kind === "compaction");
  assert.equal(compaction.summaryChars, 7000);
  assert.equal(compaction.tokensBefore, 292055);
  assert.ok(events.every((event) => event.source === "backfill"));

  const failedTool = events.find((event) => event.kind === "tool_call" && !event.ok);
  assert.equal(failedTool.tool, "bash");
  assert.equal(failedTool.errorSignature, "Error: ENOENT file N gone");
  assert.equal(failedTool.durationMs, undefined);

  const skill = events.find((event) => event.kind === "skill_load");
  assert.equal(skill.skill, "refactorops");

  await rm(root, { recursive: true, force: true });
});

test("backfill: is idempotent and skips live-covered sessions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-telemetry-"));
  const sessionsDir = path.join(root, "sessions");
  const telemetryDir = path.join(root, "telemetry");
  await mkdir(path.join(sessionsDir, "--repo--"), { recursive: true });
  await mkdir(telemetryDir, { recursive: true });

  const now = Date.now();
  const ts = (minutesAgo) => now - minutesAgo * 60 * 1000;
  await writeFile(
    path.join(sessionsDir, "--repo--", "old.jsonl"),
    sessionFile([
      { type: "session", id: "s1", timestamp: new Date(ts(200)).toISOString() },
      {
        type: "message",
        timestamp: new Date(ts(190)).toISOString(),
        message: { role: "user", content: "x", timestamp: ts(190) },
      },
    ]),
  );
  await writeFile(
    path.join(sessionsDir, "--repo--", "live.jsonl"),
    sessionFile([
      { type: "session", id: "s2", timestamp: new Date(ts(5)).toISOString() },
      {
        type: "message",
        timestamp: new Date(ts(4)).toISOString(),
        message: { role: "user", content: "y", timestamp: ts(4) },
      },
    ]),
  );

  // A live shard exists covering the recent session.
  const day = new Date(now).toISOString().slice(0, 10);
  await writeFile(
    path.join(telemetryDir, `${day}.jsonl`),
    `${JSON.stringify({ v: 1, kind: "turn", ts: ts(10), index: 0 })}\n`,
  );

  const first = await backfillSessionsTelemetry({ sessionsDir, telemetryDir, days: 1, now });
  assert.equal(first.filesBackfilled, 1);
  assert.equal(first.filesSkippedLiveOverlap, 1);

  const second = await backfillSessionsTelemetry({ sessionsDir, telemetryDir, days: 1, now });
  assert.equal(second.filesSkippedAlreadyBackfilled, 1);
  assert.equal(second.events, 0);

  await rm(root, { recursive: true, force: true });
});
