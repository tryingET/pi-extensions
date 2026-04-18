import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { registerPiAutoresearchExtension } from "../extensions/pi-autoresearch.ts";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_KIND,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_VERSION,
  advanceLlamacppCampaign,
  buildLlamacppCampaignAkBinding,
  buildLlamacppCampaignAkBindingDetails,
  buildLlamacppCampaignAutonomy,
  executeLlamacppCampaignControl,
  executeLlamacppCampaignStage,
  formatLlamacppCampaignControlResult,
  formatLlamacppCampaignResult,
  inspectLlamacppCampaignControl,
  loadLlamacppCampaignProjectionState,
  persistLlamacppCampaignProjection,
  planLlamacppCampaignMatrix,
  prepareLlamacppCampaignFork,
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

function readJson<T>(target: string): T {
  return JSON.parse(readFileSync(target, "utf8")) as T;
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
  git(repo, "checkout", "-b", "pr/tq4-weight-compression");
  writeFile(path.join(repo, "build-a.txt"), "A\n");
  git(repo, "add", "build-a.txt");
  git(repo, "commit", "-m", "build a");
  git(repo, "checkout", "main");
  git(repo, "checkout", "-b", "feature/turboquant-kv-cache");
  writeFile(path.join(repo, "build-b.txt"), "B\n");
  git(repo, "add", "build-b.txt");
  git(repo, "commit", "-m", "build b");
  const cherryPickCommit = git(repo, "rev-parse", "HEAD");
  git(repo, "checkout", "main");
  git(repo, "checkout", "-b", "experiment/layer-adaptive-extended-ctx");
  writeFile(path.join(repo, "build-d.txt"), "D\n");
  git(repo, "add", "build-d.txt");
  git(repo, "commit", "-m", "build d");
  git(repo, "checkout", "main");
  git(repo, "checkout", "-b", "feature/asymmetric-q8_0-K-turbo4-V");
  writeFile(path.join(repo, "build-e.txt"), "E\n");
  git(repo, "add", "build-e.txt");
  git(repo, "commit", "-m", "build e");
  git(repo, "checkout", "main");
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

test("planLlamacppCampaignMatrix expands the manifest into explicit stage plans", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    const result = planLlamacppCampaignMatrix({ cwd, manifestPath });
    assert.equal(result.campaignId, "llamacpp-wave-001");
    assert.equal(result.stage41.length, 5);
    assert.equal(result.stage42.length, 6);
    assert.equal(result.stage43.length, 1);
    assert.equal(
      result.receiptRootPath,
      path.join(workstationRepo, "phasee/receipts/llamacpp-wave-001"),
    );
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? "", /receipt root does not exist yet/);
    assert.match(formatLlamacppCampaignResult(result), /Stage 42 — branch\/lane matrix/);
  });
});

test("prepareLlamacppCampaignFork plan reports the intended git steps", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    const result = prepareLlamacppCampaignFork({ cwd, manifestPath });
    assert.equal(result.mode, "plan");
    assert.equal(result.sourceRepoExists, true);
    assert.equal(result.targetRepoExists, false);
    assert.equal(result.commands.length, 3);
    assert.match(result.commands[0]?.command.join(" ") ?? "", /git clone/);
  });
});

test("prepareLlamacppCampaignFork apply clones the repo and checks out the working branch", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    const result = prepareLlamacppCampaignFork({ cwd, manifestPath, apply: true });
    assert.equal(result.mode, "apply");
    assert.equal(result.targetRepoExists, true);
    assert.equal(result.targetRepoClean, true);
    const branch = git(result.targetRepoPath, "rev-parse", "--abbrev-ref", "HEAD");
    assert.equal(branch, "campaign/llamacpp-wave-001");
  });
});

