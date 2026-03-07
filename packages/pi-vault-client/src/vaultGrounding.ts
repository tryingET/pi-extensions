import type {
  FrameworkResolution,
  GroundingRuntime,
  ParsedDsl,
  Template,
  VaultRuntime,
} from "./vaultTypes.js";

function parseCommandArgs(argsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];
    if (inQuote) {
      if (char === inQuote) inQuote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === " " || char === "\t") {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) args.push(current);
  return args;
}

function substituteArgs(content: string, args: string[]): string {
  let result = content;
  result = result.replace(/\$(\d+)/g, (_, num) => args[parseInt(num, 10) - 1] ?? "");
  result = result.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_, startStr, lengthStr) => {
    let start = parseInt(startStr, 10) - 1;
    if (start < 0) start = 0;
    if (lengthStr) return args.slice(start, start + parseInt(lengthStr, 10)).join(" ");
    return args.slice(start).join(" ");
  });

  const allArgs = args.join(" ");
  return result.replace(/\$ARGUMENTS/g, allArgs).replace(/\$@/g, allArgs);
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---\n")) return raw;
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return raw;
  return raw.slice(end + 5);
}

function parseExtrasDsl(raw: string): ParsedDsl {
  const map: Record<string, string> = {};
  const freeform: string[] = [];
  const warnings: string[] = [];
  const normalized = raw.trim();
  if (!normalized || /^(none|n\/a)$/i.test(normalized)) return { map, freeform, warnings };

  const parts = normalized
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const known = new Set([
    "experts",
    "frameworks",
    "triggers",
    "docs",
    "constraints",
    "audience",
    "style",
    "notes",
  ]);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) {
      freeform.push(part);
      continue;
    }
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (!known.has(key)) warnings.push(`Unknown DSL key ignored: ${key}`);
    else if (!value) warnings.push(`Empty DSL value for key: ${key}`);
    else map[key] = value;
  }

  if (freeform.length > 0 && !map.notes) map.notes = freeform.join(" | ");
  if (map.triggers && !map.frameworks) map.frameworks = map.triggers;
  return { map, freeform, warnings };
}

function splitPipeValues(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

function shortlistFrameworks(objective: string, workflow: string): string[] {
  const text = `${objective} ${workflow}`.toLowerCase();
  if (/(risk|rollback|migration|deploy|release|blast)/.test(text))
    return ["blast-radius", "escape-hatch", "nexus"];
  if (/(test|verify|regression|coverage|qa|spec)/.test(text))
    return ["mirror", "adversary", "inquisition"];
  if (/(assumption|constraint|stuck|unclear|confused|unknown)/.test(text))
    return ["first-principles", "constraint-inventory", "inversion"];
  if (/(complex|bloat|simplif|refactor|cleanup)/.test(text))
    return ["simplification", "nexus", "telescopic"];
  return ["inversion", "nexus", "telescopic"];
}

function discoverFrameworks(
  runtime: VaultRuntime,
  objective: string,
  workflow: string,
  limit = 5,
): Template[] {
  const text = `${objective} ${workflow}`.toLowerCase();
  const tokens = text
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 4)
    .slice(0, 6);
  if (tokens.length === 0) return [];

  const like = tokens
    .map(
      (t) =>
        `(name LIKE '%${runtime.escapeSql(t)}%' OR description LIKE '%${runtime.escapeSql(t)}%')`,
    )
    .join(" OR ");

  return runtime.parseTemplateRows(
    runtime.queryVaultJson(
      `SELECT id, name, description, content, artifact_kind, control_mode, formalization_level, tags
       FROM prompt_templates
       WHERE status = 'active' AND artifact_kind = 'cognitive' AND (${like})
       ORDER BY name
       LIMIT ${limit}`,
    ),
  );
}

function resolveFrameworks(
  runtime: VaultRuntime,
  objective: string,
  workflow: string,
  dsl: ParsedDsl,
): FrameworkResolution {
  const overrideNames = splitPipeValues(dsl.map.frameworks);
  const invalidOverrides: string[] = [];
  const exactCandidates = (
    overrideNames.length > 0 ? overrideNames : shortlistFrameworks(objective, workflow)
  ).slice(0, 3);
  const exactRetrieved = runtime
    .retrieveByNames(exactCandidates, true)
    .filter((t) => t.artifact_kind === "cognitive");

  if (overrideNames.length > 0) {
    const found = new Set(exactRetrieved.map((t) => t.name.toLowerCase()));
    for (const name of overrideNames) if (!found.has(name)) invalidOverrides.push(name);
  }

  if (exactRetrieved.length >= 1) {
    return {
      selected: exactRetrieved.slice(0, 3),
      retrievalMethod:
        overrideNames.length > 0 && exactRetrieved.length < exactCandidates.length
          ? "mixed"
          : "exact",
      discoveryUsed: 0,
      invalidOverrides,
    };
  }

  const discovered = discoverFrameworks(runtime, objective, workflow, 5).slice(0, 3);
  if (discovered.length > 0) {
    return {
      selected: discovered,
      retrievalMethod: "discovery",
      discoveryUsed: 1,
      invalidOverrides,
    };
  }
  return { selected: [], retrievalMethod: "none", discoveryUsed: 1, invalidOverrides };
}

