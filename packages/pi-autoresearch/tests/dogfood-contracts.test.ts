import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("product posture and dogfood playbook expose orchestrator supervision handoff seams", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const productPosture = readFileSync(
    path.join(packageRoot, "docs/project/product-posture.md"),
    "utf8",
  );
  const dogfoodPlaybook = readFileSync(
    path.join(packageRoot, "docs/project/dogfood-playbook.md"),
    "utf8",
  );
  for (const toolName of [
    "autoresearch_live_supervision",
    "autoresearch_manifest_campaign_supervision",
    "autoresearch_self_hosting_supervision",
  ]) {
    assert.match(productPosture, new RegExp(toolName, "u"));
    assert.match(dogfoodPlaybook, new RegExp(toolName, "u"));
  }
  assert.match(
    dogfoodPlaybook,
    /orchestrator\/AK\/KES\/issue adapter promotion happens explicitly outside pi-autoresearch/u,
  );
});

test("dogfood workflow contract benchmark is current and strict-clean", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const output = execFileSync(process.execPath, ["scripts/dogfood-workflow-contract.mjs"], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, DOGFOOD_CONTRACT_STRICT: "1" },
  });

  assert.match(output, /CONTRACT ok posture-prioritizes-operator-clarity/u);
  assert.match(output, /CONTRACT ok orchestrator-supervision-handoff/u);
  assert.match(output, /CONTRACT ok resume-foreground-executor-contract/u);
  assert.match(output, /METRIC unresolved_dogfood_blockers=0/u);
});

test("foreground resume dogfood script preserves reviewed executor boundaries", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const dogfoodCwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-resume-dogfood-"));
  try {
    const output = execFileSync(
      process.execPath,
      ["scripts/dogfood-foreground-resume-contract.mjs"],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          DOGFOOD_CONTRACT_STRICT: "1",
          PI_AUTORESEARCH_DOGFOOD_CWD: dogfoodCwd,
        },
      },
    );

    assert.match(output, /CONTRACT ok foreground-resume-apply/u);
    assert.match(output, /CONTRACT ok foreground-resume-peer-boundary/u);
    assert.match(output, /METRIC unresolved_foreground_resume_blockers=0/u);
    assert.match(output, /"peerMode": "off"/u);
    assert.match(output, /"finalPosture": "threshold_preserved"/u);
  } finally {
    rmSync(dogfoodCwd, { recursive: true, force: true });
  }
});

test("candidate handoff dogfood script preserves visible-candidate boundaries", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const output = execFileSync(
    process.execPath,
    ["scripts/dogfood-candidate-handoff-contract.mjs"],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: { ...process.env, DOGFOOD_CONTRACT_STRICT: "1" },
    },
  );

  assert.match(output, /CONTRACT ok candidate-bind-ready/u);
  assert.match(output, /CONTRACT ok candidate-decision-plan-only/u);
  assert.match(output, /METRIC unresolved_candidate_handoff_blockers=0/u);
  assert.match(output, /"decision": "threshold_satisfied"/u);
  assert.match(output, /"keep": "keep"/u);
  assert.match(output, /"discardCommandKinds": \[/u);
  assert.match(output, /"remove_worktree"/u);
  assert.match(output, /"delete_branch"/u);
  assert.match(output, /"rewindCommandKinds": \[/u);
  assert.match(output, /"reset_to_base"/u);
  assert.match(output, /"lifecycleStateUnchanged": true/u);
});

test("resume slash UI dogfood script preserves foreground review boundaries", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const dogfoodCwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-resume-ui-dogfood-"));
  try {
    const output = execFileSync(process.execPath, ["scripts/dogfood-resume-ui-contract.mjs"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DOGFOOD_CONTRACT_STRICT: "1",
        PI_AUTORESEARCH_RESUME_UI_DOGFOOD_CWD: dogfoodCwd,
      },
    });

    assert.match(output, /CONTRACT ok resume-slash-review/u);
    assert.match(output, /CONTRACT ok resume-slash-boundary/u);
    assert.match(output, /METRIC unresolved_resume_ui_blockers=0/u);
    assert.match(output, /"editorHasResumeApplyPlan": true/u);
    assert.match(output, /"editorHasExecutor": true/u);
    assert.match(output, /"editorHasExactConfirmation": true/u);
    assert.match(output, /"editorHasConcreteKeys": true/u);
    assert.match(output, /"editorHasBudgetPlaceholders": true/u);
    assert.match(output, /"toolInvocationCount": 0/u);
  } finally {
    rmSync(dogfoodCwd, { recursive: true, force: true });
  }
});

