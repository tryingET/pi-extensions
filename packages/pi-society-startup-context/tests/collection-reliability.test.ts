import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStartupContextPacket,
  renderStartupContextPacket,
  summarizeStartupForStatus,
} from "../extensions/society-context.ts";
import { fixture } from "./fixture.ts";

const collect = (
  f: ReturnType<typeof fixture>,
  responses: Record<string, unknown> = {},
  extra: NodeJS.ProcessEnv = {},
) => buildStartupContextPacket(f.repo, undefined, f.config(responses, extra));

test("registered collector runs every AK stage serially, snapshots caller env, and counts passport failure outside warning truncation", async () => {
  const f = fixture();
  try {
    const decision = { id: 7, title: "Open decision", state: "in_review", repo_scope: f.repo };
    const responses = { "decision.list": { payload: { count: 1, decisions: [decision] } } };
    const healthy = await collect(f, responses, { AK_DB: "caller-config-only" });
    assert.equal(healthy.sourceHealth, "healthy");
    assert.equal(healthy.warningCount, 0);
    assert.deepEqual(
      f
        .calls()
        .filter((item) => item.phase === "start")
        .map((item) => item.surface),
      [
        "repo.resolve",
        "startup.snapshot",
        "direction.export",
        "direction.check",
        "decision.list",
        "decision.passport",
      ],
    );
    assert.ok(f.calls().every((item) => item.phase !== "overlap"));
    assert.ok(f.calls().every((item) => item.akDb === "caller-config-only"));
    assert.match(summarizeStartupForStatus(healthy), /✓ ready/);
    f.clear();
    const degraded = await collect(
      f,
      { ...responses, "decision.passport": { exit: 17 } },
      { PI_SOCIETY_CONTEXT_MAX_WARNINGS: "0" },
    );
    assert.equal(degraded.sourceHealth, "degraded");
    assert.equal(degraded.warningCount, 1);
    assert.deepEqual(degraded.warnings, []);
    assert.match(degraded.decisionPassports[0], /unavailable/);
    assert.doesNotMatch(summarizeStartupForStatus(degraded), /ready|✓/);
    assert.match(renderStartupContextPacket(degraded), /warning count \(before truncation\): 1/);
    for (const payload of [
      {},
      {
        decision: { ...decision, id: 99 },
        linked_tasks: [],
        artifacts: [],
        artifact_statuses: [],
        readiness_checks: [],
      },
      {
        decision,
        linked_tasks: [],
        artifacts: [],
        artifact_statuses: [],
        readiness_checks: [],
        readiness: { summary: 7 },
      },
    ]) {
      const rejected = await collect(f, { ...responses, "decision.passport": { payload } });
      assert.equal(rejected.sourceHealth, "degraded");
      assert.equal(rejected.warningCount, 1);
      assert.match(rejected.decisionPassports[0], /unavailable/);
    }
  } finally {
    f.dispose();
  }
});

test("valid envelopes cannot mask semantically malformed direction/decision collections or rejected checks", async () => {
  const f = fixture();
  try {
    for (const [surface, payload] of [
      ["direction.export", { nodes: "wrong" }],
      ["direction.export", { nodes: [null] }],
      ["direction.export", { nodes: [{ key: "x", title: "t", state: 7 }] }],
      ["direction.check", { ok: "true", imported_node_count: 0, parsed_node_count: 0, issues: [] }],
      ["direction.check", { ok: true, imported_node_count: -1, parsed_node_count: 0, issues: [] }],
      ["direction.check", { ok: true, imported_node_count: 0, parsed_node_count: 0, issues: {} }],
      [
        "direction.check",
        { ok: true, imported_node_count: 0, parsed_node_count: 0, issues: [false] },
      ],
      [
        "direction.check",
        {
          ok: true,
          imported_node_count: 0,
          parsed_node_count: 0,
          issues: [],
          repo_scope: "/wrong",
        },
      ],
      ["decision.list", { decisions: [] }],
      ["decision.list", { count: 1, decisions: [] }],
      ["decision.list", { count: 1, decisions: [{ id: "7", title: "d", state: "in_review" }] }],
      ["startup.snapshot", { task_status_counts: { pending: -1 } }],
    ] as const) {
      const packet = await collect(
        f,
        { [surface]: { payload } },
        { PI_SOCIETY_CONTEXT_MAX_WARNINGS: "0" },
      );
      assert.equal(packet.sourceHealth, "degraded", surface);
      assert.ok((packet.warningCount || 0) > 0, surface);
      if (surface === "direction.check") assert.equal(packet.direction?.checkOk, undefined);
      if (surface === "decision.list") assert.equal(packet.decisionSampleChecked, false);
    }
    for (const override of [
      { envelope: { surface: "wrong" } },
      { envelope: { schema_version: 99 } },
      { envelope: { payload_kind: "wrong" } },
      { envelope: { ok: false } },
      { exit: 13 },
      { raw: "not-json" },
    ]) {
      const packet = await collect(f, { "direction.check": override });
      assert.equal(packet.direction?.checkOk, undefined);
      assert.deepEqual(packet.direction?.issues, []);
      assert.ok(!packet.recommendedNext.some((item) => item.includes("Direction drift")));
      assert.equal(packet.sourceHealth, "degraded");
    }
    const drift = await collect(f, {
      "direction.check": {
        payload: {
          ok: false,
          imported_node_count: 1,
          parsed_node_count: 1,
          issues: [{ code: "DRIFT", message: "known difference" }],
        },
      },
    });
    assert.equal(drift.direction?.checkOk, false);
    assert.ok(drift.recommendedNext.some((item) => item.includes("Direction drift")));
  } finally {
    f.dispose();
  }
});

