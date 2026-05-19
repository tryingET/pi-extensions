import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const AUTORESEARCH_VLLM_CAMPAIGN_TOOL_NAME = "autoresearch_vllm_campaign";

export type VllmCampaignAction = "status" | "plan" | "run_segment_plan" | "handoff_prompt";

export interface VllmCampaignRequest {
  action?: VllmCampaignAction;
  cwd?: string;
  modelPath?: string;
  hardware?: string;
  knowledgeBase?: string;
  objective?: string;
  maxWallClockMinutes?: number;
  maxIterations?: number;
  maxCellsPerSegment?: number;
  targets?: string[];
  matrixAxes?: Record<string, string[]>;
  benchmarkProfile?: "smoke" | "longcot" | "throughput";
}

export interface VllmCampaignStatusProbe {
  name: string;
  ok: boolean;
  command?: string;
  summary: string;
}

export interface VllmCampaignPlan {
  action: VllmCampaignAction;
  cwd: string;
  modelPath: string;
  modelPathExists: boolean;
  hardware: string;
  knowledgeBase: string;
  knowledgeBaseExists: boolean;
  objective: string;
  safetyBoundary: string[];
  statusProbes: VllmCampaignStatusProbe[];
  targetCatalog: {
    path: string;
    exists: boolean;
    matchingTargets: string[];
    recommendedTargets: string[];
    targetMissingForModelPath: boolean;
  };
  matrix: {
    maxCellsPerSegment: number;
    axes: Record<string, string[]>;
    plannedCellCount: number;
  };
  benchmark: {
    profile: "smoke" | "longcot" | "throughput";
    command: string;
    metricName: string;
    direction: "higher" | "lower";
  };
  exactToolCalls: string[];
  nextActions: string[];
  handoffPrompt: string;
}

const DEFAULT_CWD = "/home/tryinget/ai-society/softwareco/infra/workstation";
const DEFAULT_MODEL_PATH =
  "/data/vllm/hf-cache/hub/models--kasimat--Qwen3.6-27B-AEON-Ultimate-Uncensored-FP8-MTP/";
const DEFAULT_HARDWARE = "RTX 6000 PRO WS";
const DEFAULT_KNOWLEDGE_BASE = "../../contrib/blackwell-gpu-wiki";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function truncate(value: string, max = 900): string {
  const normalized = value.replace(/\s+$/g, "").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 24)}\n... [truncated]`;
}

function runProbe(
  cwd: string,
  name: string,
  command: string,
  timeoutMs = 2500,
): VllmCampaignStatusProbe {
  try {
    const output = execFileSync(command, {
      cwd,
      shell: "/bin/bash",
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { name, ok: true, command, summary: truncate(output) || "ok" };
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    const stdout = typeof err.stdout === "string" ? err.stdout : err.stdout?.toString("utf8") || "";
    const stderr = typeof err.stderr === "string" ? err.stderr : err.stderr?.toString("utf8") || "";
    return {
      name,
      ok: false,
      command,
      summary: truncate([stdout, stderr, err.message || "probe failed"].filter(Boolean).join("\n")),
    };
  }
}

function resolveUnderCwd(cwd: string, maybeRelative: string): string {
  return path.isAbsolute(maybeRelative) ? maybeRelative : path.resolve(cwd, maybeRelative);
}

function loadTargetIds(targetCatalogPath: string): string[] {
  if (!existsSync(targetCatalogPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(targetCatalogPath, "utf8")) as {
      targets?: Array<{
        target_id?: unknown;
        model?: unknown;
        description?: unknown;
        label?: unknown;
      }>;
    };
    return (parsed.targets || [])
      .map((target) => String(target.target_id || "").trim())
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

function findRecentRunState(cwd: string): string | null {
  const runsDir = path.join(cwd, "runtime/m14-longcot-local-benchmark/runs");
  if (!existsSync(runsDir)) return null;
  try {
    const candidates = readdirSync(runsDir)
      .map((entry) => path.join(runsDir, entry, "run.state.json"))
      .filter((entry) => existsSync(entry))
      .map((entry) => ({ entry, mtime: statSync(entry).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return candidates[0]?.entry || null;
  } catch {
    return null;
  }
}

function buildDefaultAxes(targets: string[]): Record<string, string[]> {
  return {
    target: targets.length > 0 ? targets : ["configi-27b-direct", "configi-27b-direct-visible"],
    workload: ["longcot-smoke", "latency-smoke", "throughput-smoke"],
    backendKnob: ["baseline", "blackwell-informed-candidate"],
  };
}

function countCells(axes: Record<string, string[]>): number {
  return Object.values(axes).reduce((count, values) => count * Math.max(1, values.length), 1);
}

function buildBenchmarkCommand(input: {
  profile: "smoke" | "longcot" | "throughput";
  targets: string[];
}): string {
  const targetArgs = (input.targets.length > 0 ? input.targets : ["configi-27b-direct"]).map(
    (target) => `--target ${shellQuote(target)}`,
  );
  if (input.profile === "longcot") {
    return [
      "uv run scripts/phasee/64-longcot-local-experiment.py matrix",
      ...targetArgs,
      "--max-questions 10",
      "--max-tokens 8192",
      "--rlm-max-iterations 8",
      "--emit-metrics",
    ].join(" ");
  }
  if (input.profile === "throughput") {
    return [
      "uv run scripts/phasee/64-longcot-local-experiment.py matrix",
      ...targetArgs,
      "--max-questions 20",
      "--max-tokens 4096",
      "--rlm-max-iterations 1",
      "--emit-metrics",
    ].join(" ");
  }
  return [
    "uv run scripts/phasee/64-longcot-local-experiment.py matrix",
    ...targetArgs,
    "--max-questions 1",
    "--max-tokens 128",
    "--rlm-max-iterations 1",
    "--emit-metrics",
  ].join(" ");
}

function buildHandoffPrompt(plan: Omit<VllmCampaignPlan, "handoffPrompt">): string {
  return `You are in a fresh, stateless Pi session. Start from zero and run a bounded autonomous autoresearch campaign for local vLLM speed optimization.