test("executeLlamacppCampaignStage stage 41 plan derives exact args and build-scoped outputs", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    const result = executeLlamacppCampaignStage({
      cwd,
      manifestPath,
      stage: "41",
      buildId: "A",
    });

    assert.equal(result.mode, "plan");
    assert.equal(result.buildBinDir, buildBins.A);
    assert.equal(
      result.outputs.receiptPath,
      path.join(workstationRepo, "phasee/receipts/llamacpp-wave-001/A-stage41-validation.json"),
    );
    assert.equal(
      result.outputs.corpusPath,
      path.join(workstationRepo, "phasee/receipts/llamacpp-wave-001/A-stage41-corpus.txt"),
    );
    assert.deepEqual(result.translation.stage41KvTypes, ["f16", "turbo3", "turbo4"]);
    assert.deepEqual(result.command.command.slice(0, 4), [
      "python3",
      path.join(workstationRepo, "scripts/phasee/41-turboquant-pr45-qwen35-validation.py"),
      "--plan",
      "--build-bin-dir",
    ]);
    assert.match(formatLlamacppCampaignResult(result), /stage41 kv types: f16, turbo3, turbo4/);
  });
});

test("executeLlamacppCampaignStage apply can invoke staged 41/42/43 scripts for one supported build", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    const stage41 = executeLlamacppCampaignStage({
      cwd,
      manifestPath,
      stage: "41",
      buildId: "C",
      apply: true,
    });
    const stage41Receipt = readJson<{ stage: number; kv_types: string[] }>(
      stage41.outputs.receiptPath,
    );
    assert.equal(stage41Receipt.stage, 41);
    assert.deepEqual(stage41Receipt.kv_types, ["f16", "turbo3", "turbo4"]);
    assert.equal(existsSync(stage41.outputs.corpusPath ?? ""), true);

    const stage42 = executeLlamacppCampaignStage({
      cwd,
      manifestPath,
      stage: "42",
      buildId: "C",
      apply: true,
    });
    const stage42Receipt = readJson<{
      stage: number;
      reference_receipt: string;
      q8_kv_types: string[];
    }>(stage42.outputs.receiptPath);
    assert.equal(stage42Receipt.stage, 42);
    assert.equal(stage42Receipt.reference_receipt, stage41.outputs.receiptPath);
    assert.deepEqual(stage42Receipt.q8_kv_types, ["turbo4"]);

    const stage43 = executeLlamacppCampaignStage({
      cwd,
      manifestPath,
      stage: "43",
      buildId: "C",
      apply: true,
    });
    const stage43Receipt = readJson<{
      stage: number;
      reference_receipt: string;
      corpus_input: string | null;
    }>(stage43.outputs.receiptPath);
    assert.equal(stage43Receipt.stage, 43);
    assert.equal(stage43Receipt.reference_receipt, stage42.outputs.receiptPath);
    assert.equal(stage43Receipt.corpus_input, stage41.outputs.corpusPath);
    assert.match(stage43.command.command.join(" "), /--corpus-input/);
  });
});

test("executeLlamacppCampaignStage stage 42 fails closed when the stage-41 receipt is missing", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    assert.throws(
      () =>
        executeLlamacppCampaignStage({
          cwd,
          manifestPath,
          stage: "42",
          buildId: "A",
          apply: true,
        }),
      /required prerequisite path is missing: stage41_reference_receipt/,
    );
  });
});

test("executeLlamacppCampaignStage stage 42 fails closed when manifest lanes do not fit the current script contract", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins, {
      includeUnsupportedStage42LaneForC: true,
    });

    assert.throws(
      () =>
        executeLlamacppCampaignStage({
          cwd,
          manifestPath,
          stage: "42",
          buildId: "C",
        }),
      /cannot be translated into the current workstation script contract/,
    );
  });
});

test("executeLlamacppCampaignStage stage 43 fails closed when the stage-42 receipt is missing", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    executeLlamacppCampaignStage({
      cwd,
      manifestPath,
      stage: "41",
      buildId: "C",
      apply: true,
    });

    assert.throws(
      () =>
        executeLlamacppCampaignStage({
          cwd,
          manifestPath,
          stage: "43",
          buildId: "C",
          apply: true,
        }),
      /required prerequisite path is missing: stage42_reference_receipt/,
    );
  });
});

