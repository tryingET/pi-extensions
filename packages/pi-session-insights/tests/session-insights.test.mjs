// summary: "Regression tests for bounded jq-only Pi session extraction and role/authority boundaries."
// read_when:
//   - "Changing the session-insights jq contract, CLI bounds, or spawn-role classification."

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(packageRoot, "bin", "pi-session-insights.mjs");
const fixtures = join(packageRoot, "tests", "fixtures");

function runSession(file, ...options) {
  const output = execFileSync(process.execPath, [cli, ...options, file], {
    cwd: packageRoot,
    encoding: "utf8",
    env: process.env,
  });
  return JSON.parse(output);
}

function withScratch(callback) {
  const root = mkdtempSync(join(tmpdir(), "pi-session-insights-test-"));
  try {
    return callback(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

test("extracts the active branch, retained tail, attribution, and observed mutation roots", () => {
  withScratch((scratch) => {
    const session = join(scratch, "controller.jsonl");
    copyFileSync(join(fixtures, "controller.jsonl"), session);
    utimesSync(session, new Date("2040-01-01T00:00:00Z"), new Date("2040-01-01T00:00:00Z"));

    const result = runSession(session, "--attribution", join(fixtures, "attribution.json"));

    assert.equal(result.schema, "pi.session-insights.v1");
    assert.equal(result.bounded_output, true);
    assert.equal(result.session_id, "session-controller");
    assert.equal(
      result.session_header_cwd,
      "/home/tryinget/ai-society/softwareco/owned/local-ai-control-plane",
    );
    assert.equal(result.session_role, "controller");
    assert.equal(result.latest_meaningful_activity.entry_id, "a0000003");
    assert.equal(result.latest_meaningful_activity.timestamp, "2026-08-03T10:00:11.000Z");
    assert.equal(result.latest_operator_message.source, "compaction.retainedTail");
    assert.equal(result.latest_operator_message.text, "Continue AK-4610 only.");
    assert.equal(result.latest_assistant_text.entry_id, "a0000003");
    assert.equal(result.latest_assistant_text.text, "Final active-branch assistant text.");
    assert.equal(result.active_leaf.id, "a0000003");
    assert.ok(!result.active_parent_chain.includes("u0000002"));
    assert.ok(!result.active_parent_chain.includes("a0000002"));
    assert.equal(result.compaction_count, 1);
    assert.equal(result.retained_tail_compaction_count, 1);
    assert.equal(result.branch_summary_count, 1);
    assert.deepEqual(result.custom_entry_types, [
      { ordinal: 0, type: "operator-note", type_truncated: false, count: 1 },
      { ordinal: 1, type: "peer-runtime", type_truncated: false, count: 1 },
    ]);
    assert.deepEqual(result.ak_task_ids, [4610]);
    assert.equal(result.authority_repo, "/home/tryinget/ai-society/softwareco/infra/workstation");
    assert.deepEqual(result.observed_mutation_roots, [
      "/home/tryinget/ai-society/softwareco/infra/workstation",
    ]);
    assert.equal(result.runtime_owner, "/home/tryinget/ai-society/softwareco/infra/workstation");
    assert.equal(result.propagation_state, "session + diary");
    assert.equal(result.latest_model_change.model_id, "gpt-5.6-sol");
    assert.equal(result.latest_thinking_level_change.thinking_level, "high");
    assert.ok(
      result.uncertainties.includes("derived_mutation_roots_are_path_observations_not_authority"),
    );
    assert.ok(result.uncertainties.includes("native_runtime_activation_not_proven_by_session"));
    assert.ok(!result.uncertainties.includes("authority_repo_unresolved"));
  });
});

test("classifies scout, subagent, and fork sessions without treating boot prompts as operators", () => {
  const scout = runSession(join(fixtures, "scout.jsonl"));
  assert.equal(scout.session_role, "scout");
  assert.equal(scout.latest_operator_message, null);
  assert.equal(scout.latest_assistant_text.text, "Scout findings for AK-4611.");
  assert.ok(
    scout.uncertainties.includes("spawn_boot_prompt_excluded_from_latest_operator_message"),
  );

  const subagent = runSession(join(fixtures, "subagent.jsonl"));
  assert.equal(subagent.session_role, "subagent");
  assert.equal(subagent.latest_operator_message, null);
  assert.deepEqual(subagent.ak_task_ids, [4609]);

  const fork = runSession(join(fixtures, "fork.jsonl"));
  assert.equal(fork.session_role, "fork");
  assert.equal(fork.latest_operator_message.text, "Continue the forked analysis for AK-4607.");
});

test("distinguishes actual fork boot prompts from controller text that names dispatch_subagent", () => {
  withScratch((scratch) => {
    const controller = join(scratch, "controller-dispatch-reference.jsonl");
    writeFileSync(
      controller,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "session-controller-dispatch-reference",
          timestamp: "2026-08-03T10:40:00.000Z",
          cwd: "/work/controller",
        }),
        JSON.stringify({
          type: "message",
          id: "controller-user",
          parentId: null,
          timestamp: "2026-08-03T10:40:01.000Z",
          message: {
            role: "user",
            content: "Explain the dispatch_subagent API for AK-4625.",
            timestamp: 1785753601000,
          },
        }),
        JSON.stringify({
          type: "message",
          id: "controller-assistant",
          parentId: "controller-user",
          timestamp: "2026-08-03T10:40:02.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Controller response." }],
            timestamp: 1785753602000,
          },
        }),
      ].join("\n"),
    );

    const controllerResult = runSession(controller);
    assert.equal(controllerResult.session_role, "controller");
    assert.equal(
      controllerResult.latest_operator_message.text,
      "Explain the dispatch_subagent API for AK-4625.",
    );

    const forkBoot = join(scratch, "fork-boot.jsonl");
    writeFileSync(
      forkBoot,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "session-fork-boot",
          timestamp: "2026-08-03T10:41:00.000Z",
          cwd: "/work/fork",
        }),
        JSON.stringify({
          type: "message",
          id: "fork-user",
          parentId: null,
          timestamp: "2026-08-03T10:41:01.000Z",
          message: {
            role: "user",
            content:
              "# Visible Fork Peer Prompt\n\nYou are a visible fork peer launched from the controller context. You are the spawned fork peer.",
            timestamp: 1785753661000,
          },
        }),
        JSON.stringify({
          type: "message",
          id: "fork-assistant",
          parentId: "fork-user",
          timestamp: "2026-08-03T10:41:02.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Fork findings." }],
            timestamp: 1785753662000,
          },
        }),
      ].join("\n"),
    );

    const forkResult = runSession(forkBoot);
    assert.equal(forkResult.session_role, "fork");
    assert.equal(forkResult.latest_operator_message, null);
    assert.ok(
      forkResult.uncertainties.includes("spawn_boot_prompt_excluded_from_latest_operator_message"),
    );
  });
});