Repository / cwd:
- ${plan.cwd}

Goal:
- ${plan.objective}

Hardware/model/context:
- hardware: ${plan.hardware}
- model path: ${plan.modelPath}
- Blackwell knowledge base: ${plan.knowledgeBase}

Non-negotiable boundaries:
${plan.safetyBoundary.map((line) => `- ${line}`).join("\n")}

First reads:
1. ${plan.cwd}/AGENTS.md
2. ${plan.cwd}/runtime/m14-longcot-local-benchmark/README.md
3. ${plan.cwd}/runtime/m14-longcot-local-benchmark/targets.local.json
4. ${plan.knowledgeBase}/README.md
5. ${plan.knowledgeBase}/docs/index.md

Use these Pi tools/surfaces if available:
- autoresearch_vllm_campaign({ action: "status", cwd: ${JSON.stringify(plan.cwd)} })
- autoresearch_vllm_campaign({ action: "plan", cwd: ${JSON.stringify(plan.cwd)}, modelPath: ${JSON.stringify(plan.modelPath)}, knowledgeBase: ${JSON.stringify(plan.knowledgeBase)} })
- autoresearch_campaign_start / autoresearch_runtime_loop only for explicit bounded foreground segments.
- workstation repo-owned scripts for GPU/lane status and benchmarks; do not use raw service mutation as discovery.

Initial benchmark command proposed by the cockpit:
${plan.benchmark.command}

Exact next tool-call plan:
${plan.exactToolCalls.map((call) => `\n${call}`).join("\n")}

