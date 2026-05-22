import { execFile } from "node:child_process";
import { open, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { publicOmissionDetail, subprocessFailureDetail } from "./context-intake-safety.js";
import { formatContextPacket, toolResultFromContextPacketResult } from "./context-pack-result.js";
import { buildContextPlan, CONTEXT_PLAN_PARAMETERS } from "./context-plan.js";
import { discoverDocsSeeds } from "./docs-provider.js";
import { buildSciSection } from "./sci-provider.js";
import {
  buildDogfoodObservationTemplate,
  buildMeasurementHints,
  buildMeasurementReceipt,
  buildSessionAwareness,
  buildSessionSection,
  shouldShowSessionSection,
} from "./session-measurement.js";

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
const isMarkdownPath = (value) => /\.md$/i.test(value);
const selectedProviderIds = (plan) =>
  plan.providerPlans
    .filter((providerPlan) => providerPlan.posture === "selected")
    .map((providerPlan) => providerPlan.provider);
const unique = (values) => Array.from(new Set(values));
const providerQuerySeeds = (plan, provider) =>
  unique(
    plan.providerPlans
      .filter((providerPlan) => providerPlan.provider === provider)
      .flatMap((providerPlan) => providerPlan.proposedQueries.flatMap((query) => query.seeds ?? []))
      .map((seed) => JSON.stringify(seed)),
  ).map((seed) => JSON.parse(seed));
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

const contentAlreadyLoaded = (loadedText, content) => {
  if (typeof loadedText !== "string" || loadedText.length === 0) return false;
  const trimmed = content.trim();
  return trimmed.length > 0 && loadedText.includes(trimmed);
};

const loadedDuplicateItem = ({ provider, pathSeed, rationale, content, duplicateOf }) => {
  const duplicateNote = [
    `[already loaded in ${duplicateOf}; duplicate whole-file content omitted]`,
    `path: ${pathSeed}`,
    `originalBytes: ${Buffer.byteLength(content)}`,
    `originalEstimatedTokens: ${textTokens(content)}`,
  ].join("\n");
  return {
    id: `${provider}:${pathSeed}`,
    kind: isMarkdownPath(pathSeed) ? "doc" : "file",
    provenance: { provider, path: pathSeed },
    rationale: `${rationale}; duplicate content already present in ${duplicateOf}`,
    estimatedTokens: textTokens(duplicateNote),
    bytes: Buffer.byteLength(duplicateNote),
    content: duplicateNote,
    contentMode: "metadata",
    freshness: "live filesystem read with already-loaded prompt dedupe",
    duplicateOf,
    duplicateBytesAvoided: Buffer.byteLength(content),
    duplicateTokensAvoided: textTokens(content),
  };
};

const readBoundedFile = async ({
  root,
  pathSeed,
  provider,
  rationale,
  budgetBytes,
  loadedSystemPrompt,
}) => {
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
  let blockedDetail;
  try {
    handle = await open(resolved.path, "r");
    const openedStat = await handle.stat();
    if (
      openedStat.dev !== fileStat.dev ||
      openedStat.ino !== fileStat.ino ||
      openedStat.size !== fileStat.size
    ) {
      blockedDetail = `${pathSeed}: changed before read`;
    } else {
      content = await handle.readFile("utf8");
      afterReadStat = await handle.stat();
    }
  } catch {
    blockedDetail = `${pathSeed}: read failed; raw filesystem error output omitted`;
  }

  try {
    await handle?.close();
  } catch {
    blockedDetail = `${pathSeed}: close failed; raw filesystem error output omitted`;
  }

  if (blockedDetail) {
    return {
      item: undefined,
      omission: { provider, reason: "blocked", detail: blockedDetail },
    };
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
  if (contentAlreadyLoaded(loadedSystemPrompt, content)) {
    return {
      item: loadedDuplicateItem({
        provider,
        pathSeed,
        rationale,
        content,
        duplicateOf: "system_prompt",
      }),
      omission: undefined,
    };
  }

  return {
    item: {
      id: `${provider}:${pathSeed}`,
      kind: isMarkdownPath(pathSeed) ? "doc" : "file",
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

  const existing = [];
  const relativeCandidates = unique(candidates)
    .reverse()
    .map((candidate) => candidate.slice(root.length + 1))
    .filter((candidate) => candidate && !candidate.startsWith(".."));

  for (const candidate of relativeCandidates) {
    try {
      const candidateStat = await stat(resolve(root, candidate));
      if (candidateStat.isFile()) existing.push(candidate);
    } catch {
      // Missing ancestor AGENTS files are normal loader behavior, not packet omissions.
    }
  }

  return existing;
};

const buildAgentsSection = async ({ cwd, repoRoot, maxBytes, loadedSystemPrompt }) => {
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
      loadedSystemPrompt,
    });
    if (item) items.push(item);
    if (omission) omissions.push(omission);
  }

  return { section: sectionFromItems("agents", "Instruction context", items), omissions };
};

const buildDocsSection = async ({ repoRoot, seeds, maxBytes, loadedSystemPrompt }) => {
  const markdownSeeds = seeds.filter((seed) => seed.kind === "path" && isMarkdownPath(seed.value));
  const items = [];
  const omissions = [];

  for (const seed of markdownSeeds) {
    const { item, omission } = await readBoundedFile({
      root: repoRoot,
      pathSeed: seed.value,
      provider: "docs",
      rationale: seed.note ?? "caller-seeded Markdown context",
      budgetBytes: maxBytes,
      loadedSystemPrompt,
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

const buildGitSection = async ({ cwd, exec = execFileAsync }) => {
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
    const { stdout } = await exec(gitPath, ["status", "--short", "--untracked-files=all"], {
      cwd,
      timeout: 5_000,
      maxBuffer: GIT_MAX_BUFFER,
    });
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
          detail: subprocessFailureDetail("git status", error, "read"),
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
    .filter((provider) => !["agents", "docs", "git", "sci", "session"].includes(provider))
    .map((provider) => ({
      provider,
      reason: "unavailable",
      detail: `${provider} read-only adapter is planned but not wired; use the owning surface directly if this task needs live authority or governed retrieval`,
    }));

const ownerActionFromRecommendation = (recommendation) => ({
  surface: recommendation.surface,
  reason: recommendation.reason,
  action: recommendation.nextAction,
  nonAuthorization: recommendation.nonAuthorization,
});

const ownerSurfaceForProvider = (provider) => {
  if (provider === "prompt_vault") return "Prompt Vault governed read surfaces";
  if (provider === "ak") return "AK / accepted society authority surfaces";
  if (provider === "fcos") return "FCOS control-board owner surface";
  if (provider === "sci") return "SCI / semantic-code-intelligence";
  return `${provider} owner surface`;
};

const publicOmission = (omission) => ({
  ...omission,
  detail: publicOmissionDetail(
    omission.detail,
    `${omission.provider} ${omission.reason} detail withheld`,
  ),
});

const suggestionFromOmission = (omission) => ({
  tool: ownerSurfaceForProvider(omission.provider),
  reason: omission.detail,
  nonAuthorization:
    "context-packer recorded an omission only; it did not execute the owner surface",
});

const usablePacketTokens = (budget) => Math.max(0, budget.maxTokens - budget.reserveTokens);

const providerMaxBytes = (plan, provider, remainingBudget = {}) =>
  Math.min(
    plan.budget.maxBytes,
    remainingBudget.bytes ?? plan.budget.maxBytes,
    (remainingBudget.tokens ?? usablePacketTokens(plan.budget)) * ESTIMATED_BYTES_PER_TOKEN,
    plan.budget.perProviderMaxTokens[provider] * ESTIMATED_BYTES_PER_TOKEN,
  );

const initialProviderBudget = (plan, provider) => ({
  bytes: Math.min(
    plan.budget.maxBytes,
    plan.budget.perProviderMaxTokens[provider] * ESTIMATED_BYTES_PER_TOKEN,
  ),
  tokens: plan.budget.perProviderMaxTokens[provider],
});

const remainingProviderBudget = (providerBudgets, plan, provider) => {
  if (!providerBudgets.has(provider)) {
    providerBudgets.set(provider, initialProviderBudget(plan, provider));
  }
  return providerBudgets.get(provider);
};

const sectionWithItems = (section, items) => ({
  ...section,
  estimatedTokens: items.reduce((sum, item) => sum + item.estimatedTokens, 0),
  bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  items,
});

const appendSectionWithinBudget = ({
  sections,
  omissions,
  section,
  remainingBudget,
  providerRemainingBudget,
}) => {
  const kept = [];
  for (const item of section.items) {
    const fitsPacket =
      item.bytes <= remainingBudget.bytes && item.estimatedTokens <= remainingBudget.tokens;
    const fitsProvider =
      item.bytes <= providerRemainingBudget.bytes &&
      item.estimatedTokens <= providerRemainingBudget.tokens;
    if (fitsPacket && fitsProvider) {
      kept.push(item);
      remainingBudget.bytes -= item.bytes;
      remainingBudget.tokens -= item.estimatedTokens;
      providerRemainingBudget.bytes -= item.bytes;
      providerRemainingBudget.tokens -= item.estimatedTokens;
    } else {
      omissions.push({
        provider: section.provider,
        reason: "budget",
        detail: fitsPacket
          ? `${item.id}: provider budget exhausted before selection`
          : `${item.id}: packet budget exhausted before selection`,
      });
    }
  }
  if (kept.length > 0) sections.push(sectionWithItems(section, kept));
  return { keptCount: kept.length, omittedCount: section.items.length - kept.length };
};

export const buildContextPacket = async (input = {}, env = {}) => {
  const plan = buildContextPlan(input, env);
  if (!plan.ok) return { ok: false, errors: plan.errors, plan };

  const cwd = resolve(plan.cwd);
  const repoRoot = resolve(plan.repoRoot ?? plan.cwd);
  const providerIds = selectedProviderIds(plan);
  const sections = [];
  const sessionAwareness = buildSessionAwareness({ ...env, cwd });
  const remainingBudget = { bytes: plan.budget.maxBytes, tokens: usablePacketTokens(plan.budget) };
  const providerBudgets = new Map();
  const omissions = (plan.omittedSeeds ?? []).map((seed) => ({
    provider: seed.provider ?? (seed.kind === "symbol" ? "sci" : "docs"),
    reason: seed.kind === "symbol" ? "unsafe_symbol" : "unsafe_path",
    detail: `${seed.kind} seed omitted during planning: ${seed.reason}`,
  }));
  let docsSeeds = providerQuerySeeds(plan, "docs").filter(
    (seed) => seed.kind === "path" && isMarkdownPath(seed.value),
  );
  const sciSeeds = providerQuerySeeds(plan, "sci");

  if (providerIds.includes("agents")) {
    const result = await buildAgentsSection({
      cwd,
      repoRoot,
      maxBytes: providerMaxBytes(plan, "agents", remainingBudget),
      loadedSystemPrompt: env.systemPrompt,
    });
    omissions.push(...result.omissions);
    appendSectionWithinBudget({
      sections,
      omissions,
      section: result.section,
      remainingBudget,
      providerRemainingBudget: remainingProviderBudget(providerBudgets, plan, "agents"),
    });
  }

  if (providerIds.includes("docs")) {
    if (docsSeeds.length === 0) {
      const discovered = await discoverDocsSeeds({ repoRoot, objective: plan.objective, env });
      docsSeeds = unique(
        [...docsSeeds, ...discovered.seeds].map((seed) => JSON.stringify(seed)),
      ).map((seed) => JSON.parse(seed));
      omissions.push(...discovered.omissions);
    }
    const result = await buildDocsSection({
      repoRoot,
      seeds: docsSeeds,
      maxBytes: providerMaxBytes(plan, "docs", remainingBudget),
      loadedSystemPrompt: env.systemPrompt,
    });
    omissions.push(...result.omissions);
    appendSectionWithinBudget({
      sections,
      omissions,
      section: result.section,
      remainingBudget,
      providerRemainingBudget: remainingProviderBudget(providerBudgets, plan, "docs"),
    });
  }

  if (providerIds.includes("sci")) {
    const result = await buildSciSection({
      cwd,
      repoRoot,
      seeds: sciSeeds,
      maxBytes: providerMaxBytes(plan, "sci", remainingBudget),
      env,
    });
    omissions.push(...result.omissions);
    appendSectionWithinBudget({
      sections,
      omissions,
      section: result.section,
      remainingBudget,
      providerRemainingBudget: remainingProviderBudget(providerBudgets, plan, "sci"),
    });
  }

  if (providerIds.includes("session") && shouldShowSessionSection({ plan, sessionAwareness })) {
    const result = buildSessionSection({ sessionAwareness });
    const selection = appendSectionWithinBudget({
      sections,
      omissions,
      section: result.section,
      remainingBudget,
      providerRemainingBudget: remainingProviderBudget(providerBudgets, plan, "session"),
    });
    sessionAwareness.visibleSessionSection = selection.keptCount > 0;
  }

  if (providerIds.includes("git")) {
    const result = await buildGitSection({ cwd: repoRoot, exec: env.execFileAsync });
    omissions.push(...result.omissions);
    appendSectionWithinBudget({
      sections,
      omissions,
      section: result.section,
      remainingBudget,
      providerRemainingBudget: remainingProviderBudget(providerBudgets, plan, "git"),
    });
  }

  omissions.push(...unavailableProviderOmissions(providerIds));
  const publicOmissions = omissions.map(publicOmission);

  const estimatedTokens = sections.reduce((sum, section) => sum + section.estimatedTokens, 0);
  const bytes = sections.reduce((sum, section) => sum + section.bytes, 0);
  const measurementReceipt = buildMeasurementReceipt({
    estimatedTokens,
    sections,
    omissions: publicOmissions,
    budget: plan.budget,
    sessionAwareness,
  });
  const dogfoodObservationTemplate = buildDogfoodObservationTemplate({
    objective: plan.objective,
    generatedAt: new Date().toISOString(),
    totals: {
      candidatesSelected: sections.reduce((sum, section) => sum + section.items.length, 0),
      candidatesOmitted: publicOmissions.length,
    },
    sections,
    omissions: publicOmissions,
    measurementReceipt,
    providerPlans: plan.providerPlans,
  });
  const ownerSurfaceRecommendations = plan.ownerSurfaceRecommendations ?? [];
  const nextOwnerActions = ownerSurfaceRecommendations.map(ownerActionFromRecommendation);
  const packet = {
    ok: true,
    objective: plan.objective,
    generatedAt: dogfoodObservationTemplate.packet.generatedAt,
    cwd,
    repoRoot,
    budget: plan.budget,
    totals: {
      estimatedTokens,
      bytes,
      candidatesSelected: sections.reduce((sum, section) => sum + section.items.length, 0),
      candidatesOmitted: publicOmissions.length,
    },
    sections,
    omissions: publicOmissions,
    ownerSurfaceRecommendations,
    nextOwnerActions,
    nextToolSuggestions: [
      ...nextOwnerActions.map((action) => ({
        tool: action.surface,
        reason: action.action,
        nonAuthorization: action.nonAuthorization,
      })),
      ...publicOmissions.map(suggestionFromOmission),
    ],
    measurementReceipt,
    dogfoodObservationTemplate,
    measurementHints: buildMeasurementHints(measurementReceipt, plan.budget),
    nonAuthorizations: plan.nonAuthorizations,
  };

  return { packet, plan, ok: true };
};

export const CONTEXT_PACK_PARAMETERS = CONTEXT_PLAN_PARAMETERS;

export { formatContextPacket };

export const contextPacketToolResult = async (input = {}, env = {}) => {
  const result = await buildContextPacket(input, env);
  return toolResultFromContextPacketResult(result);
};