test("filters spawn language only in the first boot message", () => {
  withScratch((scratch) => {
    const session = join(scratch, "later-review-objective.jsonl");
    writeFileSync(
      session,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "session-later-review-objective",
          timestamp: "2026-08-03T10:45:00.000Z",
          cwd: "/work/controller",
        }),
        JSON.stringify({
          type: "message",
          id: "first-user",
          parentId: null,
          timestamp: "2026-08-03T10:45:01.000Z",
          message: { role: "user", content: "Initial operator request.", timestamp: 1785753901000 },
        }),
        JSON.stringify({
          type: "message",
          id: "first-assistant",
          parentId: "first-user",
          timestamp: "2026-08-03T10:45:02.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Initial response." }],
            timestamp: 1785753902000,
          },
        }),
        JSON.stringify({
          type: "message",
          id: "later-user",
          parentId: "first-assistant",
          timestamp: "2026-08-03T10:45:03.000Z",
          message: {
            role: "user",
            content: "Review objective: reassess AK-4625.",
            timestamp: 1785753903000,
          },
        }),
      ].join("\n"),
    );

    const result = runSession(session);
    assert.equal(result.session_role, "controller");
    assert.equal(result.latest_operator_message.entry_id, "later-user");
    assert.equal(result.latest_operator_message.text, "Review objective: reassess AK-4625.");
  });
});