test("dogfood contract suite counts child execution failures as blockers", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        const { aggregateSuiteResults, blockerCount, parseMetric } = await import("./scripts/dogfood-contract-suite.mjs");
        const cases = [
          ["clean", blockerCount({ exitCode: 0, signalFailure: null, metric: 0 }), 0],
          ["metric_zero_nonzero_exit", blockerCount({ exitCode: 1, signalFailure: null, metric: 0 }), 1],
          ["missing_metric", blockerCount({ exitCode: 0, signalFailure: null, metric: null }), 1],
          ["negative_metric", blockerCount({ exitCode: 0, signalFailure: null, metric: -1 }), 1],
          ["signal_failure", blockerCount({ exitCode: 1, signalFailure: "signal:SIGTERM", metric: 0 }), 1],
        ];
        for (const [name, actual, expected] of cases) {
          if (actual !== expected) {
            throw new Error(name + ": expected " + expected + ", got " + actual);
          }
        }
        if (parseMetric("METRIC unresolved_example=0\\n", "unresolved_example") !== 0) {
          throw new Error("expected metric parser to read zero metric");
        }
        const aggregate = aggregateSuiteResults([
          { ok: true, blockers: 0 },
          { ok: false, blockers: 0 },
        ]);
        if (aggregate.unresolved !== 0 || aggregate.hasFailures !== true) {
          throw new Error("expected aggregate to preserve child failure even with zero blockers");
        }
        console.log("suite-failure-aggregation-ok");
      `,
    ],
    { cwd: packageRoot, encoding: "utf8" },
  );

  assert.match(output, /suite-failure-aggregation-ok/u);
});

test("dogfood contract suite treats symlink invocation as CLI execution", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const linkRoot = mkdtempSync(path.join(os.tmpdir(), "autoresearch-suite-symlink-"));
  const suiteLink = path.join(linkRoot, "dogfood-contract-suite.mjs");

  try {
    symlinkSync(path.join(packageRoot, "scripts/dogfood-contract-suite.mjs"), suiteLink);
    for (const args of [[suiteLink], ["--preserve-symlinks-main", suiteLink]]) {
      const output = execFileSync(process.execPath, args, {
        cwd: packageRoot,
        encoding: "utf8",
        env: { ...process.env, DOGFOOD_CONTRACT_STRICT: "1" },
      });

      assert.match(output, /CONTRACT ok workflow-contract/u);
      assert.match(output, /CONTRACT ok foreground-resume-contract/u);
      assert.match(output, /CONTRACT ok resume-ui-contract/u);
      assert.match(output, /CONTRACT ok candidate-handoff-contract/u);
      assert.match(output, /METRIC unresolved_autoresearch_dogfood_suite_blockers=0/u);
    }
  } finally {
    rmSync(linkRoot, { recursive: true, force: true });
  }
});

test("dogfood contract suite runs all current strict autoresearch contracts", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const hostileRoot = mkdtempSync(path.join(os.tmpdir(), "autoresearch-suite-hostile-env-"));
  const hostileCandidateRoot = path.join(hostileRoot, "candidate-root");
  const hostileResumeCwd = path.join(hostileRoot, "resume-cwd");
  const hostileBenchmarkLog = path.join(hostileRoot, "foreground-resume-benchmark.log");
  const hostileResumeUiCwd = path.join(hostileRoot, "resume-ui-cwd");

  try {
    const output = execFileSync(process.execPath, ["scripts/dogfood-contract-suite.mjs"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DOGFOOD_CONTRACT_STRICT: "1",
        PI_AUTORESEARCH_CANDIDATE_DOGFOOD_ROOT: hostileCandidateRoot,
        PI_AUTORESEARCH_DOGFOOD_CWD: hostileResumeCwd,
        PI_AUTORESEARCH_FOREGROUND_RESUME_BENCHMARK_LOG: hostileBenchmarkLog,
        PI_AUTORESEARCH_RESUME_UI_DOGFOOD_CWD: hostileResumeUiCwd,
      },
    });

    assert.match(output, /CONTRACT ok workflow-contract/u);
    assert.match(output, /CONTRACT ok foreground-resume-contract/u);
    assert.match(output, /CONTRACT ok resume-ui-contract/u);
    assert.match(output, /CONTRACT ok candidate-handoff-contract/u);
    assert.match(output, /METRIC unresolved_autoresearch_dogfood_suite_blockers=0/u);
    assert.equal(existsSync(hostileCandidateRoot), false);
    assert.equal(existsSync(hostileResumeCwd), false);
    assert.equal(existsSync(hostileBenchmarkLog), false);
    assert.equal(existsSync(hostileResumeUiCwd), false);
    assert.deepEqual(readdirSync(hostileRoot), []);
  } finally {
    rmSync(hostileRoot, { recursive: true, force: true });
  }
});