test("persistLlamacppCampaignProjection writes and refreshes the bounded campaign projection", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    const initial = persistLlamacppCampaignProjection({ cwd, manifestPath });
    assert.equal(initial.path, resolveLlamacppCampaignProjectionPath(cwd));
    assert.equal(initial.projection.status.overallState, "planned_only");

    executeLlamacppCampaignStage({
      cwd,
      manifestPath,
      stage: "41",
      buildId: "C",
      apply: true,
    });
    executeLlamacppCampaignStage({
      cwd,
      manifestPath,
      stage: "42",
      buildId: "C",
      apply: true,
    });
    executeLlamacppCampaignStage({
      cwd,
      manifestPath,
      stage: "43",
      buildId: "C",
      apply: true,
    });

    const refreshed = persistLlamacppCampaignProjection({ cwd, manifestPath });
    const projectedBuildC = refreshed.projection.builds.find((build) => build.buildId === "C");
    assert.ok(projectedBuildC);
    assert.equal(projectedBuildC?.highestCompletedStage, 43);
    assert.equal(projectedBuildC?.stages["43"].receiptExists, true);
    assert.equal(refreshed.projection.status.overallState, "partially_materialized");

    const state = loadLlamacppCampaignProjectionState({ cwd });
    assert.equal(state.availability, "current");
    assert.equal(state.projection?.status.overallState, "partially_materialized");
  });
});

test("buildLlamacppCampaignAkBinding derives a planned snapshot with a stable projection key", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    const first = buildLlamacppCampaignAkBinding({
      cwd,
      manifestPath,
      taskId: 1648,
      updatedAt: 1,
    });
    const second = buildLlamacppCampaignAkBinding({
      cwd,
      manifestPath,
      taskId: 1648,
      updatedAt: 2,
    });
    const details = buildLlamacppCampaignAkBindingDetails(first);

    assert.equal(first.taskId, 1648);
    assert.equal(first.manifest.campaignId, "llamacpp-wave-001");
    assert.equal(first.manifest.terminalStage, 43);
    assert.equal(first.projection.overallState, "planned_only");
    assert.equal(first.ak.milestone, "planned");
    assert.equal(first.ak.checkType, "autoresearch:llamacpp-campaign:planned");
    assert.equal(first.lifecycle.completionEligible, false);
    assert.equal(first.lifecycle.action, "evidence_only");
    assert.equal(first.stages.stage41ExpectedBuilds, 5);
    assert.equal(first.stages.stage42ExpectedBuilds, 3);
    assert.equal(first.stages.stage43ExpectedBuilds, 1);
    assert.equal(first.projection.projectionKey, second.projection.projectionKey);
    assert.equal(details.task_id, 1648);
    assert.equal(details.projection_key, first.projection.projectionKey);
    assert.equal(details.milestone, "planned");
    assert.match(
      formatLlamacppCampaignResult({
        action: "build_ak_binding",
        binding: first,
        details,
        nextAction: "record evidence",
      }),
      /milestone: planned/,
    );
  });
});

test("buildLlamacppCampaignAkBinding maps stage milestones through terminal completion", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId: "A", apply: true });
    let binding = buildLlamacppCampaignAkBinding({ cwd, manifestPath, taskId: 1648 });
    assert.equal(binding.projection.overallState, "partially_materialized");
    assert.equal(binding.ak.milestone, "materializing");
    assert.equal(binding.lifecycle.completionEligible, false);

    for (const buildId of ["B", "C", "D", "E"]) {
      executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId, apply: true });
    }
    binding = buildLlamacppCampaignAkBinding({ cwd, manifestPath, taskId: 1648 });
    assert.equal(binding.projection.overallState, "stage41_complete");
    assert.equal(binding.ak.milestone, "stage41_complete");
    assert.equal(binding.lifecycle.action, "evidence_only");

    for (const buildId of ["A", "B", "C"]) {
      executeLlamacppCampaignStage({ cwd, manifestPath, stage: "42", buildId, apply: true });
    }
    binding = buildLlamacppCampaignAkBinding({ cwd, manifestPath, taskId: 1648 });
    assert.equal(binding.projection.overallState, "stage42_complete");
    assert.equal(binding.ak.milestone, "stage42_complete");
    assert.equal(binding.lifecycle.completionEligible, false);

    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "43", buildId: "C", apply: true });
    binding = buildLlamacppCampaignAkBinding({ cwd, manifestPath, taskId: 1648 });
    assert.equal(binding.projection.overallState, "stage43_complete");
    assert.equal(binding.ak.milestone, "terminal_stage_complete");
    assert.equal(binding.ak.checkType, "autoresearch:llamacpp-campaign:terminal-stage-complete");
    assert.equal(binding.lifecycle.completionEligible, true);
    assert.equal(binding.lifecycle.action, "complete_task_candidate");
  });
});