Execution strategy:
1. Inspect status first; do not mutate while GPU/service state is unknown.
2. If the requested kasimat 27B model has no target in targets.local.json, create or plan a target/lane candidate through workstation-owned lane/profile seams before benchmarking.
3. Run one bounded segment only (small cell count, wall-clock budget).
4. Export/read autoresearch dashboard and candidate-result packets.
5. Resume with another bounded segment only after the previous segment has receipts and no safety blockers.
6. Stop at promotion, service mutation, AK/KES/evidence, cleanup, or merge gates unless explicitly authorized.
`;
}

export function buildVllmAutoresearchCampaignPlan(
  request: VllmCampaignRequest = {},
): VllmCampaignPlan {
  const action = request.action ?? "status";
  const cwd = path.resolve(request.cwd || DEFAULT_CWD);
  const modelPath = request.modelPath || DEFAULT_MODEL_PATH;
  const hardware = request.hardware || DEFAULT_HARDWARE;
  const knowledgeBase = resolveUnderCwd(cwd, request.knowledgeBase || DEFAULT_KNOWLEDGE_BASE);
  const objective =
    request.objective ||
    `Improve local vLLM serving speed for ${modelPath} on ${hardware} using bounded matrix experiments and Blackwell-specific evidence.`;
  const benchmarkProfile = request.benchmarkProfile || "smoke";
  const requestedTargets = request.targets || [];
  const targetCatalogPath = path.join(
    cwd,
    "runtime/m14-longcot-local-benchmark/targets.local.json",
  );
  const targetIds = loadTargetIds(targetCatalogPath);
  const recommendedTargets = requestedTargets.length
    ? requestedTargets
    : targetIds
        .filter((id) => /27b|configi|qwen36-vllm-main|dflash|kasimat|aeon/i.test(id))
        .sort((a, b) => {
          const score = (id: string) =>
            /kasimat|aeon/i.test(id) ? 0 : /27b|configi/i.test(id) ? 1 : 2;
          return score(a) - score(b) || a.localeCompare(b);
        })
        .slice(0, 6);
  const axes = request.matrixAxes || buildDefaultAxes(recommendedTargets.slice(0, 2));
  const benchmarkCommand = buildBenchmarkCommand({
    profile: benchmarkProfile,
    targets: recommendedTargets.slice(0, 2),
  });
  const recentRunState = findRecentRunState(cwd);
  const statusProbes: VllmCampaignStatusProbe[] = [
    existsSync(path.join(cwd, "scripts/phasee/gpu-budget-warden.sh"))
      ? runProbe(cwd, "gpu_budget", "bash scripts/phasee/gpu-budget-warden.sh --status", 3500)
      : { name: "gpu_budget", ok: false, summary: "missing scripts/phasee/gpu-budget-warden.sh" },
    existsSync(path.join(cwd, "scripts/phasee/gpu-who.py"))
      ? runProbe(cwd, "gpu_who", "python3 scripts/phasee/gpu-who.py", 3500)
      : { name: "gpu_who", ok: false, summary: "missing scripts/phasee/gpu-who.py" },
    recentRunState
      ? {
          name: "latest_run_state",
          ok: true,
          summary: truncate(readFileSync(recentRunState, "utf8")),
        }
      : { name: "latest_run_state", ok: false, summary: "no m14 run.state.json found" },
  ];

  const safetyBoundary = [
    "Use workstation-owned status and lane/profile seams; do not use start/stop/apply commands as discovery.",
    "Long-running means repeated bounded foreground segments with receipts/checkpoints, not a hidden daemon.",
    "No direct AK/KES/Oracle/evidence writes, service promotion, merge, cleanup, or destructive reset from the campaign cockpit.",
    "Any GPU/service mutation must be plan-first and explicitly approved through the workstation owner surface.",
  ];

  const campaignStartCall = `autoresearch_campaign_start(${safeJson({
    cwd,
    objective,
    setupMode: "autoplan",
    runMode: "bounded_loop",
    maxIterations: request.maxIterations ?? 2,
    maxWallClockMinutes: request.maxWallClockMinutes ?? 30,
    benchmarkCommand,
    checksCommand: "python3 scripts/phasee/lane-op.py status --json || true",
    metricName: "output_tokens_per_second",
    metricUnit: "tok/s",
    direction: "higher",
    filesInScope: ["runtime/m14-longcot-local-benchmark/", "scripts/phasee/", "phasee/"],
    constraints: safetyBoundary,
    peerMode: "off",
  })})`;

  const cockpitCall = `autoresearch_vllm_campaign(${safeJson({
    action: "run_segment_plan",
    cwd,
    modelPath,
    hardware,
    knowledgeBase,
    maxWallClockMinutes: request.maxWallClockMinutes ?? 30,
    maxCellsPerSegment: request.maxCellsPerSegment ?? 4,
  })})`;

  const partial: Omit<VllmCampaignPlan, "handoffPrompt"> = {
    action,
    cwd,
    modelPath,
    modelPathExists: existsSync(modelPath),
    hardware,
    knowledgeBase,
    knowledgeBaseExists: existsSync(knowledgeBase),
    objective,
    safetyBoundary,
    statusProbes,
    targetCatalog: {
      path: targetCatalogPath,
      exists: existsSync(targetCatalogPath),
      matchingTargets: targetIds.filter((id) => requestedTargets.includes(id)),
      recommendedTargets,
      targetMissingForModelPath: !targetIds.some((id) => /kasimat|aeon|27b/i.test(id)),
    },
    matrix: {
      maxCellsPerSegment: request.maxCellsPerSegment ?? 4,
      axes,
      plannedCellCount: countCells(axes),
    },
    benchmark: {
      profile: benchmarkProfile,
      command: benchmarkCommand,
      metricName: "output_tokens_per_second",
      direction: "higher",
    },
    exactToolCalls: [cockpitCall, campaignStartCall],
    nextActions: [
      "Read workstation AGENTS.md and m14 benchmark README before applying any service/profile mutation.",
      "If targetMissingForModelPath=true, add/plan a workstation target for the kasimat 27B model before treating benchmark results as model-specific.",
      "Run one bounded autoresearch segment, export the dashboard, then resume only from receipts/checkpoints.",
    ],
  };

  return { ...partial, handoffPrompt: buildHandoffPrompt(partial) };
}

export function formatVllmAutoresearchCampaignPlan(plan: VllmCampaignPlan): string {
  const lines = [
    "# vLLM autoresearch campaign cockpit",
    "",
    `- action: ${plan.action}`,
    `- cwd: ${plan.cwd}`,
    `- model path: ${plan.modelPath}`,
    `- model path exists: ${plan.modelPathExists ? "yes" : "no"}`,
    `- hardware: ${plan.hardware}`,
    `- Blackwell KB: ${plan.knowledgeBase}`,
    `- Blackwell KB exists: ${plan.knowledgeBaseExists ? "yes" : "no"}`,
    "",
    "## Safety boundary",
    ...plan.safetyBoundary.map((entry) => `- ${entry}`),
    "",
    "## Status probes",
    ...plan.statusProbes.map(
      (probe) =>
        `- ${probe.name}: ${probe.ok ? "ok" : "blocked"}${probe.command ? ` (${probe.command})` : ""}\n  ${probe.summary.replace(/\n/g, "\n  ")}`,
    ),
    "",
    "## Target catalog",
    `- path: ${plan.targetCatalog.path}`,
    `- exists: ${plan.targetCatalog.exists ? "yes" : "no"}`,
    `- recommended targets: ${plan.targetCatalog.recommendedTargets.join(", ") || "none"}`,
    `- kasimat/AEON target appears missing: ${plan.targetCatalog.targetMissingForModelPath ? "yes" : "no"}`,
    "",
    "## Matrix",
    `- max cells per segment: ${plan.matrix.maxCellsPerSegment}`,
    `- planned cells from current axes: ${plan.matrix.plannedCellCount}`,
    ...Object.entries(plan.matrix.axes).map(([axis, values]) => `- ${axis}: ${values.join(", ")}`),
    "",
    "## Benchmark seed",
    `- profile: ${plan.benchmark.profile}`,
    `- metric: ${plan.benchmark.metricName} (${plan.benchmark.direction} is better)`,
    "```bash",
    plan.benchmark.command,
    "```",
    "",
    "## Exact next tool calls",
    ...plan.exactToolCalls.flatMap((call) => ["```ts", call, "```"]),
    "",
    "## Next actions",
    ...plan.nextActions.map((entry) => `- ${entry}`),
  ];

  if (plan.action === "handoff_prompt") {
    lines.push("", "## Fresh-session handoff prompt", "```text", plan.handoffPrompt, "```");
  }

  return lines.join("\n");
}