test("preserves sub-second ordering for latest meaningful activity", () => {
  withScratch((scratch) => {
    const session = join(scratch, "subsecond-order.jsonl");
    writeFileSync(
      session,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "session-subsecond-order",
          timestamp: "2026-08-03T10:46:00.000Z",
          cwd: "/work/controller",
        }),
        JSON.stringify({
          type: "message",
          id: "chronologically-latest",
          parentId: null,
          timestamp: "2026-08-03T10:46:01.900Z",
          message: { role: "user", content: "Latest by time.", timestamp: 1785753961900 },
        }),
        JSON.stringify({
          type: "message",
          id: "appended-last",
          parentId: "chronologically-latest",
          timestamp: "2026-08-03T10:46:01.100Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Appended last." }],
            timestamp: 1785753961100,
          },
        }),
      ].join("\n"),
    );

    const result = runSession(session);
    assert.equal(result.active_leaf.id, "appended-last");
    assert.equal(result.latest_meaningful_activity.entry_id, "chronologically-latest");
    assert.equal(result.latest_meaningful_activity.timestamp, "2026-08-03T10:46:01.900Z");
  });
});

test("handles Pi firstKeptEntryId compactions and excludes hidden thinking from task ids", () => {
  withScratch((scratch) => {
    const session = join(scratch, "first-kept-compaction.jsonl");
    writeFileSync(
      session,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "session-first-kept-compaction",
          timestamp: "2026-08-03T10:47:00.000Z",
          cwd: "/work/controller",
        }),
        JSON.stringify({
          type: "message",
          id: "history-user",
          parentId: null,
          timestamp: "2026-08-03T10:47:01.000Z",
          message: { role: "user", content: "Historical AK-1000.", timestamp: 1785754021000 },
        }),
        JSON.stringify({
          type: "message",
          id: "history-assistant",
          parentId: "history-user",
          timestamp: "2026-08-03T10:47:02.000Z",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Hidden reasoning mentions AK-9999." },
              { type: "text", text: "Visible response without that task." },
            ],
            timestamp: 1785754022000,
          },
        }),
        JSON.stringify({
          type: "message",
          id: "kept-user",
          parentId: "history-assistant",
          timestamp: "2026-08-03T10:47:03.000Z",
          message: { role: "user", content: "Continue AK-4611.", timestamp: 1785754023000 },
        }),
        JSON.stringify({
          type: "compaction",
          id: "native-compaction",
          parentId: "kept-user",
          timestamp: "2026-08-03T10:47:04.000Z",
          summary: "Earlier work summarized.",
          firstKeptEntryId: "kept-user",
          tokensBefore: 50000,
        }),
        JSON.stringify({
          type: "message",
          id: "post-compaction-assistant",
          parentId: "native-compaction",
          timestamp: "2026-08-03T10:47:05.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Post-compaction response." }],
            timestamp: 1785754025000,
          },
        }),
      ].join("\n"),
    );

    const result = runSession(session);
    assert.equal(result.compaction_count, 1);
    assert.equal(result.first_kept_compaction_count, 1);
    assert.equal(result.retained_tail_compaction_count, 0);
    assert.ok(result.ak_task_ids.includes(4611));
    assert.ok(result.ak_task_ids.includes(1000));
    assert.ok(!result.ak_task_ids.includes(9999));
    assert.equal(result.latest_operator_message.entry_id, "kept-user");
  });
});

test("does not reclassify a retainedTail copy of a spawn boot prompt as operator input", () => {
  withScratch((scratch) => {
    const session = join(scratch, "retained-spawn-boot.jsonl");
    const boot = "You are a specialized subagent.\nSubagent objective: inspect only.";
    writeFileSync(
      session,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "session-retained-spawn-boot",
          timestamp: "2026-08-03T10:47:30.000Z",
          cwd: "/work/subagent",
        }),
        JSON.stringify({
          type: "message",
          id: "boot-user",
          parentId: null,
          timestamp: "2026-08-03T10:47:31.000Z",
          message: { role: "user", content: boot, timestamp: 1785754051000 },
        }),
        JSON.stringify({
          type: "message",
          id: "boot-assistant",
          parentId: "boot-user",
          timestamp: "2026-08-03T10:47:32.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Working." }],
            timestamp: 1785754052000,
          },
        }),
        JSON.stringify({
          type: "compaction",
          id: "compact",
          parentId: "boot-assistant",
          timestamp: "2026-08-03T10:47:33.000Z",
          summary: "Spawned context retained.",
          tokensBefore: 50000,
          retainedTail: [
            { role: "user", content: boot, timestamp: 1785754053100 },
            {
              role: "assistant",
              content: [{ type: "text", text: "Retained response." }],
              timestamp: 1785754053200,
            },
          ],
        }),
      ].join("\n"),
    );

    const result = runSession(session);
    assert.equal(result.session_role, "subagent");
    assert.equal(result.retained_tail_compaction_count, 1);
    assert.equal(result.latest_operator_message, null);
    assert.ok(
      result.uncertainties.includes("spawn_boot_prompt_excluded_from_latest_operator_message"),
    );
  });
});