test("buildLlamacppCampaignAkBinding derives truthful terminal stages for 42-only and 41-only manifests", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const payload = readJson<{
      workflow: {
        stage41BuildIds: string[];
        stage42Matrix: Array<{ buildId: string; laneIds: string[] }>;
        stage43BuildIds: string[];
      };
    }>(manifestPath);

    payload.workflow.stage43BuildIds = [];
    writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
    for (const buildId of ["A", "B", "C", "D", "E"]) {
      executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId, apply: true });
    }
    for (const buildId of ["A", "B", "C"]) {
      executeLlamacppCampaignStage({ cwd, manifestPath, stage: "42", buildId, apply: true });
    }
    let binding = buildLlamacppCampaignAkBinding({ cwd, manifestPath, taskId: 1650 });
    assert.equal(binding.manifest.terminalStage, 42);
    assert.equal(binding.ak.milestone, "terminal_stage_complete");
    assert.equal(binding.lifecycle.completionEligible, true);

    payload.workflow.stage42Matrix = [];
    writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
    binding = buildLlamacppCampaignAkBinding({ cwd, manifestPath, taskId: 1650 });
    assert.equal(binding.manifest.terminalStage, 41);
    assert.equal(binding.ak.milestone, "terminal_stage_complete");
    assert.equal(binding.lifecycle.completionEligible, true);
  });
});

test("buildLlamacppCampaignAkBinding fails closed for invalid task ids and zero-stage manifests", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    assert.throws(
      () => buildLlamacppCampaignAkBinding({ cwd, manifestPath, taskId: 0 }),
      /taskId must be a positive integer/,
    );

    const payload = readJson<{
      workflow: {
        stage41BuildIds: string[];
        stage42Matrix: Array<{ buildId: string; laneIds: string[] }>;
        stage43BuildIds: string[];
      };
    }>(manifestPath);
    payload.workflow.stage41BuildIds = [];
    payload.workflow.stage42Matrix = [];
    payload.workflow.stage43BuildIds = [];
    writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);

    assert.throws(
      () => buildLlamacppCampaignAkBinding({ cwd, manifestPath, taskId: 1650 }),
      /does not define any executable stage expectation/,
    );
  });
});

