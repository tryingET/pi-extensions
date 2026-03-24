import { prepareTemplateForExecutionCompat } from "./templatePreparationCompat.js";
import type {
  FrameworkResolution,
  GroundedNext10PromptResult,
  GroundingRuntime,
  ParsedDsl,
  Template,
  VaultGroundingReplaySafeInputs,
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
    .map((s) => s.trim())
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
  currentCompany: string,
  limit = 5,
): { ok: true; value: Template[] } | { ok: false; error: string } {
  const text = `${objective} ${workflow}`.toLowerCase();
  const tokens = text
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 4)
    .slice(0, 6);
  if (tokens.length === 0) return { ok: true, value: [] };

  const like = tokens
    .map(
      (t) =>
        `(name LIKE '%${runtime.escapeSql(t)}%' OR description LIKE '%${runtime.escapeSql(t)}%')`,
    )
    .join(" OR ");

  const result = runtime.queryVaultJsonDetailed(
    `SELECT id, name, description, content, artifact_kind, control_mode, formalization_level, owner_company, visibility_companies, controlled_vocabulary
     FROM prompt_templates
     WHERE ${runtime.buildActiveVisibleTemplatePredicate(currentCompany)} AND artifact_kind = 'cognitive' AND (${like})
     ORDER BY name
     LIMIT ${limit}`,
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, value: runtime.parseTemplateRows(result.value) };
}

function resolveFrameworks(
  runtime: VaultRuntime,
  objective: string,
  workflow: string,
  dsl: ParsedDsl,
  currentCompany: string,
): { ok: true; value: FrameworkResolution } | { ok: false; error: string } {
  const overrideNames = [...new Set(splitPipeValues(dsl.map.frameworks))];

  if (overrideNames.length > 0) {
    if (overrideNames.length > 3) {
      return {
        ok: false,
        error: `Explicit framework override limit is 3; received ${overrideNames.length}: ${overrideNames.join(", ")}`,
      };
    }
    const exactRetrievedResult = runtime.retrieveByNamesDetailed(overrideNames, true, {
      currentCompany,
    });
    if (!exactRetrievedResult.ok) return { ok: false, error: exactRetrievedResult.error };
    const exactRetrieved = exactRetrievedResult.value.filter(
      (t) => t.artifact_kind === "cognitive",
    );
    const exactRetrievedByName = new Map(
      exactRetrieved.map((template) => [template.name, template]),
    );
    const invalidOverrides = overrideNames.filter((name) => !exactRetrievedByName.has(name));
    if (invalidOverrides.length > 0) {
      return {
        ok: false,
        error: `Explicit framework override(s) not found or not visible: ${invalidOverrides.join(", ")}`,
      };
    }
    return {
      ok: true,
      value: {
        selected: overrideNames
          .map((name) => exactRetrievedByName.get(name))
          .filter((template): template is Template => Boolean(template)),
        retrievalMethod: "exact",
        discoveryUsed: 0,
        invalidOverrides: [],
      },
    };
  }

  const exactCandidates = shortlistFrameworks(objective, workflow).slice(0, 3);
  const exactRetrievedResult = runtime.retrieveByNamesDetailed(exactCandidates, true, {
    currentCompany,
  });
  if (!exactRetrievedResult.ok) return { ok: false, error: exactRetrievedResult.error };
  const exactRetrieved = exactRetrievedResult.value.filter((t) => t.artifact_kind === "cognitive");

  if (exactRetrieved.length >= 1) {
    return {
      ok: true,
      value: {
        selected: exactRetrieved.slice(0, 3),
        retrievalMethod: "exact",
        discoveryUsed: 0,
        invalidOverrides: [],
      },
    };
  }

  const discoveredResult = discoverFrameworks(runtime, objective, workflow, currentCompany, 5);
  if (!discoveredResult.ok) return discoveredResult;
  const discovered = discoveredResult.value.slice(0, 3);
  if (discovered.length > 0) {
    return {
      ok: true,
      value: {
        selected: discovered,
        retrievalMethod: "discovery",
        discoveryUsed: 1,
        invalidOverrides: [],
      },
    };
  }
  return {
    ok: true,
    value: { selected: [], retrievalMethod: "none", discoveryUsed: 1, invalidOverrides: [] },
  };
}

function buildNormalizedExtras(
  dsl: ParsedDsl,
  selectedFrameworkNames: string[],
  retrieval: FrameworkResolution,
): string {
  const map: Record<string, string> = {
    ...dsl.map,
    frameworks: selectedFrameworkNames.join("|"),
  };
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
  renderOptions: {
    currentCompany: string;
    context: string;
    args: string[];
    data: Record<string, unknown>;
  },
): { ok: true; appendix: string } | { ok: false; reason: string } {
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
    const prepared = prepareTemplateForExecutionCompat(f.content, {
      currentCompany: renderOptions.currentCompany,
      context: renderOptions.context,
      args: renderOptions.args,
      templateName: f.name,
      data: renderOptions.data,
      appendContextSection: false,
      allowLegacyPiVarsAutoDetect: false,
    });
    if (!prepared.ok) {
      return {
        ok: false,
        reason: `framework grounding render failed for ${f.name}: ${prepared.error}`,
      };
    }

    appendix += `\n### F${i + 1}: ${f.name}\n`;
    appendix += `Description: ${f.description || "(no description)"}\n`;
    appendix += `Governance: owner=${f.owner_company}; visible_to=${f.visibility_companies.join(", ")}\n`;
    appendix += `\n${prepared.prepared.trim()}\n`;
  }
  return { ok: true, appendix };
}

