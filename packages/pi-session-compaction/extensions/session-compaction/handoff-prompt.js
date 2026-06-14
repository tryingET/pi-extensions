const DEFAULT_AUTHORITY_BOUNDARIES = [
  "AK + society DB remain canonical for tasks, evidence, decisions, and lineage.",
  "Git status/diff/log are code-state truth; verify before committing or closing work.",
  "pi-session-compaction owns custom compaction summaries and fresh-session handoff prompt shape.",
  "ASC/self may provide mirror-only cues, but it is not the canonical compaction engine.",
  "Prompt Vault, ROCS/ontology, agent_vent, pi-autoresearch, and FCOS/control-board state stay on their owning surfaces.",
];

export function buildSessionCompactionHandoffPrompt(input = {}) {
  const cwd = normalizeString(input.cwd) ?? process.cwd();
  const note = normalizeString(input.note);
  const gitStatusSummary = normalizeString(input.gitStatusSummary);
  const evidencePosture = normalizeString(input.evidencePosture);
  const nextSuggestedSlice = normalizeString(input.nextSuggestedSlice);
  const validationReminder = normalizeString(input.validationReminder);
  const discoveryStatus = normalizeDiscoveryStatus(input);
  const akTaskIds = normalizeStringArray(input.akTaskIds);
  const touchedFiles = normalizeStringArray(input.touchedFiles);
  const recentCommands = normalizeStringArray(input.recentCommands);
  const openQuestions = normalizeStringArray(input.openQuestions);

  return [
    "You are a fresh, stateless Pi coding session.",
    "",
    "Work in:",
    `\`${cwd}\``,
    "",
    "Follow all AGENTS.md instructions. Start by reading repo/package AGENTS.md and README files before editing.",
    "",
    "Current handoff (pi-session-compaction owned; operator-pasteable prompt)",
    `- Evidence posture: ${
      evidencePosture ??
      "Session evidence in this prompt is handoff text, not canonical authority. Verify with git, AK, and source-owned runtime surfaces before acting."
    }`,
    "- Exact token/context-window telemetry: unavailable; do not invent remaining context budget.",
    `- Git status: ${gitStatusSummary ?? "unknown from this prompt; run git status --short."}`,
    `- Known AK task ids: ${
      akTaskIds.length > 0
        ? akTaskIds.join(", ")
        : "none supplied; run ak task ready/list/show as needed."
    }`,
    `- Recent touched files: ${formatList(touchedFiles, "none supplied")}`,
    `- Recent commands: ${formatList(recentCommands, "none supplied")}`,
    `- Validation/install/reload reminders: ${
      validationReminder ??
      "run the package/repo validation named by AGENTS/README; if live Pi behavior changed, pi install the package and ask operator to /reload; run git diff --check before commit."
    }`,
    `- Next suggested slice: ${
      nextSuggestedSlice ??
      "inspect git/AK/runtime state and choose the smallest truthful owner-scoped next step."
    }`,
    "",
    "Valuable discoveries / promotion status",
    ...renderDiscoveryStatus(discoveryStatus),
    ...(note ? ["", "Operator note", `- ${note}`] : []),
    ...(openQuestions.length > 0
      ? ["", "Open questions", ...openQuestions.map((item) => `- ${item}`)]
      : []),
    "",
    "Authority boundaries",
    ...DEFAULT_AUTHORITY_BOUNDARIES.map((boundary) => `- ${boundary}`),
    "- Do not treat stale candidate packets, autoresearch artifacts, or session mirror data as live worktrees/branches without owner-surface verification.",
    "",
    "Suggested startup commands",
    "```bash",
    "git status --short",
    akTaskIds.length > 0 ? `ak task show ${akTaskIds[0]}` : "ak task ready",
    "ak task list --status pending",
    "```",
  ].join("\n");
}