test("buildLlamacppCampaignAutonomy derives stage-gated next-step truth through terminal completion", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    let autonomy = buildLlamacppCampaignAutonomy({ cwd, manifestPath, updatedAt: 1 });
    assert.equal(autonomy.lifecycle.phase, "stage41_wave");
    assert.equal(autonomy.nextStep.stage, 41);
    assert.equal(autonomy.nextStep.buildId, "A");
    assert.equal(autonomy.stages.stage41CompletedBuilds, 0);
    assert.equal(autonomy.lifecycle.terminalStageMaterialized, false);

    for (const buildId of ["A", "B", "C", "D", "E"]) {
      executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId, apply: true });
    }
    autonomy = buildLlamacppCampaignAutonomy({ cwd, manifestPath, updatedAt: 2 });
    assert.equal(autonomy.lifecycle.phase, "stage42_wave");
    assert.equal(autonomy.nextStep.stage, 42);
    assert.equal(autonomy.nextStep.buildId, "A");
    assert.equal(autonomy.stages.stage41CompletedBuilds, 5);

    for (const buildId of ["A", "B", "C"]) {
      executeLlamacppCampaignStage({ cwd, manifestPath, stage: "42", buildId, apply: true });
    }
    autonomy = buildLlamacppCampaignAutonomy({ cwd, manifestPath, updatedAt: 3 });
    assert.equal(autonomy.lifecycle.phase, "stage43_wave");
    assert.equal(autonomy.nextStep.stage, 43);
    assert.equal(autonomy.nextStep.buildId, "C");
    assert.equal(autonomy.stages.stage42CompletedBuilds, 3);

    executeLlamacppCampaignStage({ cwd, manifestPath, stage: "43", buildId: "C", apply: true });
    autonomy = buildLlamacppCampaignAutonomy({ cwd, manifestPath, updatedAt: 4 });
    assert.equal(autonomy.lifecycle.phase, "terminal_stage_complete");
    assert.equal(autonomy.lifecycle.terminalStageMaterialized, true);
    assert.equal(autonomy.nextStep.action, "none");
    assert.equal(autonomy.nextStep.stage, null);
    assert.equal(autonomy.nextStep.buildId, null);
  });
});

test("buildLlamacppCampaignAutonomy derives truthful terminal completion for 42-only and 41-only manifests", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const payload = readJson<{
      workflow: {
        stage41BuildIds: string[];
        stage42Matrix: Array<{ buildId: string; laneIds: string[] }>;
        stage43BuildIds: string[];
      };
    }>(manifestPath);

    payload.workflow.stage43BuildIds = [];
    writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
    for (const buildId of ["A", "B", "C", "D", "E"]) {
      executeLlamacppCampaignStage({ cwd, manifestPath, stage: "41", buildId, apply: true });
    }
    for (const buildId of ["A", "B", "C"]) {
      executeLlamacppCampaignStage({ cwd, manifestPath, stage: "42", buildId, apply: true });
    }
    let autonomy = buildLlamacppCampaignAutonomy({ cwd, manifestPath, updatedAt: 5 });
    assert.equal(autonomy.manifest.terminalStage, 42);
    assert.equal(autonomy.lifecycle.phase, "terminal_stage_complete");
    assert.equal(autonomy.lifecycle.terminalStageMaterialized, true);
    assert.equal(autonomy.nextStep.action, "none");

    payload.workflow.stage42Matrix = [];
    writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
    autonomy = buildLlamacppCampaignAutonomy({ cwd, manifestPath, updatedAt: 6 });
    assert.equal(autonomy.manifest.terminalStage, 41);
    assert.equal(autonomy.lifecycle.phase, "terminal_stage_complete");
    assert.equal(autonomy.lifecycle.terminalStageMaterialized, true);
    assert.equal(autonomy.nextStep.action, "none");
  });
});

test("buildLlamacppCampaignAutonomy surfaces blocked next steps without widening into hidden prep", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    rmSync(buildBins.A, { recursive: true, force: true });

    const autonomy = buildLlamacppCampaignAutonomy({ cwd, manifestPath });
    assert.equal(autonomy.lifecycle.phase, "blocked");
    assert.equal(autonomy.nextStep.stage, 41);
    assert.equal(autonomy.nextStep.buildId, "A");
    assert.match(autonomy.nextStep.reason, /build_bin_dir/);
    assert.match(autonomy.lifecycle.reason, /currently blocked/);
  });
});

test("advanceLlamacppCampaign applies exactly one next step and stops", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const receiptRootPath = path.join(workstationRepo, "phasee/receipts/llamacpp-wave-001");

    const result = advanceLlamacppCampaign({ cwd, manifestPath, apply: true, updatedAt: 1 });
    assert.equal(result.mode, "apply");
    assert.equal(result.autonomy.lifecycle.phase, "stage41_wave");
    assert.equal(result.autonomy.nextStep.stage, 41);
    assert.equal(result.autonomy.nextStep.buildId, "A");
    assert.equal(result.executedStep?.stage, "41");
    assert.equal(existsSync(path.join(receiptRootPath, "A-stage41-validation.json")), true);
    assert.equal(existsSync(path.join(receiptRootPath, "B-stage41-validation.json")), false);
    assert.match(formatLlamacppCampaignResult(result), /action: advance_campaign/);

    const after = buildLlamacppCampaignAutonomy({ cwd, manifestPath, updatedAt: 2 });
    assert.equal(after.nextStep.stage, 41);
    assert.equal(after.nextStep.buildId, "B");
  });
});