test("four scoped timeouts complete degraded, and refresh expiry/cancellation stop later launches", async () => {
  const f = fixture();
  try {
    const packet = await collect(
      f,
      Object.fromEntries(
        ["startup.snapshot", "direction.export", "direction.check", "decision.list"].map(
          (surface) => [surface, { hang: true }],
        ),
      ),
      { PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS: "250" },
    );
    assert.equal(packet.packetTier, "full");
    assert.equal(packet.fullRefreshStatus, "complete");
    assert.equal(packet.sourceHealth, "degraded");
    assert.equal(packet.warningCount, 4);
    assert.ok(
      packet.commandDiagnostics
        ?.slice(1)
        .every((item) => item.reason === "timeout" && item.cleanup === "settled"),
    );
    assert.doesNotMatch(summarizeStartupForStatus(packet), /✓|ready/);
    f.clear();
    const expired = await collect(
      f,
      { "startup.snapshot": { hang: true } },
      {
        PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS: "10000",
        PI_SOCIETY_CONTEXT_REFRESH_TIMEOUT_MS: "350",
      },
    );
    assert.equal(expired.fullRefreshStatus, "failed");
    assert.equal(expired.sourceHealth, "degraded");
    assert.ok(expired.commandDiagnostics?.some((item) => item.reason === "refresh_timeout"));
    assert.deepEqual(
      f
        .calls()
        .filter((item) => item.phase === "start")
        .map((item) => item.surface),
      ["repo.resolve", "startup.snapshot"],
    );
    f.clear();
    const activeAbort = new AbortController();
    const active = buildStartupContextPacket(
      f.repo,
      activeAbort.signal,
      f.config({ "startup.snapshot": { hang: true } }),
    );
    for (let i = 0; i < 200 && !f.calls().some((item) => item.surface === "startup.snapshot"); i++)
      await new Promise((resolve) => setTimeout(resolve, 25));
    assert.ok(f.calls().some((item) => item.surface === "startup.snapshot"));
    activeAbort.abort("superseded");
    const stopped = await active;
    assert.equal(stopped.fullRefreshStatus, "failed");
    assert.ok(stopped.commandDiagnostics?.some((item) => item.reason === "cancelled"));
    assert.deepEqual(
      f
        .calls()
        .filter((item) => item.phase === "start")
        .map((item) => item.surface),
      ["repo.resolve", "startup.snapshot"],
    );
    f.clear();
    const controller = new AbortController();
    controller.abort("superseded");
    const cancelled = await buildStartupContextPacket(f.repo, controller.signal, f.config());
    assert.equal(cancelled.fullRefreshStatus, "failed");
    assert.deepEqual(f.calls(), []);
    assert.ok(cancelled.warnings.some((warning) => /cancelled/.test(warning)));
    const zero = await collect(f, {}, { PI_SOCIETY_CONTEXT_REFRESH_TIMEOUT_MS: "0" });
    assert.equal(zero.fullRefreshStatus, "failed");
    assert.deepEqual(f.calls(), []);
    const zeroCommand = await collect(f, {}, { PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS: "0" });
    assert.equal(zeroCommand.sourceHealth, "degraded");
    assert.deepEqual(f.calls(), []);
  } finally {
    f.dispose();
  }
});

test("unregistered applicability is degraded orientation; disabled and outside never probe", async () => {
  const f = fixture();
  try {
    const packet = await collect(f, {
      "repo.resolve": {
        payload: { input: f.repo, registered: false, canonical_path: null, repo: null },
      },
    });
    assert.equal(packet.applicable, true);
    assert.equal(packet.sourceHealth, "degraded");
    assert.equal(packet.ak?.repoRegistered, false);
    assert.equal(f.calls().filter((item) => item.phase === "start").length, 1);
    f.clear();
    const disabled = await collect(f, {}, { PI_SOCIETY_STARTUP_CONTEXT: "0" });
    assert.equal(disabled.sourceHealth, "not_checked");
    assert.equal(disabled.disabled, true);
    const outside = await buildStartupContextPacket(f.root, undefined, {
      ...f.config(),
      cwd: f.root,
    });
    assert.equal(outside.applicable, false);
    assert.deepEqual(f.calls(), []);
  } finally {
    f.dispose();
  }
});
