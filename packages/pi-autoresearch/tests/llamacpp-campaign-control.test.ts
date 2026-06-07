import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { registerPiAutoresearchExtension } from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION,
  executeLlamacppCampaignControl,
  executeLlamacppCampaignStage,
  formatLlamacppCampaignControlResult,
  inspectLlamacppCampaignControl,
  planLlamacppCampaignMatrix,
  resolveLlamacppCampaignProjectionPath,
} from "../src/core/llamacppCampaign.ts";

type RegisteredTool = {
  name: string;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: { cwd?: string },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
};

async function withTempDir(fn: (cwd: string) => Promise<void> | void): Promise<void> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-campaign-"));
  try {
    await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function writeFile(target: string, content: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

async function withFakeAkRuntime(
  options: { taskIds?: number[]; mode?: "tasks" | "unavailable" },
  fn: () => Promise<void> | void,
): Promise<void> {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-fake-ak-"));
  const scriptPath = path.join(binDir, "ak");
  writeFile(
    scriptPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== "task" || args[1] !== "show" || !args[2]) {
  console.error("unsupported fake ak invocation");
  process.exit(2);
}
const taskId = Number(args[2]);
const mode = process.env.PI_FAKE_AK_MODE || "tasks";
if (mode === "unavailable") {
  console.error("database is busy");
  process.exit(1);
}
const taskIds = JSON.parse(process.env.PI_FAKE_AK_TASK_IDS_JSON || "[]");
if (taskIds.includes(taskId)) {
  console.log(JSON.stringify({ id: taskId, repo: process.cwd(), status: "pending" }));
  process.exit(0);
}
console.error(\`task \${taskId} not found\`);
process.exit(1);
`,
  );
  chmodSync(scriptPath, 0o755);

  const previousPath = process.env.PATH;
  const previousMode = process.env.PI_FAKE_AK_MODE;
  const previousTaskIds = process.env.PI_FAKE_AK_TASK_IDS_JSON;
  process.env.PATH = `${binDir}${path.delimiter}${previousPath ?? ""}`;
  process.env.PI_FAKE_AK_MODE = options.mode ?? "tasks";
  process.env.PI_FAKE_AK_TASK_IDS_JSON = JSON.stringify(options.taskIds ?? []);

  try {
    await fn();
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    if (previousMode === undefined) {
      delete process.env.PI_FAKE_AK_MODE;
    } else {
      process.env.PI_FAKE_AK_MODE = previousMode;
    }
    if (previousTaskIds === undefined) {
      delete process.env.PI_FAKE_AK_TASK_IDS_JSON;
    } else {
      process.env.PI_FAKE_AK_TASK_IDS_JSON = previousTaskIds;
    }
    rmSync(binDir, { recursive: true, force: true });
  }
}

function initSourceRepo(root: string): string {
  const repo = path.join(root, "source-llama-cpp-turboquant");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Pi Test");
  git(repo, "config", "user.email", "pi-test@example.com");
  writeFile(path.join(repo, "README.md"), "# source\n");
  git(repo, "add", "README.md");
  git(repo, "commit", "-m", "initial");
  git(repo, "checkout", "--quiet", "-b", "pr/tq4-weight-compression");
  writeFile(path.join(repo, "build-a.txt"), "A\n");
  git(repo, "add", "build-a.txt");
  git(repo, "commit", "-m", "build a");
  git(repo, "checkout", "--quiet", "main");
  git(repo, "checkout", "--quiet", "-b", "feature/turboquant-kv-cache");
  writeFile(path.join(repo, "build-b.txt"), "B\n");
  git(repo, "add", "build-b.txt");
  git(repo, "commit", "-m", "build b");
  const cherryPickCommit = git(repo, "rev-parse", "HEAD");
  git(repo, "checkout", "--quiet", "main");
  git(repo, "checkout", "--quiet", "-b", "experiment/layer-adaptive-extended-ctx");
  writeFile(path.join(repo, "build-d.txt"), "D\n");
  git(repo, "add", "build-d.txt");
  git(repo, "commit", "-m", "build d");
  git(repo, "checkout", "--quiet", "main");
  git(repo, "checkout", "--quiet", "-b", "feature/asymmetric-q8_0-K-turbo4-V");
  writeFile(path.join(repo, "build-e.txt"), "E\n");
  git(repo, "add", "build-e.txt");
  git(repo, "commit", "-m", "build e");
  git(repo, "checkout", "--quiet", "main");
  writeFile(path.join(repo, "CHERRY_PICK_COMMIT.txt"), `${cherryPickCommit}\n`);
  return repo;
}

function initBuildBins(root: string): Record<string, string> {
  const base = path.join(root, "build-bins");
  const buildIds = ["A", "B", "C", "D", "E"];
  const buildBins: Record<string, string> = {};
  for (const buildId of buildIds) {
    const buildBinDir = path.join(base, buildId, "bin");
    mkdirSync(buildBinDir, { recursive: true });
    writeFile(path.join(buildBinDir, "llama-bench"), `${buildId}\n`);
    buildBins[buildId] = buildBinDir;
  }
  return buildBins;
}

function stage41Stub(): string {
  return `#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group(required=True)
mode.add_argument("--plan", action="store_true")
mode.add_argument("--apply", action="store_true")
parser.add_argument("--build-bin-dir", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--corpus-output", required=True)
parser.add_argument("--kv-types", nargs="+", required=True)
args = parser.parse_args()
if args.apply:
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps({
        "stage": 41,
        "build_bin_dir": args.build_bin_dir,
        "kv_types": args.kv_types,
    }, indent=2) + "\\n", encoding="utf-8")
    Path(args.corpus_output).write_text("stage41 corpus\\n", encoding="utf-8")
print("stage41 ok")
`;
}

function stage42Stub(): string {
  return `#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group(required=True)
mode.add_argument("--plan", action="store_true")
mode.add_argument("--apply", action="store_true")
parser.add_argument("--reference-receipt", required=True)
parser.add_argument("--build-bin-dir", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--config-i-kv-type", required=True)
parser.add_argument("--q8-kv-types", nargs="+", required=True)
args = parser.parse_args()
if args.apply:
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps({
        "stage": 42,
        "reference_receipt": args.reference_receipt,
        "build_bin_dir": args.build_bin_dir,
        "config_i_kv_type": args.config_i_kv_type,
        "q8_kv_types": args.q8_kv_types,
    }, indent=2) + "\\n", encoding="utf-8")
print("stage42 ok")
`;
}

function stage43Stub(): string {
  return `#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group(required=True)
mode.add_argument("--plan", action="store_true")
mode.add_argument("--apply", action="store_true")
parser.add_argument("--reference-receipt", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--corpus-input")
args = parser.parse_args()
if args.apply:
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps({
        "stage": 43,
        "reference_receipt": args.reference_receipt,
        "corpus_input": args.corpus_input,
    }, indent=2) + "\\n", encoding="utf-8")
print("stage43 ok")
`;
}

function initWorkstationRepo(root: string): string {
  const repo = path.join(root, "workstation");
  writeFile(
    path.join(repo, "scripts/phasee/41-turboquant-pr45-qwen35-validation.py"),
    stage41Stub(),
  );
  writeFile(
    path.join(repo, "scripts/phasee/42-turboquant-pr45-qwen35-q8-comparison.py"),
    stage42Stub(),
  );
  writeFile(
    path.join(repo, "scripts/phasee/43-turboquant-pr45-qwen35-vllm-comparison.py"),
    stage43Stub(),
  );
  return repo;
}

function writeManifest(
  root: string,
  sourceRepo: string,
  workstationRepo: string,
  buildBins: Record<string, string>,
  options?: { includeUnsupportedStage42LaneForC?: boolean },
): string {
  const cherryPickCommit = readFileSync(
    path.join(sourceRepo, "CHERRY_PICK_COMMIT.txt"),
    "utf8",
  ).trim();
  const manifestPath = path.join(root, "campaigns", "llamacpp-wave-001.json");
  const manifestDir = path.dirname(manifestPath);
  const includeUnsupportedStage42LaneForC = options?.includeUnsupportedStage42LaneForC ?? false;
  const payload = {
    kind: AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND,
    version: AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION,
    campaignId: "llamacpp-wave-001",
    objective:
      "Benchmark the highest-value llama.cpp TurboQuant branches and lanes without losing deterministic fork prep.",
    sourceRepoPath: sourceRepo,
    workstationRepoPath: workstationRepo,
    fork: {
      targetRepoPath: path.join(root, "fork", "llama-cpp-turboquant"),
      baseRef: "main",
      workingBranch: "campaign/llamacpp-wave-001",
    },
    workflow: {
      kind: "phasee-41-43",
      stage41Script: "scripts/phasee/41-turboquant-pr45-qwen35-validation.py",
      stage42Script: "scripts/phasee/42-turboquant-pr45-qwen35-q8-comparison.py",
      stage43Script: "scripts/phasee/43-turboquant-pr45-qwen35-vllm-comparison.py",
      executionBinding: {
        receiptRootPath: "phasee/receipts/llamacpp-wave-001",
      },
      stage41BuildIds: ["A", "B", "C", "D", "E"],
      stage42Matrix: [
        { buildId: "A", laneIds: ["config_i_turbo3", "q8_0_turbo4"] },
        { buildId: "B", laneIds: ["config_i_turbo3", "q8_0_turbo4"] },
        {
          buildId: "C",
          laneIds: includeUnsupportedStage42LaneForC
            ? ["config_i_turbo3", "q8_0_turbo4", "q8_0_k_turbo4_v"]
            : ["config_i_turbo3", "q8_0_turbo4"],
        },
      ],
      stage43BuildIds: ["C"],
    },
    builds: [
      {
        id: "A",
        title: "current tq4 weight compression",
        branch: "pr/tq4-weight-compression",
        buildBinDir: path.relative(manifestDir, buildBins.A),
        cherryPickCommits: [],
        lineageSummary: "Use the current PR branch directly.",
        notes: ["validation-first"],
      },
      {
        id: "B",
        title: "turboquant kv-cache branch",
        branch: "feature/turboquant-kv-cache",
        buildBinDir: path.relative(manifestDir, buildBins.B),
        cherryPickCommits: [],
        lineageSummary: "Use the feature branch directly.",
        notes: ["candidate"],
      },
      {
        id: "C",
        title: "kv-cache plus weight-compression cherry-pick",
        branch: "feature/turboquant-kv-cache",
        buildBinDir: path.relative(manifestDir, buildBins.C),
        cherryPickCommits: [cherryPickCommit],
        lineageSummary:
          "Start from the kv-cache branch and layer the weight-compression patch set explicitly.",
        notes: ["compound candidate"],
      },
      {
        id: "D",
        title: "layer-adaptive extended ctx",
        branch: "experiment/layer-adaptive-extended-ctx",
        buildBinDir: path.relative(manifestDir, buildBins.D),
        cherryPickCommits: [],
        lineageSummary: "Standalone experiment branch.",
        notes: ["context experiment"],
      },
      {
        id: "E",
        title: "asymmetric q8_0-K plus turbo4-V",
        branch: "feature/asymmetric-q8_0-K-turbo4-V",
        buildBinDir: path.relative(manifestDir, buildBins.E),
        cherryPickCommits: [],
        lineageSummary: "Standalone asymmetric cache branch.",
        notes: ["optional"],
      },
    ],
    lanes: [
      {
        id: "config_i_turbo3",
        title: "Config I + turbo3",
        runtimeFamily: "config_i",
        kvCacheMode: "turbo3",
        notes: ["carried baseline"],
      },
      {
        id: "q8_0_turbo4",
        title: "q8_0 + turbo4",
        runtimeFamily: "q8_0",
        kvCacheMode: "turbo4",
        notes: ["primary challenger"],
      },
      {
        id: "q8_0_k_turbo4_v",
        title: "q8_0-K + turbo4-V",
        runtimeFamily: "q8_0-k",
        kvCacheMode: "turbo4-v",
        notes: ["inventory only for the unsupported-lane failure test"],
      },
    ],
    evidence: {
      expectedReceiptPaths: [
        "phasee/receipts/llamacpp-wave-001/A-stage41-validation.json",
        "phasee/receipts/llamacpp-wave-001/A-stage42-q8-vs-config-i.json",
        "phasee/receipts/llamacpp-wave-001/C-stage41-validation.json",
        "phasee/receipts/llamacpp-wave-001/C-stage42-q8-vs-config-i.json",
        "phasee/receipts/llamacpp-wave-001/C-stage43-vllm-comparison.json",
      ],
      requiredMetrics: ["ppl", "pp32768_tokens_per_second", "tg128_tokens_per_second"],
    },
  };
  writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
  return manifestPath;
}

function registerHarness() {
  const tools = new Map<string, RegisteredTool>();
  registerPiAutoresearchExtension({
    registerCommand() {},
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
  } as never);
  return { tools };
}

test("inspectLlamacppCampaignControl composes public status with explicit task-context verification state", async () => {
  await withTempDir(async (cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    const unbound = inspectLlamacppCampaignControl({ cwd, manifestPath, updatedAt: 1 });
    assert.equal(unbound.action, "status");
    assert.equal(unbound.control.taskContext.verificationState, "not_requested");
    assert.equal(unbound.control.public.taskBound, false);
    assert.equal(unbound.control.akBinding, null);
    assert.equal(unbound.control.public.nextStepAction, "advance");
    assert.equal(unbound.projectionPath, resolveLlamacppCampaignProjectionPath(cwd));
    assert.equal(unbound.projection.updatedAt, 1);
    assert.equal(unbound.control.autonomy.nextStep.stage, 41);
    assert.equal(unbound.control.autonomy.nextStep.buildId, "A");
    assert.match(
      formatLlamacppCampaignControlResult(unbound),
      /PI-AUTORESEARCH LLAMACPP CAMPAIGN CONTROL/,
    );
    assert.match(formatLlamacppCampaignControlResult(unbound), /## Task context/);
    assert.match(unbound.nextAction, /action=advance/);

    await withFakeAkRuntime({ taskIds: [1698] }, () => {
      const bound = inspectLlamacppCampaignControl({
        cwd,
        manifestPath,
        taskId: 1698,
        updatedAt: 2,
      });
      assert.equal(bound.control.taskContext.verificationState, "verified_live");
      assert.equal(bound.control.public.taskBound, true);
      assert.equal(bound.control.akBinding?.taskId, 1698);
      assert.equal(bound.control.public.completionCandidate, false);
      assert.match(bound.control.public.reason, /verified AK task 1698/);
    });
  });
});

test("inspectLlamacppCampaignControl degrades gracefully when supplied taskId does not resolve live", async () => {
  await withTempDir(async (cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    await withFakeAkRuntime({ taskIds: [] }, () => {
      const status = inspectLlamacppCampaignControl({
        cwd,
        manifestPath,
        taskId: 7001,
        updatedAt: 3,
      });
      assert.equal(status.control.taskContext.verificationState, "not_found");
      assert.equal(status.control.public.taskBound, false);
      assert.equal(status.control.akBinding, null);
      assert.equal(status.control.public.completionCandidate, false);
      assert.match(status.control.public.reason, /did not resolve to a live AK task/);
    });
  });
});

test("executeLlamacppCampaignControl applies one step and refreshes public control", async () => {
  await withTempDir(async (cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const receiptRootPath = path.join(workstationRepo, "phasee/receipts/llamacpp-wave-001");

    await withFakeAkRuntime({ taskIds: [1698] }, () => {
      const result = executeLlamacppCampaignControl({
        cwd,
        manifestPath,
        taskId: 1698,
        apply: true,
        updatedAt: 3,
      });
      assert.equal(result.action, "advance");
      assert.equal(result.mode, "apply");
      assert.equal(result.executedStep?.stage, "41");
      assert.equal(result.executedStep?.buildId, "A");
      assert.equal(existsSync(path.join(receiptRootPath, "A-stage41-validation.json")), true);
      assert.equal(result.control.taskContext.verificationState, "verified_live");
      assert.equal(result.control.public.taskBound, true);
      assert.equal(result.control.autonomy.nextStep.stage, 41);
      assert.equal(result.control.autonomy.nextStep.buildId, "B");
      assert.equal(result.control.public.nextStepAction, "advance");
      assert.equal(result.projectionPath, resolveLlamacppCampaignProjectionPath(cwd));
      assert.equal(result.projection.updatedAt, 3);
      assert.equal(result.projection.status.overallState, "partially_materialized");
      assert.equal(result.control.autonomy.projection.updatedAt, result.projection.updatedAt);
      assert.equal(
        result.control.autonomy.projection.overallState,
        result.projection.status.overallState,
      );
      assert.match(result.nextAction, /action=advance/);
    });
  });
});

test("executeLlamacppCampaignControl still applies one local step when AK verification is unavailable", async () => {
  await withTempDir(async (cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const receiptRootPath = path.join(workstationRepo, "phasee/receipts/llamacpp-wave-001");

    await withFakeAkRuntime({ mode: "unavailable" }, () => {
      const result = executeLlamacppCampaignControl({
        cwd,
        manifestPath,
        taskId: 1698,
        apply: true,
        updatedAt: 4,
      });
      assert.equal(result.mode, "apply");
      assert.equal(result.executedStep?.stage, "41");
      assert.equal(existsSync(path.join(receiptRootPath, "A-stage41-validation.json")), true);
      assert.equal(result.control.taskContext.verificationState, "verification_unavailable");
      assert.equal(result.control.public.taskBound, false);
      assert.equal(result.control.akBinding, null);
      assert.equal(result.control.public.completionCandidate, false);
      assert.match(result.control.public.reason, /verification is currently unavailable/);
    });
  });
});

test("executeLlamacppCampaignControl fails closed for blocked public apply", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    rmSync(buildBins.A, { recursive: true, force: true });

    const status = inspectLlamacppCampaignControl({ cwd, manifestPath, updatedAt: 4 });
    assert.equal(status.control.autonomy.lifecycle.phase, "blocked");
    assert.equal(status.control.public.nextStepAction, "none");
    assert.match(status.control.public.reason, /blocked/);
    assert.match(status.nextAction, /blocked/);

    assert.throws(
      () => executeLlamacppCampaignControl({ cwd, manifestPath, apply: true, updatedAt: 5 }),
      /next campaign step is currently blocked/,
    );
  });
});