function buildNormalizedExtras(
  dsl: ParsedDsl,
  selectedFrameworkNames: string[],
  retrieval: FrameworkResolution,
): string {
  const map = { ...dsl.map, frameworks: selectedFrameworkNames.join("|") };
  delete map.triggers;

  if (retrieval.invalidOverrides.length > 0) {
    const note = `invalid_framework_overrides_dropped=${retrieval.invalidOverrides.join("|")}`;
    map.notes = map.notes ? `${map.notes} | ${note}` : note;
  }

  const orderedKeys = [
    "experts",
    "frameworks",
    "docs",
    "constraints",
    "audience",
    "style",
    "notes",
  ];
  return orderedKeys
    .map((key) => (map[key]?.trim() ? `${key}=${map[key].trim()}` : ""))
    .filter(Boolean)
    .join("; ");
}

function buildFrameworkGroundingAppendix(
  selected: Template[],
  retrieval: FrameworkResolution,
  dslWarnings: string[],
): string {
  let appendix = `\n\n## PRE-RESOLVED FRAMEWORK GROUNDING (authoritative: Prompt Vault)\n`;
  appendix += `- retrieval_method: ${retrieval.retrievalMethod}\n`;
  appendix += `- discovery_queries_used: ${retrieval.discoveryUsed}\n`;
  appendix += `- framework_retrieval_count: ${selected.length}\n`;
  if (retrieval.invalidOverrides.length > 0)
    appendix += `- invalid_overrides_dropped: ${retrieval.invalidOverrides.join(", ")}\n`;
  if (dslWarnings.length > 0) appendix += `- dsl_warnings: ${dslWarnings.join(" | ")}\n`;
  appendix += `\nUse ONLY the frameworks listed below as grounding evidence.\n`;

  for (let i = 0; i < selected.length; i++) {
    const f = selected[i];
    appendix += `\n### F${i + 1}: ${f.name}\n`;
    appendix += `Description: ${f.description || "(no description)"}\n`;
    appendix += `\n${stripFrontmatter(f.content).trim()}\n`;
  }
  return appendix;
}

function buildGroundedNext10Prompt(
  runtime: VaultRuntime,
  commandText: string,
): { ok: true; prompt: string } | { ok: false; reason: string } {
  const spaceIndex = commandText.indexOf(" ");
  const argsString = spaceIndex === -1 ? "" : commandText.slice(spaceIndex + 1);
  const args = parseCommandArgs(argsString);
  const objective = args[0] ?? "";
  const workflow = args[1] ?? "";
  const modeRaw = (args[2] ?? "").trim().toLowerCase();
  const mode = modeRaw === "off" || modeRaw === "lite" || modeRaw === "full" ? modeRaw : "lite";
  const extrasRaw = args.slice(3).join(" ");

  const dsl = parseExtrasDsl(extrasRaw);
  const resolved = resolveFrameworks(runtime, objective, workflow, dsl);
  if (resolved.selected.length === 0) {
    return { ok: false, reason: "BLOCKED: framework grounding unavailable from Prompt Vault" };
  }

  const template = runtime.getTemplate("next-10-expert-suggestions");
  if (!template?.content) {
    return {
      ok: false,
      reason: "BLOCKED: next-10-expert-suggestions template unavailable in Prompt Vault",
    };
  }

  const selectedNames = resolved.selected.map((f) => f.name);
  const normalizedExtras = buildNormalizedExtras(dsl, selectedNames, resolved);
  const substituted = substituteArgs(stripFrontmatter(template.content), [
    objective,
    workflow,
    mode,
    normalizedExtras,
  ]);
  const appendix = buildFrameworkGroundingAppendix(resolved.selected, resolved, dsl.warnings);
  return { ok: true, prompt: `${substituted}${appendix}` };
}

export function createGroundingRuntime(runtime: VaultRuntime): GroundingRuntime {
  return {
    buildGroundedNext10Prompt: (commandText: string) =>
      buildGroundedNext10Prompt(runtime, commandText),
  };
}