function buildGroundedNext10Prompt(
  runtime: VaultRuntime,
  commandText: string,
  options: { cwd?: string; currentCompany?: string } = {},
): GroundedNext10PromptResult {
  const spaceIndex = commandText.indexOf(" ");
  const argsString = spaceIndex === -1 ? "" : commandText.slice(spaceIndex + 1);
  const args = parseCommandArgs(argsString);
  const objective = args[0] ?? "";
  const workflow = args[1] ?? "";
  const modeRaw = (args[2] ?? "").trim().toLowerCase();
  const mode = modeRaw === "off" || modeRaw === "lite" || modeRaw === "full" ? modeRaw : "lite";
  const extrasRaw = args.slice(3).join(" ");

  const companyResolution = options.currentCompany?.trim()
    ? { company: options.currentCompany.trim(), source: "explicit:currentCompany" }
    : runtime.resolveCurrentCompanyContext(options.cwd);
  if (companyResolution.source === "contract-default") {
    return {
      ok: false,
      reason:
        "BLOCKED: explicit company context is required for visibility-sensitive vault reads. Set PI_COMPANY or run from a company-scoped cwd.",
    };
  }
  const currentCompany = companyResolution.company;
  const dsl = parseExtrasDsl(extrasRaw);
  const resolved = resolveFrameworks(runtime, objective, workflow, dsl, currentCompany);
  if (!resolved.ok) {
    return {
      ok: false,
      reason: `BLOCKED: framework grounding lookup failed: ${resolved.error}`,
    };
  }
  if (resolved.value.selected.length === 0) {
    return { ok: false, reason: "BLOCKED: framework grounding unavailable from Prompt Vault" };
  }

  const templateResult = runtime.getTemplateDetailed("next-10-expert-suggestions", {
    currentCompany,
  });
  if (!templateResult.ok) {
    return {
      ok: false,
      reason: `BLOCKED: next-10-expert-suggestions lookup failed: ${templateResult.error}`,
    };
  }
  const template = templateResult.value;
  if (!template?.content) {
    return {
      ok: false,
      reason: "BLOCKED: next-10-expert-suggestions template unavailable in Prompt Vault",
    };
  }

  const resolution = resolved.value;
  const selectedNames = resolution.selected.map((f) => f.name);
  const normalizedExtras = buildNormalizedExtras(dsl, selectedNames, resolution);
  const frameworkArgs = [objective, workflow, mode, normalizedExtras];
  const frameworkContext = [
    `Objective: ${objective}`,
    `Workflow: ${workflow}`,
    `Mode: ${mode}`,
    normalizedExtras ? `Extras: ${normalizedExtras}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const frameworkData = {
    objective,
    workflow,
    mode,
    extras: normalizedExtras,
  };
  const prepared = prepareTemplateForExecutionCompat(template.content, {
    args: frameworkArgs,
    currentCompany,
    templateName: template.name,
    context: frameworkContext,
    data: frameworkData,
    appendContextSection: false,
    allowLegacyPiVarsAutoDetect: true,
  });
  if (!prepared.ok) {
    return {
      ok: false,
      reason: `BLOCKED: next-10-expert-suggestions render failed: ${prepared.error}`,
    };
  }

  const appendix = buildFrameworkGroundingAppendix(resolution.selected, resolution, dsl.warnings, {
    currentCompany,
    context: frameworkContext,
    args: frameworkArgs,
    data: frameworkData,
  });
  if (!appendix.ok) {
    return {
      ok: false,
      reason: `BLOCKED: ${appendix.reason}`,
    };
  }

  return {
    ok: true,
    prompt: `${prepared.prepared}${appendix.appendix}`,
    template,
    prepared,
    currentCompany,
    companySource: companyResolution.source,
    inputContext: frameworkContext,
    replaySafeInputs: {
      kind: "grounding-request",
      command_text: commandText,
      objective,
      workflow,
      mode,
      extras: normalizedExtras,
      framework_resolution: {
        selected_names: selectedNames,
        retrieval_method: resolution.retrievalMethod,
        discovery_used: resolution.discoveryUsed,
        invalid_overrides: [...resolution.invalidOverrides],
        warnings: [...dsl.warnings],
      },
    },
  };
}

export function rebuildGroundedNext10PromptFromReplayInputs(
  runtime: VaultRuntime,
  replaySafeInputs: VaultGroundingReplaySafeInputs,
  options: { currentCompany: string; companySource?: string },
): GroundedNext10PromptResult {
  const currentCompany = String(options.currentCompany || "").trim();
  if (!currentCompany) {
    return {
      ok: false,
      reason: "BLOCKED: explicit company context is required for grounding replay",
    };
  }

  const selectedNames = replaySafeInputs.framework_resolution.selected_names || [];
  if (selectedNames.length === 0) {
    return {
      ok: false,
      reason: "BLOCKED: grounding replay is missing stored framework_resolution.selected_names",
    };
  }

  const frameworksResult = runtime.retrieveByNamesDetailed(selectedNames, true, {
    currentCompany,
    requireExplicitCompany: true,
  });
  if (!frameworksResult.ok) {
    return {
      ok: false,
      reason: `BLOCKED: framework grounding lookup failed: ${frameworksResult.error}`,
    };
  }
  const retrievedByName = new Map(
    frameworksResult.value
      .filter((template) => template.artifact_kind === "cognitive")
      .map((template) => [template.name, template] as const),
  );
  const selected = selectedNames
    .map((name) => retrievedByName.get(name))
    .filter((template): template is Template => Boolean(template));
  const missingFrameworks = selectedNames.filter((name) => !retrievedByName.has(name));
  if (missingFrameworks.length > 0) {
    return {
      ok: false,
      reason: `BLOCKED: framework grounding unavailable from Prompt Vault: ${missingFrameworks.join(", ")}`,
    };
  }

  const templateResult = runtime.getTemplateDetailed("next-10-expert-suggestions", {
    currentCompany,
    requireExplicitCompany: true,
  });
  if (!templateResult.ok) {
    return {
      ok: false,
      reason: `BLOCKED: next-10-expert-suggestions lookup failed: ${templateResult.error}`,
    };
  }
  const template = templateResult.value;
  if (!template?.content) {
    return {
      ok: false,
      reason: "BLOCKED: next-10-expert-suggestions template unavailable in Prompt Vault",
    };
  }

  const normalizedExtras = replaySafeInputs.extras || "";
  const frameworkArgs = [
    replaySafeInputs.objective,
    replaySafeInputs.workflow,
    replaySafeInputs.mode,
    normalizedExtras,
  ];
  const frameworkContext = [
    `Objective: ${replaySafeInputs.objective}`,
    `Workflow: ${replaySafeInputs.workflow}`,
    `Mode: ${replaySafeInputs.mode}`,
    normalizedExtras ? `Extras: ${normalizedExtras}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const frameworkData = {
    objective: replaySafeInputs.objective,
    workflow: replaySafeInputs.workflow,
    mode: replaySafeInputs.mode,
    extras: normalizedExtras,
  };
  const prepared = prepareTemplateForExecutionCompat(template.content, {
    args: frameworkArgs,
    currentCompany,
    templateName: template.name,
    context: frameworkContext,
    data: frameworkData,
    appendContextSection: false,
    allowLegacyPiVarsAutoDetect: true,
  });
  if (!prepared.ok) {
    return {
      ok: false,
      reason: `BLOCKED: next-10-expert-suggestions render failed: ${prepared.error}`,
    };
  }

  const appendix = buildFrameworkGroundingAppendix(
    selected,
    {
      selected,
      retrievalMethod: replaySafeInputs.framework_resolution.retrieval_method,
      discoveryUsed: replaySafeInputs.framework_resolution.discovery_used,
      invalidOverrides: [...replaySafeInputs.framework_resolution.invalid_overrides],
    },
    [...replaySafeInputs.framework_resolution.warnings],
    {
      currentCompany,
      context: frameworkContext,
      args: frameworkArgs,
      data: frameworkData,
    },
  );
  if (!appendix.ok) {
    return {
      ok: false,
      reason: `BLOCKED: ${appendix.reason}`,
    };
  }

  return {
    ok: true,
    prompt: `${prepared.prepared}${appendix.appendix}`,
    template,
    prepared,
    currentCompany,
    companySource: options.companySource || "explicit:currentCompany",
    inputContext: frameworkContext,
    replaySafeInputs: {
      ...replaySafeInputs,
      framework_resolution: {
        selected_names: [...replaySafeInputs.framework_resolution.selected_names],
        retrieval_method: replaySafeInputs.framework_resolution.retrieval_method,
        discovery_used: replaySafeInputs.framework_resolution.discovery_used,
        invalid_overrides: [...replaySafeInputs.framework_resolution.invalid_overrides],
        warnings: [...replaySafeInputs.framework_resolution.warnings],
      },
    },
  };
}

export function createGroundingRuntime(runtime: VaultRuntime): GroundingRuntime {
  return {
    buildGroundedNext10Prompt: (commandText: string, options) =>
      buildGroundedNext10Prompt(runtime, commandText, options),
  };
}
