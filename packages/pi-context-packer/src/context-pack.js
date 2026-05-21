import { execFile } from "node:child_process";
import { open, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { buildContextPlan, CONTEXT_PLAN_PARAMETERS, formatContextPlan } from "./context-plan.js";
import { buildSciSection } from "./sci-provider.js";

const execFileAsync = promisify(execFile);
const ESTIMATED_BYTES_PER_TOKEN = 4;
const MAX_ITEM_BYTES = 48_000;
const GIT_MAX_BUFFER = 32_000;
const TRUSTED_GIT_CANDIDATES = ["/usr/bin/git", "/bin/git", "/usr/local/bin/git"];

const SECTION_AUTHORITY = {
  agents: "Active/relevant AGENTS files are instruction context; this packet only mirrors them.",
  git: "Git status is current workspace posture; read-only metadata only.",
  docs: "Markdown/docs are source-owned data unless active instructions make them authoritative.",
};

const textTokens = (text) => Math.ceil(text.length / ESTIMATED_BYTES_PER_TOKEN);

const textResult = (text, details = {}) => ({ content: [{ type: "text", text }], details });

const selectedProviderIds = (plan) =>
  plan.providerPlans
    .filter((providerPlan) => providerPlan.posture === "selected")
    .map((providerPlan) => providerPlan.provider);

const unique = (values) => Array.from(new Set(values));

const isInside = (root, candidate) => candidate === root || candidate.startsWith(`${root}${sep}`);

const resolveContainedPath = async (root, pathSeed) => {
  if (isAbsolute(pathSeed) || pathSeed.includes("\0")) {
    return { ok: false, reason: "path seed is absolute or contains NUL" };
  }

  const lexical = resolve(root, pathSeed);
  let realRoot;
  try {
    realRoot = await realpath(root);
  } catch {
    return { ok: false, reason: "workspace root does not exist" };
  }
  let realCandidate;
  try {
    realCandidate = await realpath(lexical);
  } catch {
    return { ok: false, reason: "path seed does not exist" };
  }

  if (!isInside(realRoot, realCandidate)) {
    return { ok: false, reason: "path seed escapes workspace" };
  }

  return { ok: true, path: realCandidate, relativePath: pathSeed };
};

const readBoundedFile = async ({ root, pathSeed, provider, rationale, budgetBytes }) => {
  const resolved = await resolveContainedPath(root, pathSeed);
  if (!resolved.ok) {
    return {
      item: undefined,
      omission: { provider, reason: "unsafe_path", detail: `${pathSeed}: ${resolved.reason}` },
    };
  }

  let fileStat;
  try {
    fileStat = await stat(resolved.path);
  } catch {
    return {
      item: undefined,
      omission: { provider, reason: "blocked", detail: `${pathSeed}: not statable` },
    };
  }
  if (!fileStat.isFile()) {
    return {
      item: undefined,
      omission: { provider, reason: "blocked", detail: `${pathSeed}: not a regular file` },
    };
  }

  if (fileStat.size > budgetBytes || fileStat.size > MAX_ITEM_BYTES) {
    return {
      item: undefined,
      omission: {
        provider,
        reason: "budget",
        detail: `${pathSeed}: ${fileStat.size} bytes exceeds item budget`,
      },
    };
  }

  let content;
  let afterReadStat;
  let handle;
  try {
    handle = await open(resolved.path, "r");
    const openedStat = await handle.stat();
    if (
      openedStat.dev !== fileStat.dev ||
      openedStat.ino !== fileStat.ino ||
      openedStat.size !== fileStat.size
    ) {
      return {
        item: undefined,
        omission: { provider, reason: "blocked", detail: `${pathSeed}: changed before read` },
      };
    }
    content = await handle.readFile("utf8");
    afterReadStat = await handle.stat();
  } finally {
    await handle?.close();
  }

  if (
    afterReadStat.dev !== fileStat.dev ||
    afterReadStat.ino !== fileStat.ino ||
    afterReadStat.size !== fileStat.size ||
    Buffer.byteLength(content) !== fileStat.size
  ) {
    return {
      item: undefined,
      omission: { provider, reason: "blocked", detail: `${pathSeed}: changed during read` },
    };
  }
  return {
    item: {
      id: `${provider}:${pathSeed}`,
      kind: pathSeed.endsWith(".md") ? "doc" : "file",
      provenance: { provider, path: pathSeed },
      rationale,
      estimatedTokens: textTokens(content),
      bytes: Buffer.byteLength(content),
      content,
      contentMode: "whole",
      freshness: "live filesystem read",
    },
    omission: undefined,
  };
};

const findAgentFiles = async (cwd, repoRoot) => {
  const candidates = [];
  const root = resolve(repoRoot);
  let current = resolve(cwd);
  while (isInside(root, current)) {
    candidates.push(resolve(current, "AGENTS.md"));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return unique(candidates)
    .map((candidate) => candidate.slice(root.length + 1))
    .filter((candidate) => candidate && !candidate.startsWith(".."));
};

const buildAgentsSection = async ({ cwd, repoRoot, maxBytes }) => {
  const agentFiles = await findAgentFiles(cwd, repoRoot);
  const items = [];
  const omissions = [];

  for (const pathSeed of agentFiles) {
    const { item, omission } = await readBoundedFile({
      root: repoRoot,
      pathSeed,
      provider: "agents",
      rationale: "active or ancestor AGENTS file for package/workspace instruction context",
      budgetBytes: maxBytes,
    });
    if (item) items.push(item);
    if (omission) omissions.push(omission);
  }

  return { section: sectionFromItems("agents", "Instruction context", items), omissions };
};

const buildDocsSection = async ({ repoRoot, seeds, maxBytes }) => {
  const markdownSeeds = seeds.filter((seed) => seed.kind === "path" && seed.value.endsWith(".md"));
  const items = [];
  const omissions = [];

  for (const seed of markdownSeeds) {
    const { item, omission } = await readBoundedFile({
      root: repoRoot,
      pathSeed: seed.value,
      provider: "docs",
      rationale: seed.note ?? "caller-seeded Markdown context",
      budgetBytes: maxBytes,
    });
    if (item) items.push(item);
    if (omission) omissions.push(omission);
  }

  return { section: sectionFromItems("docs", "Seeded Markdown/docs", items), omissions };
};

const trustedGitPath = async () => {
  for (const candidate of TRUSTED_GIT_CANDIDATES) {
    try {
      const candidateStat = await stat(candidate);
      if (candidateStat.isFile()) return candidate;
    } catch {
      // Try the next trusted system location.
    }
  }
  return undefined;
};

const buildGitSection = async ({ cwd }) => {
  const gitPath = await trustedGitPath();
  if (!gitPath) {
    return {
      section: sectionFromItems("git", "Git posture", []),
      omissions: [
        { provider: "git", reason: "unavailable", detail: "trusted git executable unavailable" },
      ],
    };
  }

  try {
    const { stdout } = await execFileAsync(
      gitPath,
      ["status", "--short", "--untracked-files=all"],
      {
        cwd,
        timeout: 5_000,
        maxBuffer: GIT_MAX_BUFFER,
      },
    );
    const content = stdout.trim() || "clean";
    const item = {
      id: "git:status",
      kind: "status",
      provenance: { provider: "git", command: "git status --short --untracked-files=all" },
      rationale: "current workspace dirty-state posture before context-sensitive work",
      estimatedTokens: textTokens(content),
      bytes: Buffer.byteLength(content),
      content,
      contentMode: "metadata",
      freshness: "live git command",
    };
    return { section: sectionFromItems("git", "Git posture", [item]), omissions: [] };
  } catch (error) {
    return {
      section: sectionFromItems("git", "Git posture", []),
      omissions: [
        {
          provider: "git",
          reason: "unavailable",
          detail: `git status unavailable: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
};

const sectionFromItems = (provider, title, items) => ({
  id: provider,
  title,
  provider,
  authority: SECTION_AUTHORITY[provider] ?? "Source-owned provider projection.",
  estimatedTokens: items.reduce((sum, item) => sum + item.estimatedTokens, 0),
  bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  items,
});

const unavailableProviderOmissions = (providerIds) =>
  providerIds
    .filter((provider) => !["agents", "docs", "git", "sci"].includes(provider))
    .map((provider) => ({
      provider,
      reason: "unavailable",
      detail: `${provider} adapter is planned but not wired in the read-only MVP`,
    }));

const providerMaxBytes = (plan, provider) =>
  Math.min(
    plan.budget.maxBytes,
    plan.budget.perProviderMaxTokens[provider] * ESTIMATED_BYTES_PER_TOKEN,
  );

const buildMeasurementReceipt = ({ estimatedTokens, sections, omissions, budget }) => {
  const wiredProviders = sections.map((section) => section.provider);
  const selectedItemCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const estimatedToolCallsAvoided = sections.reduce((sum, section) => {
    if (section.provider === "sci") return sum + section.items.length * 2;
    return sum + section.items.length;
  }, 0);
  const packetFillRatio = budget.maxTokens > 0 ? estimatedTokens / budget.maxTokens : 0;
  return {
    estimatedToolCallsAvoided,
    packetFillRatio,
    wiredProviders,
    selectedItemCount,
    omittedCandidateCount: omissions.length,
    unwiredProviderOmissions: omissions
      .filter((omission) => omission.reason === "unavailable")
      .map((omission) => omission.provider),
  };
};

const buildMeasurementHints = (receipt, budget) => [
  {
    metric: "tool_calls_avoided",
    note: `${receipt.estimatedToolCallsAvoided} estimated low-level read/search/status calls avoided by this packet`,
  },
  {
    metric: "packet_fill",
    note: `${Math.round(receipt.packetFillRatio * 100)}% of ${budget.maxTokens} estimated packet tokens selected`,
  },
  {
    metric: "provider_gap",
    note: `${receipt.omittedCandidateCount} candidate/provider omissions recorded`,
  },
];

export const buildContextPacket = async (input = {}, env = {}) => {
  const plan = buildContextPlan(input, env);
  if (!plan.ok) return { ok: false, errors: plan.errors, plan };

  const cwd = resolve(plan.cwd);
  const repoRoot = resolve(plan.repoRoot ?? plan.cwd);
  const providerIds = selectedProviderIds(plan);
  const sections = [];
  const omissions = (plan.omittedSeeds ?? []).map((seed) => ({
    provider: "docs",
    reason: "unsafe_path",
    detail: `${seed.kind} seed omitted during planning: ${seed.reason}`,
  }));
  const allSeeds = unique(
    plan.providerPlans
      .filter((providerPlan) => providerPlan.posture === "selected")
      .flatMap((providerPlan) => providerPlan.proposedQueries.flatMap((query) => query.seeds ?? []))
      .map((seed) => JSON.stringify(seed)),
  ).map((seed) => JSON.parse(seed));
  const docsSeeds = allSeeds.filter((seed) => seed.kind === "path" && seed.value.endsWith(".md"));

  if (providerIds.includes("agents")) {
    const result = await buildAgentsSection({
      cwd,
      repoRoot,
      maxBytes: providerMaxBytes(plan, "agents"),
    });
    if (result.section.items.length > 0) sections.push(result.section);
    omissions.push(...result.omissions);
  }

  if (providerIds.includes("docs")) {
    const result = await buildDocsSection({
      repoRoot,
      seeds: docsSeeds,
      maxBytes: providerMaxBytes(plan, "docs"),
    });
    if (result.section.items.length > 0) sections.push(result.section);
    omissions.push(...result.omissions);
  }

  if (providerIds.includes("sci")) {
    const result = await buildSciSection({
      cwd,
      seeds: allSeeds,
      maxBytes: providerMaxBytes(plan, "sci"),
      env,
    });
    if (result.section.items.length > 0) sections.push(result.section);
    omissions.push(...result.omissions);
  }

  if (providerIds.includes("git")) {
    const result = await buildGitSection({ cwd });
    if (result.section.items.length > 0) sections.push(result.section);
    omissions.push(...result.omissions);
  }

  omissions.push(...unavailableProviderOmissions(providerIds));

  const estimatedTokens = sections.reduce((sum, section) => sum + section.estimatedTokens, 0);
  const bytes = sections.reduce((sum, section) => sum + section.bytes, 0);
  const measurementReceipt = buildMeasurementReceipt({
    estimatedTokens,
    sections,
    omissions,
    budget: plan.budget,
  });
  const packet = {
    ok: true,
    objective: plan.objective,
    generatedAt: new Date().toISOString(),
    cwd,
    repoRoot,
    budget: plan.budget,
    totals: {
      estimatedTokens,
      bytes,
      candidatesSelected: sections.reduce((sum, section) => sum + section.items.length, 0),
      candidatesOmitted: omissions.length,
    },
    sections,
    omissions,
    nextToolSuggestions: omissions.map((omission) => ({
      tool: omission.provider === "sci" ? "SCI provider" : "provider adapter",
      reason: omission.detail,
    })),
    measurementReceipt,
    measurementHints: buildMeasurementHints(measurementReceipt, plan.budget),
    nonAuthorizations: plan.nonAuthorizations,
  };

  return { packet, plan, ok: true };
};

export const CONTEXT_PACK_PARAMETERS = CONTEXT_PLAN_PARAMETERS;

export const formatContextPacket = (result) => {
  if (!result.ok) return formatContextPlan(result.plan);
  const { packet } = result;
  const sections = packet.sections.map(
    (section) =>
      `- ${section.provider}: ${section.items.length} item(s), ${section.estimatedTokens} tokens`,
  );
  const omissions = packet.omissions.map(
    (omission) => `- ${omission.provider}/${omission.reason}: ${omission.detail}`,
  );
  return [
    `Context packet for: ${packet.objective}`,
    `selected: ${packet.totals.candidatesSelected} item(s), ${packet.totals.estimatedTokens} estimated tokens, ${packet.totals.bytes} bytes`,
    sections.length ? `sections:\n${sections.join("\n")}` : "sections: none",
    omissions.length ? `omissions:\n${omissions.join("\n")}` : "omissions: none",
    "non-authorizations:",
    ...packet.nonAuthorizations.map((item) => `- ${item}`),
  ].join("\n");
};

export const contextPacketToolResult = async (input = {}, env = {}) => {
  const result = await buildContextPacket(input, env);
  return textResult(formatContextPacket(result), { ok: result.ok, ...result });
};