test("inspectLlamacppCampaignControl reports terminal completion candidacy without inventing more work", async () => {
  await withTempDir(async (cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    for (const buildId of ["A", "B", "C", "D", "E"]) {
      executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId, apply: true });
    }
    for (const buildId of ["A", "B", "C"]) {
      executeLlamacppCampaignStage({ cwd, manifestPath, stage: "42", buildId, apply: true });
    }
    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "43", buildId: "C", apply: true });

    await withFakeAkRuntime({ taskIds: [1699] }, () => {
      const status = inspectLlamacppCampaignControl({
        cwd,
        manifestPath,
        taskId: 1699,
        updatedAt: 6,
      });
      assert.equal(status.control.taskContext.verificationState, "verified_live");
      assert.equal(status.control.public.taskBound, true);
      assert.equal(status.control.public.nextStepAction, "none");
      assert.equal(status.control.public.completionCandidate, true);
      assert.equal(status.control.autonomy.nextStep.action, "none");
      assert.match(status.control.public.reason, /verified AK task 1699/);
      assert.match(
        status.nextAction,
        /may now evaluate whether verified AK task 1699 should be completed/,
      );
      assert.match(formatLlamacppCampaignControlResult(status), /completion candidate: yes/);

      const plannedAdvance = executeLlamacppCampaignControl({
        cwd,
        manifestPath,
        taskId: 1699,
        updatedAt: 7,
      });
      assert.equal(plannedAdvance.mode, "plan");
      assert.equal(plannedAdvance.executedStep, null);
      assert.equal(plannedAdvance.control.public.nextStepAction, "none");
      assert.match(
        plannedAdvance.nextAction,
        /verified AK task 1699 should be completed explicitly/,
      );
    });
  });
});