test("ignores unsourced authority attribution and fails closed to null or session-only", () => {
  withScratch((scratch) => {
    const session = join(scratch, "unsourced-attribution.jsonl");
    const attribution = join(scratch, "attribution.json");
    writeFileSync(
      session,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "session-unsourced-attribution",
          timestamp: "2026-08-03T10:48:00.000Z",
          cwd: "/untrusted/cwd",
        }),
        JSON.stringify({
          type: "message",
          id: "user",
          parentId: null,
          timestamp: "2026-08-03T10:48:01.000Z",
          message: { role: "user", content: "Inspect only.", timestamp: 1785754081000 },
        }),
      ].join("\n"),
    );
    writeFileSync(
      attribution,
      JSON.stringify({
        schema: "pi.session-insights.attribution.v1",
        attributions: {
          "session-unsourced-attribution": {
            authority_repo: "/forged/authority",
            runtime_owner: { value: "/forged/runtime", source: "   " },
            kes_destination: "/forged/kes",
            propagation_state: { value: "session + propagated", source: "\t" },
            observed_mutation_roots: ["/forged/mutation"],
          },
        },
      }),
    );

    const result = runSession(session, "--attribution", attribution);
    assert.equal(result.authority_repo, null);
    assert.equal(result.runtime_owner, null);
    assert.equal(result.kes_destination, null);
    assert.equal(result.propagation_state, "session-only");
    assert.deepEqual(result.observed_mutation_roots, []);
    assert.deepEqual(result.attribution_sources, {
      authority_repo: null,
      observed_mutation_roots: null,
      runtime_owner: null,
      kes_destination: null,
      propagation_state: null,
    });
    for (const field of [
      "authority_repo",
      "runtime_owner",
      "kes_destination",
      "propagation_state",
      "observed_mutation_roots",
    ]) {
      assert.ok(result.uncertainties.includes(`attribution_${field}_ignored_without_source`));
    }
  });
});