export function buildSessionCompactionHandoffToolResult(params = {}, ctx = {}) {
  const prompt = buildSessionCompactionHandoffPrompt({
    ...params,
    cwd: normalizeString(params.cwd) ?? normalizeString(ctx.cwd),
  });
  const mode = normalizeString(params.mode)?.toLowerCase() === "show" ? "show" : "prefill";
  return {
    prompt,
    mode,
    shouldPrefill: mode === "prefill",
    authority: "pi_session_compaction_owned",
    boundary:
      "This tool prepares an operator-pasteable fresh-session handoff prompt; it does not compact automatically, mutate AK/KES/evidence, promote candidates, or replace owner-surface verification.",
  };
}

export function parseCompactHandoffArgs(args) {
  const raw = normalizeString(args, { allowEmpty: true }) ?? "";
  const lower = raw.toLowerCase();
  return {
    mode: lower.includes("show") || lower.includes("no prefill") ? "show" : "prefill",
    note: raw.replace(/\b(show|prefill|no prefill)\b/giu, "").trim() || undefined,
  };
}

function normalizeString(value, options = {}) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!options.allowEmpty && normalized.length === 0) return undefined;
  return normalized;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter((item) => typeof item === "string");
}

function normalizeDiscoveryStatus(input) {
  return {
    discoveryRecords: normalizeDiscoveryRecords(input.discoveryRecords),
    valuableDiscoveries: normalizeStringArray(input.valuableDiscoveries),
    promotionStatus: normalizeStringArray(input.promotionStatus),
    ownerSurfaces: normalizeStringArray(input.ownerSurfaces),
    nonAuthorizations: normalizeStringArray(input.nonAuthorizations),
    falsifiers: normalizeStringArray(input.falsifiers),
    metrics: normalizeStringArray(input.metrics),
  };
}

function normalizeDiscoveryRecords(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
      const record = {
        discovery: normalizeString(item.discovery),
        source: normalizeString(item.source),
        ownerSurface: normalizeString(item.ownerSurface),
        promotionStatus: normalizeString(item.promotionStatus),
        nextPromotionAction: normalizeString(item.nextPromotionAction),
        metric: normalizeString(item.metric),
        falsifier: normalizeString(item.falsifier),
        nonAuthorization: normalizeString(item.nonAuthorization),
      };
      return Object.values(record).some(Boolean) ? record : undefined;
    })
    .filter(Boolean);
}

function renderDiscoveryStatus(status) {
  const lines = [
    ...renderDiscoveryRecords(status.discoveryRecords),
    ...renderNamedList("Discoveries", status.valuableDiscoveries),
    ...renderNamedList("Promotion status", status.promotionStatus),
    ...renderNamedList("Owner surfaces", status.ownerSurfaces),
    ...renderNamedList("Metrics", status.metrics),
    ...renderNamedList("Falsifiers", status.falsifiers),
    ...renderNamedList("Non-authorizations", status.nonAuthorizations),
  ];

  if (lines.length > 0) return lines;
  return [
    "- No typed discoveries supplied. If this session found strategic insights, operator corrections, owner routes, metrics, falsifiers, or non-authorizations, add them here before relying on the handoff.",
  ];
}

function renderDiscoveryRecords(records) {
  return records
    .slice(0, 8)
    .flatMap((record) => [
      `- Discovery: ${record.discovery ?? "not supplied"}`,
      ...(record.source ? [`  - Source: ${record.source}`] : []),
      ...(record.ownerSurface ? [`  - Owner surface: ${record.ownerSurface}`] : []),
      ...(record.promotionStatus ? [`  - Promotion status: ${record.promotionStatus}`] : []),
      ...(record.nextPromotionAction
        ? [`  - Next promotion action: ${record.nextPromotionAction}`]
        : []),
      ...(record.metric ? [`  - Metric: ${record.metric}`] : []),
      ...(record.falsifier ? [`  - Falsifier: ${record.falsifier}`] : []),
      ...(record.nonAuthorization ? [`  - Non-authorization: ${record.nonAuthorization}`] : []),
    ]);
}

function renderNamedList(label, items) {
  if (items.length === 0) return [];
  return [`- ${label}:`, ...items.slice(0, 12).map((item) => `  - ${item}`)];
}

function formatList(items, emptyText) {
  return items.length > 0 ? items.slice(0, 12).join("; ") : emptyText;
}