test("advanceLlamacppCampaign fails closed in apply mode after terminal-stage completion", async () => {
  await withTempDir((cwd) => {
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

    const planned = advanceLlamacppCampaign({ cwd, manifestPath, updatedAt: 7 });
    assert.equal(planned.mode, "plan");
    assert.equal(planned.autonomy.lifecycle.phase, "terminal_stage_complete");
    assert.equal(planned.executedStep, null);
    assert.equal(planned.autonomy.nextStep.action, "none");

    assert.throws(
      () => advanceLlamacppCampaign({ cwd, manifestPath, apply: true, updatedAt: 8 }),
      /has no further executable next step because terminal stage 43 is already materially complete/,
    );
  });
});

test("inspectLlamacppCampaignControl composes public status with optional exact-task context", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);

    const unbound = inspectLlamacppCampaignControl({ cwd, manifestPath, updatedAt: 1 });
    assert.equal(unbound.action, "status");
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
    assert.match(unbound.nextAction, /action=advance/);

    const bound = inspectLlamacppCampaignControl({
      cwd,
      manifestPath,
      taskId: 1698,
      updatedAt: 2,
    });
    assert.equal(bound.control.public.taskBound, true);
    assert.equal(bound.control.akBinding?.taskId, 1698);
    assert.equal(bound.control.public.completionCandidate, false);
    assert.match(bound.control.public.reason, /next truthful public campaign-control step/);
  });
});

test("executeLlamacppCampaignControl applies one step and refreshes public control", async () => {
  await withTempDir((cwd) => {
    const sourceRepo = initSourceRepo(cwd);
    const buildBins = initBuildBins(cwd);
    const workstationRepo = initWorkstationRepo(cwd);
    const manifestPath = writeManifest(cwd, sourceRepo, workstationRepo, buildBins);
    const receiptRootPath = path.join(workstationRepo, "phasee/receipts/llamacpp-wave-001");

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
  await withTempDir((cwd) => {
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

    const status = inspectLlamacppCampaignControl({
      cwd,
      manifestPath,
      taskId: 1699,
      updatedAt: 6,
    });
    assert.equal(status.control.public.taskBound, true);
    assert.equal(status.control.public.nextStepAction, "none");
    assert.equal(status.control.public.completionCandidate, true);
    assert.equal(status.control.autonomy.nextStep.action, "none");
    assert.match(status.control.public.reason, /completion candidate/);
    assert.match(status.nextAction, /may now evaluate whether AK task 1699 should be completed/);
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
    assert.match(plannedAdvance.nextAction, /AK task 1699 should be completed explicitly/);
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
    assert.match(statusText, /exact task context: yes/);
    assert.match(statusText, /next step action: advance/);
    assert.match(statusText, /## Projection/);
    assert.match(statusText, /overall state: planned_only/);

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
    assert.equal(advanceDetails.projectionPath, resolveLlamacppCampaignProjectionPath(cwd));
    assert.equal(
      advanceDetails.control.autonomy.projection.updatedAt,
      advanceDetails.projection.updatedAt,
    );
    assert.equal(
      advanceDetails.control.autonomy.projection.overallState,
      advanceDetails.projection.status.overallState,
    );

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
    assert.match(text, /overall state: planned_only/);
    assert.equal(existsSync(resolveLlamacppCampaignProjectionPath(cwd)), true);
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
    assert.match(text, /overall state: planned_only/);
    assert.equal(existsSync(resolveLlamacppCampaignProjectionPath(cwd)), true);
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
    assert.match(text, /overall state: planned_only/);
    assert.equal(existsSync(resolveLlamacppCampaignProjectionPath(cwd)), true);
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