test("caps custom metadata and source-qualified attribution cardinality and strings", () => {
  withScratch((scratch) => {
    const session = join(scratch, "bounded-metadata.jsonl");
    const attribution = join(scratch, "attribution.json");
    const lines = [
      JSON.stringify({
        type: "session",
        version: 3,
        id: "session-bounded-metadata",
        timestamp: "2026-08-03T10:49:00.000Z",
        cwd: `/${"c".repeat(10_000)}`,
      }),
      JSON.stringify({
        type: "message",
        id: "user",
        parentId: null,
        timestamp: "2026-08-03T10:49:01.000Z",
        message: { role: "user", content: "Bound this output.", timestamp: 1785754141000 },
      }),
    ];
    let parentId = "user";
    for (let index = 0; index < 200; index += 1) {
      const id = `custom-${index}`;
      lines.push(
        JSON.stringify({
          type: "custom",
          id,
          parentId,
          timestamp: new Date(1785754142000 + index).toISOString(),
          customType: `${"x".repeat(500)}-custom-${index}`,
          data: { ignored: "payload" },
        }),
      );
      parentId = id;
    }
    writeFileSync(session, `${lines.join("\n")}\n`);
    writeFileSync(
      attribution,
      JSON.stringify({
        schema: "pi.session-insights.attribution.v1",
        attributions: {
          "session-bounded-metadata": {
            authority_repo: { value: `/${"a".repeat(10_000)}`, source: "s".repeat(10_000) },
            observed_mutation_roots: {
              value: Array.from({ length: 200 }, (_, index) => `/${"r".repeat(5_000)}-${index}`),
              source: "roots-source".repeat(1_000),
            },
            runtime_owner: { value: "/runtime", source: "runtime-source" },
            kes_destination: { value: "/kes", source: "kes-source" },
            propagation_state: { value: "session-only", source: "propagation-source" },
            uncertainties: Array.from(
              { length: 100 },
              (_, index) => `uncertainty-${index}-${"u".repeat(2_000)}`,
            ),
          },
        },
      }),
    );

    const result = runSession(session, "--attribution", attribution);
    assert.equal(result.custom_entry_types.length, 128);
    assert.equal(result.custom_entry_types_total, 200);
    assert.equal(result.custom_entry_types_truncated, true);
    assert.ok(result.custom_entry_types.every((record) => record.type.length < 300));
    assert.ok(result.custom_entry_types.every((record, index) => record.ordinal === index));
    assert.ok(result.custom_entry_types.every((record) => record.type_truncated));
    assert.equal(result.observed_mutation_roots.length, 128);
    assert.equal(result.observed_mutation_roots_total, 200);
    assert.equal(result.observed_mutation_roots_truncated, true);
    assert.ok(result.observed_mutation_roots.every((root) => root.length < 4_200));
    assert.ok(result.session_header_cwd.length < 4_200);
    assert.ok(result.authority_repo.length < 4_200);
    assert.ok(result.attribution_sources.authority_repo.length < 2_200);
    assert.ok(result.uncertainties.length <= 128);
    assert.ok(result.uncertainties.every((uncertainty) => uncertainty.length < 1_100));
    assert.ok(result.uncertainties.includes("custom_entry_types_truncated"));
    assert.ok(result.uncertainties.includes("custom_entry_type_strings_truncated"));
    assert.ok(result.uncertainties.includes("observed_mutation_roots_truncated"));
    assert.ok(result.uncertainties.includes("observed_mutation_root_strings_truncated"));
    assert.ok(result.uncertainties.includes("attribution_uncertainties_truncated"));
  });
});

test("bounds task references by recency instead of discarding the latest ids", () => {
  withScratch((scratch) => {
    const session = join(scratch, "many-task-references.jsonl");
    const startedAt = Date.parse("2026-08-03T10:50:00.000Z");
    const lines = [
      JSON.stringify({
        type: "session",
        version: 3,
        id: "session-many-task-references",
        timestamp: new Date(startedAt).toISOString(),
        cwd: "/work/controller",
      }),
    ];
    let parentId = null;
    for (let index = 0; index < 150; index += 1) {
      const id = `task-entry-${index}`;
      lines.push(
        JSON.stringify({
          type: "message",
          id,
          parentId,
          timestamp: new Date(startedAt + (index + 1) * 1_000).toISOString(),
          message: {
            role: index === 0 ? "user" : "assistant",
            content: `Historical reference AK-${1_000 + index}.`,
            timestamp: startedAt + (index + 1) * 1_000,
          },
        }),
      );
      parentId = id;
    }
    lines.push(
      JSON.stringify({
        type: "message",
        id: "latest-task-entry",
        parentId,
        timestamp: new Date(startedAt + 151_000).toISOString(),
        message: {
          role: "assistant",
          content: "Current source-owner task AK-4611.",
          timestamp: startedAt + 151_000,
        },
      }),
    );
    writeFileSync(session, `${lines.join("\n")}\n`);

    const result = runSession(session);
    assert.equal(result.ak_task_ids.length, 128);
    assert.equal(result.ak_task_ids[0], 4611);
    assert.equal(result.ak_task_ids_total, 151);
    assert.equal(result.ak_task_ids_truncated, true);
    assert.ok(!result.ak_task_ids.includes(1000));
    assert.ok(result.uncertainties.includes("ak_task_ids_truncated_to_most_recent"));
  });
});