test("execution binding fails closed when the receipt root escapes the workstation repo", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const payload = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      workflow: { executionBinding: { receiptRootPath: string } };
    };
    payload.workflow.executionBinding.receiptRootPath = "../outside-receipts";
    writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);

    assert.throws(
      () => executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId: "A" }),
      /must stay within/,
    );
  });
});

test("execution binding fails closed when workflow anchors escape through symlinks", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const outsideDir = path.join(cwd, "outside-workflow");
    writeFile(path.join(outsideDir, "41.py"), stage41Stub());
    symlinkSync(outsideDir, path.join(workstationRepo, "escaped-workflow"), "dir");
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const payload = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      workflow: { stage41Script: string };
    };
    payload.workflow.stage41Script = "escaped-workflow/41.py";
    writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);

    assert.throws(
      () => executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId: "A" }),
      /must stay within/,
    );
  });
});

test("manifest validation rejects invalid cherry-pick provenance", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const payload = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      builds: Array<{ cherryPickCommits: string[] }>;
    };
    const compoundBuild = payload.builds.at(2);
    assert.ok(compoundBuild);
    compoundBuild.cherryPickCommits = ["not-a-commit"];
    writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);

    assert.throws(
      () => planLlamacppCampaignMatrix({ cwd, manifestPath }),
      /invalid git commit-ish/,
    );
  });
});

