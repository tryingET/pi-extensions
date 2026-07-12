// ---
// summary: tests settled-agent provenance capture, atomic writes, and failure isolation
// read_when:
//   - modifying the provenance extension entrypoint or its filesystem guarantees
// ---

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import provenanceExtension, { writeJsonAtomic } from "../extensions/provenance.ts";

function assistantEntry() {
  return {
    type: "message",
    id: "assistant-entry",
    message: {
      role: "assistant",
      provider: "openai-codex",
      model: "gpt-5.5",
      api: "openai-codex-responses",
    },
  };
}

function registerEntrypoint() {
  let agentSettled;
  provenanceExtension({
    on(event, handler) {
      if (event === "agent_settled") agentSettled = handler;
    },
  });
  assert.equal(typeof agentSettled, "function");
  return agentSettled;
}

test("agent_settled entrypoint writes configured provenance", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pi-provenance-entrypoint-"));
  const outputFile = path.join(dir, "capture.json");
  const oldLane = process.env.PI_PROVENANCE_REVIEW_LANE_ID;
  const oldOutput = process.env.PI_PROVENANCE_OUTPUT_FILE;
  process.env.PI_PROVENANCE_REVIEW_LANE_ID = "lane-1";
  process.env.PI_PROVENANCE_OUTPUT_FILE = outputFile;

  try {
    const agentSettled = registerEntrypoint();
    await agentSettled({}, { sessionManager: { getEntries: () => [assistantEntry()] } });
    const payload = JSON.parse(await readFile(outputFile, "utf8"));
    assert.equal(payload.pi_session.message_entry_id, "assistant-entry");
    assert.equal(payload.capture_context.review_lane_id, "lane-1");
  } finally {
    process.env.PI_PROVENANCE_REVIEW_LANE_ID = oldLane;
    process.env.PI_PROVENANCE_OUTPUT_FILE = oldOutput;
    await rm(dir, { recursive: true, force: true });
  }
});

test("agent_settled entrypoint isolates extraction and background write failures", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pi-provenance-failure-"));
  const oldLane = process.env.PI_PROVENANCE_REVIEW_LANE_ID;
  const oldOutput = process.env.PI_PROVENANCE_OUTPUT_FILE;
  process.env.PI_PROVENANCE_REVIEW_LANE_ID = "lane-1";
  process.env.PI_PROVENANCE_OUTPUT_FILE = dir;

  try {
    const agentSettled = registerEntrypoint();
    await assert.doesNotReject(() =>
      agentSettled({}, { sessionManager: { getEntries: () => [assistantEntry()] } }),
    );
    await assert.doesNotReject(() =>
      agentSettled(
        {},
        {
          sessionManager: {
            getEntries: () => {
              throw new Error("broken session");
            },
          },
        },
      ),
    );
    assert.deepEqual(
      (await readdir(dir)).filter((name) => name.includes(".tmp-")),
      [],
    );
  } finally {
    process.env.PI_PROVENANCE_REVIEW_LANE_ID = oldLane;
    process.env.PI_PROVENANCE_OUTPUT_FILE = oldOutput;
    await rm(dir, { recursive: true, force: true });
  }
});

test("atomic writes use collision-resistant temp names and clean them after rename failure", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pi-provenance-atomic-"));
  const outputDirectory = path.join(dir, "capture.json");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(outputDirectory));

  try {
    assert.throws(() => writeJsonAtomic(outputDirectory, { ok: true }));
    assert.deepEqual(
      (await readdir(dir)).filter((name) => name.includes(".tmp-")),
      [],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