test("caps active-chain and text output for long sessions", () => {
  withScratch((scratch) => {
    const session = join(scratch, "long.jsonl");
    const lines = [
      JSON.stringify({
        type: "session",
        version: 3,
        id: "session-long",
        timestamp: "2026-08-03T11:00:00.000Z",
        cwd: "/work/controller",
      }),
    ];
    let parentId = null;
    for (let index = 0; index < 700; index += 1) {
      const id = `entry-${String(index).padStart(4, "0")}`;
      const role = index === 0 ? "user" : "assistant";
      lines.push(
        JSON.stringify({
          type: "message",
          id,
          parentId,
          timestamp: `2026-08-03T11:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
          message: {
            role,
            content:
              index === 0
                ? "Operator objective"
                : [{ type: "text", text: `assistant-${index}-abcdefghijklmnopqrstuvwxyz` }],
            timestamp: 1785754800000 + index * 1000,
            ...(role === "assistant"
              ? {
                  provider: "openai",
                  model: "gpt-5.6-sol",
                  api: "responses",
                  usage: {},
                  stopReason: "stop",
                }
              : {}),
          },
        }),
      );
      parentId = id;
    }
    writeFileSync(session, `${lines.join("\n")}\n`);

    const result = runSession(session, "--max-chain", "5", "--max-text-chars", "16");
    assert.equal(result.active_parent_chain_total, 700);
    assert.equal(result.active_parent_chain.length, 5);
    assert.equal(result.active_parent_chain[0], "entry-0000");
    assert.equal(result.active_parent_chain.at(-1), "entry-0699");
    assert.equal(result.active_parent_chain_truncated, true);
    assert.ok(result.latest_assistant_text.text.endsWith("…<truncated>"));
    assert.ok(result.uncertainties.includes("active_parent_chain_truncated"));
    assert.ok(readFileSync(session, "utf8").startsWith('{"type":"session"'));
  });
});

test("reports active-chain cycles and missing parents without guessing", () => {
  withScratch((scratch) => {
    const cycle = join(scratch, "cycle.jsonl");
    writeFileSync(
      cycle,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "session-cycle",
          timestamp: "2026-08-03T11:55:00.000Z",
          cwd: "/work",
        }),
        JSON.stringify({
          type: "custom",
          id: "cycle-a",
          parentId: "cycle-b",
          timestamp: "2026-08-03T11:55:01.000Z",
          customType: "cycle",
        }),
        JSON.stringify({
          type: "custom",
          id: "cycle-b",
          parentId: "cycle-a",
          timestamp: "2026-08-03T11:55:02.000Z",
          customType: "cycle",
        }),
      ].join("\n"),
    );
    const cycleResult = runSession(cycle);
    assert.ok(cycleResult.uncertainties.includes("active_parent_chain_cycle_detected"));
    assert.equal(cycleResult.active_parent_chain_total, 2);

    const missing = join(scratch, "missing-parent.jsonl");
    writeFileSync(
      missing,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "session-missing-parent",
          timestamp: "2026-08-03T11:56:00.000Z",
          cwd: "/work",
        }),
        JSON.stringify({
          type: "custom",
          id: "orphan",
          parentId: "not-present",
          timestamp: "2026-08-03T11:56:01.000Z",
          customType: "orphan",
        }),
      ].join("\n"),
    );
    const missingResult = runSession(missing);
    assert.ok(
      missingResult.uncertainties.includes("active_parent_chain_missing_parent:not-present"),
    );
    assert.deepEqual(missingResult.active_parent_chain, ["orphan"]);
  });
});

test("fails closed on duplicate entry ids", () => {
  withScratch((scratch) => {
    const session = join(scratch, "duplicate.jsonl");
    writeFileSync(
      session,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "session-duplicate",
          timestamp: "2026-08-03T12:00:00.000Z",
          cwd: "/work",
        }),
        JSON.stringify({
          type: "custom",
          id: "same-id",
          parentId: null,
          timestamp: "2026-08-03T12:00:01.000Z",
          customType: "one",
        }),
        JSON.stringify({
          type: "custom",
          id: "same-id",
          parentId: "same-id",
          timestamp: "2026-08-03T12:00:02.000Z",
          customType: "two",
        }),
      ].join("\n"),
    );

    const failed = spawnSync(process.execPath, [cli, session], {
      cwd: packageRoot,
      encoding: "utf8",
      env: process.env,
    });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /duplicate session entry ids/);
  });
});
