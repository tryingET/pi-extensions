/**
 * Tests for the telemetry store: shard layout, rotation, retention pruning, window reads.
 */

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendTelemetryEvent,
  pruneTelemetryShards,
  readTelemetryEvents,
  TELEMETRY_SHARD_MAX_BYTES,
} from "../src/store.ts";

const DAY = 24 * 60 * 60 * 1000;

function turnEvent(ts, index = 0) {
  return { v: 1, kind: "turn", ts, index };
}

test("store: appends to day shard and reads it back within the window", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-telemetry-"));
  const now = Date.parse("2026-08-15T12:00:00.000Z");
  await appendTelemetryEvent(dir, turnEvent(now), { now });

  const files = await readdir(dir);
  assert.deepEqual(files, ["2026-08-15.jsonl"]);

  const events = await readTelemetryEvents(dir, 7, now);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "turn");

  await rm(dir, { recursive: true, force: true });
});

test("store: reads exclude events outside the window", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-telemetry-"));
  const now = Date.now();
  await appendTelemetryEvent(dir, turnEvent(now - 10 * DAY), { now });
  await appendTelemetryEvent(dir, turnEvent(now - 1 * DAY), { now });

  const events = await readTelemetryEvents(dir, 7, now);
  assert.equal(events.length, 1);

  await rm(dir, { recursive: true, force: true });
});

test("store: rotates the day shard once the size cap is exceeded", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-telemetry-"));
  const now = Date.now();
  const big = {
    v: 1,
    kind: "tool_call",
    ts: now,
    tool: "bash",
    ok: true,
    durationMs: 1,
  };

  await appendTelemetryEvent(dir, big, { now });
  const shard = path.join(dir, `${new Date(now).toISOString().slice(0, 10)}.jsonl`);
  await writeFile(shard, "x".repeat(TELEMETRY_SHARD_MAX_BYTES), "utf8");
  await appendTelemetryEvent(dir, big, { now });

  const files = await readdir(dir);
  assert.ok(
    files.some((name) => name.endsWith(".jsonl-1")),
    `expected rotated shard in ${files.join(",")}`,
  );
  const rotated = await readFile(`${shard}-1`, "utf8");
  assert.match(rotated, /"kind":"tool_call"/);

  await rm(dir, { recursive: true, force: true });
});

test("store: prunes shards older than retention", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-telemetry-"));
  const now = Date.now();
  const oldDay = new Date(now - 40 * DAY).toISOString().slice(0, 10);
  const recentDay = new Date(now - 1 * DAY).toISOString().slice(0, 10);
  await writeFile(
    path.join(dir, `${oldDay}.jsonl`),
    `${JSON.stringify(turnEvent(now - 40 * DAY))}\n`,
  );
  await writeFile(
    path.join(dir, `${recentDay}.jsonl`),
    `${JSON.stringify(turnEvent(now - DAY))}\n`,
  );

  const pruned = await pruneTelemetryShards(dir, 30, now);
  assert.equal(pruned, 1);
  const remaining = await readdir(dir);
  assert.deepEqual(remaining, [`${recentDay}.jsonl`]);

  await rm(dir, { recursive: true, force: true });
});

test("store: skips malformed shard lines without dropping the rest", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-telemetry-"));
  const now = Date.now();
  const shard = path.join(dir, `${new Date(now).toISOString().slice(0, 10)}.jsonl`);
  await writeFile(shard, `{not json}\n${JSON.stringify(turnEvent(now))}\n`, "utf8");

  const events = await readTelemetryEvents(dir, 1, now);
  assert.equal(events.length, 1);

  await rm(dir, { recursive: true, force: true });
});