test("extension registers the public llama.cpp campaign-control tool and enforces its bounded contract", async () => {
  await withTempDir(async (cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME);
    assert.ok(tool);

    await withFakeAkRuntime({ taskIds: [1698] }, async () => {
      const statusResult = await tool?.execute(
        "campaign-control-status-1",
        {
          action: "status",
          cwd,
          manifestPath,
          taskId: 1698,
        },
        undefined,
        undefined,
        { cwd },
      );

      const statusText = statusResult?.content[0]?.text ?? "";
      assert.match(statusText, /action: status/);
      assert.match(statusText, /## Task context/);
      assert.match(statusText, /verification state: verified_live/);
      assert.match(statusText, /task bound: yes/);
      assert.match(statusText, /next step action: advance/);
      assert.match(statusText, /## Projection/);
      assert.match(statusText, /path: \(not persisted\)/);
      assert.match(statusText, /persistence: skipped/);
      assert.match(statusText, /overall state: planned_only/);
      assert.equal(existsSync(resolveLlamacppCampaignProjectionPath(cwd)), false);
    });

    const advanceResult = await tool?.execute(
      "campaign-control-advance-1",
      {
        action: "advance",
        cwd,
        manifestPath,
      },
      undefined,
      undefined,
      { cwd },
    );

    const advanceText = advanceResult?.content[0]?.text ?? "";
    assert.match(advanceText, /action: advance/);
    assert.match(advanceText, /mode: plan/);
    assert.match(advanceText, /build: A/);
    assert.match(advanceText, /## Projection/);
    const advanceDetails = advanceResult?.details as {
      projectionPath: string;
      projection: { updatedAt: number; status: { overallState: string } };
      control: { autonomy: { projection: { updatedAt: number; overallState: string } } };
    };
    assert.equal(advanceDetails.projectionPath, null);
    assert.equal(
      advanceDetails.control.autonomy.projection.updatedAt,
      advanceDetails.projection.updatedAt,
    );
    assert.equal(
      advanceDetails.control.autonomy.projection.overallState,
      advanceDetails.projection.status.overallState,
    );

    const persistedStatus = await tool?.execute(
      "campaign-control-status-persist-1",
      {
        action: "status",
        cwd,
        manifestPath,
        persistProjection: true,
      },
      undefined,
      undefined,
      { cwd },
    );
    const persistedDetails = persistedStatus?.details as { projectionPath: string | null };
    assert.equal(persistedDetails.projectionPath, resolveLlamacppCampaignProjectionPath(cwd));
    assert.equal(existsSync(resolveLlamacppCampaignProjectionPath(cwd)), true);

    await assert.rejects(
      () =>
        tool?.execute(
          "campaign-control-status-invalid",
          {
            action: "status",
            cwd,
            manifestPath,
            apply: true,
          },
          undefined,
          undefined,
          { cwd },
        ) ?? Promise.reject(new Error("tool missing")),
      /apply=true is only supported with action=advance/,
    );
  });
});

test("extension registers the llama.cpp campaign tool and executes advance_campaign", async () => {
  await withTempDir(async (cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME);
    assert.ok(tool);

    const result = await tool?.execute(
      "campaign-advance-1",
      {
        action: "advance_campaign",
        cwd,
        manifestPath,
      },
      undefined,
      undefined,
      { cwd },
    );

    const text = result?.content[0]?.text ?? "";
    assert.match(text, /action: advance_campaign/);
    assert.match(text, /phase: stage41_wave/);
    assert.match(text, /build: A/);
    assert.match(text, /## Projection/);
    assert.match(text, /path: \(not persisted\)/);
    assert.match(text, /overall state: planned_only/);
    assert.equal(existsSync(resolveLlamacppCampaignProjectionPath(cwd)), false);
  });
});

test("extension registers the llama.cpp campaign tool and executes execute_stage", async () => {
  await withTempDir(async (cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME);
    assert.ok(tool);

    const result = await tool?.execute(
      "campaign-1",
      {
        action: "execute_stage",
        cwd,
        manifestPath,
        stage: "41",
        buildId: "A",
      },
      undefined,
      undefined,
      { cwd },
    );

    const text = result?.content[0]?.text ?? "";
    assert.match(text, /action: execute_stage/);
    assert.match(text, /stage: 41/);
    assert.match(text, /output receipt: .*A-stage41-validation\.json/);
    assert.match(text, /## Projection/);
    assert.match(text, /path: \(not persisted\)/);
    assert.match(text, /overall state: planned_only/);
    assert.equal(existsSync(resolveLlamacppCampaignProjectionPath(cwd)), false);
  });
});

test("extension registers the llama.cpp campaign tool and executes build_ak_binding", async () => {
  await withTempDir(async (cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME);
    assert.ok(tool);

    const result = await tool?.execute(
      "campaign-2",
      {
        action: "build_ak_binding",
        cwd,
        manifestPath,
        taskId: 1648,
      },
      undefined,
      undefined,
      { cwd },
    );

    const text = result?.content[0]?.text ?? "";
    assert.match(text, /action: build_ak_binding/);
    assert.match(text, /task id: 1648/);
    assert.match(text, /milestone: planned/);
    assert.match(text, /projection key: task:1648\|manifest:/);
    assert.match(text, /## Projection/);
    assert.match(text, /path: \(not persisted\)/);
    assert.match(text, /overall state: planned_only/);
    assert.equal(existsSync(resolveLlamacppCampaignProjectionPath(cwd)), false);
  });
});

test("build_ak_binding tool stays non-mutating even when the terminal stage is complete", async () => {
  await withTempDir(async (cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const { tools } = registerHarness();
    const tool = tools.get(AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME);
    assert.ok(tool);

    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId: "A", apply: true });
    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId: "B", apply: true });
    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId: "C", apply: true });
    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId: "D", apply: true });
    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId: "E", apply: true });
    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "42", buildId: "A", apply: true });
    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "42", buildId: "B", apply: true });
    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "42", buildId: "C", apply: true });
    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "43", buildId: "C", apply: true });

    const result = await tool?.execute(
      "campaign-3",
      {
        action: "build_ak_binding",
        cwd,
        manifestPath,
        taskId: 1651,
      },
      undefined,
      undefined,
      { cwd },
    );

    const text = result?.content[0]?.text ?? "";
    assert.match(text, /milestone: terminal_stage_complete/);
    assert.match(text, /completion eligible: yes/);
    assert.match(text, /this helper does not mutate AK directly/);
  });
});
