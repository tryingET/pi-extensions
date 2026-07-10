import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createFilesystemPort } from "../src/adapters/filesystem.ts";
import { formatChangeResult, formatInspectResult } from "../src/adapters/format.ts";
import { registerOntologyInteractionRuntime } from "../src/adapters/interaction.ts";
import { createRocsCliPort } from "../src/adapters/rocs-cli.ts";
import { createWorkspacePort } from "../src/adapters/workspace.ts";
import { planOntologyChange, runOntologyChange } from "../src/core/change.ts";
import {
  ONTOLOGY_ARTIFACT_KINDS,
  ONTOLOGY_CHANGE_MODES,
  ONTOLOGY_CHANGE_OPERATIONS,
  ONTOLOGY_INSPECT_KINDS,
  ONTOLOGY_SCOPES,
  type OntologyChangeRequest,
  type OntologyInspectRequest,
  SYSTEM4D_ACTIONS,
} from "../src/core/contracts.ts";
import { inspectOntology } from "../src/core/inspect.ts";
import {
  createOntologyProposalRuntime,
  ONTOLOGY_PROPOSAL_CANDIDATE_KINDS,
  ONTOLOGY_PROPOSAL_SCOPE_HINTS,
  type OntologyProposalAssessment,
  type OntologyProposalCandidate,
} from "../src/core/proposal.ts";

type PiToolParameters = Parameters<ExtensionAPI["registerTool"]>[0]["parameters"];

function asPiToolParameters(schema: unknown): PiToolParameters {
  return schema as PiToolParameters;
}

const files = createFilesystemPort();
const rocs = createRocsCliPort();
const workspace = createWorkspacePort();
const runtimeDeps = { files, rocs, workspace };
const proposalRuntime = createOntologyProposalRuntime(runtimeDeps);
const ONTOLOGY_STATUS_KEY = "ontology-workflows";
const HEADLESS_MUTATION_ERROR =
  "Ontology mutation requires interactive UI confirmation; no change was applied in this headless session.";

function outputCommandText(ctx: { hasUI: boolean }, text: string): void {
  if (!ctx.hasUI) console.log(text);
}

const inspectSchema = Type.Object({
  kind: StringEnum(ONTOLOGY_INSPECT_KINDS),
  scope: Type.Optional(StringEnum(ONTOLOGY_SCOPES)),
  targetRepo: Type.Optional(
    Type.String({ description: "Optional explicit ontology repo root override" }),
  ),
  query: Type.Optional(Type.String({ description: "Search query when kind=search" })),
  ontId: Type.Optional(Type.String({ description: "Exact ontology id when kind=pack" })),
  includeValidation: Type.Optional(
    Type.Boolean({ description: "Include rocs validate in status mode (default: true)" }),
  ),
  depth: Type.Optional(Type.Integer({ minimum: 0, description: "Optional pack depth" })),
  maxDocs: Type.Optional(Type.Integer({ minimum: 1, description: "Optional pack max docs" })),
});

const proposalSchema = Type.Object({
  candidateKind: StringEnum(ONTOLOGY_PROPOSAL_CANDIDATE_KINDS),
  scopeHint: Type.Optional(StringEnum(ONTOLOGY_PROPOSAL_SCOPE_HINTS)),
  title: Type.Optional(Type.String()),
  labels: Type.Optional(Type.Array(Type.String())),
  synonyms: Type.Optional(Type.Array(Type.String())),
  description: Type.String(),
  domain: Type.Optional(Type.String()),
  range: Type.Optional(Type.String()),
  rationale: Type.Optional(Type.String()),
  evidenceRefs: Type.Optional(Type.Array(Type.String())),
});

const changeSchema = Type.Object({
  mode: StringEnum(ONTOLOGY_CHANGE_MODES),
  scope: Type.Optional(StringEnum(ONTOLOGY_SCOPES)),
  targetRepo: Type.Optional(
    Type.String({ description: "Optional explicit ontology repo root override" }),
  ),
  artifactKind: StringEnum(ONTOLOGY_ARTIFACT_KINDS),
  operation: StringEnum(ONTOLOGY_CHANGE_OPERATIONS),
  targetId: Type.Optional(
    Type.String({ description: "Concept/relation id (required for concept/relation)" }),
  ),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  labels: Type.Optional(Type.Array(Type.String())),
  synonyms: Type.Optional(Type.Array(Type.String())),
  relations: Type.Optional(
    Type.Array(
      Type.Object({
        type: Type.String(),
        target: Type.String(),
      }),
    ),
  ),
  examples: Type.Optional(Type.Array(Type.String())),
  antiExamples: Type.Optional(Type.Array(Type.String())),
  status: Type.Optional(Type.String()),
  deprecated: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  relationGroup: Type.Optional(Type.String()),
  relationCharacteristics: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  inverse: Type.Optional(Type.String()),
  domain: Type.Optional(Type.String()),
  range: Type.Optional(Type.String()),
  notes: Type.Optional(Type.Array(Type.String())),
  rationale: Type.Optional(Type.String()),
  bridgeMappings: Type.Optional(
    Type.Array(
      Type.Object({
        concept_id: Type.String(),
        target: Type.String(),
        kind: Type.Optional(Type.String()),
        note: Type.Optional(Type.String()),
      }),
    ),
  ),
  manifestLayers: Type.Optional(
    Type.Array(
      Type.Object({
        name: Type.String(),
        ref: Type.Optional(Type.String()),
        path: Type.Optional(Type.String()),
      }),
    ),
  ),
  manifestProfiles: Type.Optional(
    Type.Record(
      Type.String(),
      Type.Object({
        include_layers: Type.Optional(Type.Array(Type.String())),
        exclude_layers: Type.Optional(Type.Array(Type.String())),
        budget: Type.Optional(Type.Integer({ minimum: 1 })),
      }),
    ),
  ),
  manifestDefaultProfile: Type.Optional(Type.String()),
  system4dPath: Type.Optional(Type.String()),
  system4dAction: Type.Optional(StringEnum(SYSTEM4D_ACTIONS)),
  system4dValue: Type.Optional(Type.Unknown()),
  validateAfter: Type.Optional(Type.Boolean()),
  buildAfter: Type.Optional(Type.Boolean()),
});

function buildStartupNotificationText(result: Awaited<ReturnType<typeof inspectOntology>>): string {
  return [
    `ontology scope=${result.target.scope}`,
    `repo=${result.target.repoPath}`,
    `concepts=${result.status?.counts.concepts ?? "?"} relations=${result.status?.counts.relations ?? "?"}`,
    `validation=${result.status?.validation?.ok === false ? "fail" : "ok"}`,
    "",
    "picker: /ontology:<query>[::scope]",
    "pack: /ontology-pack:<query>[::scope]",
    "change: /ontology-change:<query>[::scope]",
    "bootstrap: /ontology-bootstrap",
    "manifest: /ontology-manifest",
  ].join("\n");
}

function buildBootstrapSuggestionText(repoPath: string): string {
  return [
    `No repo-local ontology found for ${repoPath}`,
    "",
    "Use /ontology-bootstrap to create a minimal nested ontology/ skeleton before the first repo-scoped ontology changes.",
    "Use /ontology-manifest after bootstrap if you want to adjust repo-local layers or profiles.",
    "You can still inspect company/core ontology explicitly with ontology_inspect or /ontology-status company|core.",
  ].join("\n");
}

function buildManifestHelpText(): string {
  return [
    "# /ontology-manifest",
    "",
    "Manage the repo-local ontology manifest at ontology/manifest.yaml.",
    "",
    "Usage:",
    "- /ontology-manifest",
    "- /ontology-manifest show",
    "- /ontology-manifest help",
    "- /ontology-manifest reset",
    "- /ontology-manifest default <profile>",
    "- /ontology-manifest profile <name> [--include core,company] [--exclude repo] [--budget 1600]",
    "",
    "Notes:",
    "- This command is repo-local only.",
    "- If the repo has no ontology yet, apply actions bootstrap first, then apply the manifest change automatically.",
  ].join("\n");
}

function buildRepoOnlyManifestCommandText(repoPath: string, repoKind: string): string {
  return [
    `The current target (${repoPath}) is a ${repoKind} ontology repo, not a normal repo-local ontology consumer.`,
    "",
    "Use ontology_change directly for dedicated company/core ontology work.",
    "This /ontology-manifest command is intentionally limited to nested repo-local ontology/manifest.yaml files.",
  ].join("\n");
}

function formatProposalAssessment(result: OntologyProposalAssessment): string {
  const lines = [
    "# Ontology Proposal Check",
    "",
    `- ok: ${result.ok ? "yes" : "no"}`,
    `- verdict: ${result.verdict}`,
    `- recommended scope: ${result.recommendedScope}`,
    `- duplicate risk: ${result.duplicateRisk}`,
    `- recommended target id: ${result.recommendedTargetId ?? "-"}`,
    "",
    "## Reasoning",
    result.reasoning,
    "",
    "## Nearest existing",
  ];

  if (result.nearestExisting.length === 0) {
    lines.push("- none");
  } else {
    for (const match of result.nearestExisting) {
      lines.push(`- ${match.ontId} (score=${match.score}) — ${match.reason}`);
    }
  }

  if (result.ontologyChangePlan) {
    lines.push(
      "",
      "## Suggested ontology_change payload",
      "```json",
      JSON.stringify(result.ontologyChangePlan, null, 2),
      "```",
    );
  }

  return lines.join("\n");
}

function getRepoManifestPath(repoPath: string): string {
  return `${repoPath}/ontology/manifest.yaml`;
}

function isRepoLocalOntologyConsumer(
  detected: Awaited<ReturnType<typeof workspace.detect>>,
): boolean {
  return detected.currentRepoKind === "repo" || detected.currentRepoKind === "none";
}

function shouldSuggestBootstrap(detected: Awaited<ReturnType<typeof workspace.detect>>): boolean {
  return (
    detected.currentRepoDetectedFromGit &&
    !detected.currentRepoHasOntology &&
    detected.currentRepoKind === "none"
  );
}

export type OntologyManifestCommandPlan =
  | { kind: "show" | "help" }
  | { kind: "apply"; request: OntologyChangeRequest };

export function parseOntologyManifestCommandArgs(raw: string): OntologyManifestCommandPlan {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens[0] === "show") {
    return { kind: "show" };
  }
  if (tokens[0] === "help") {
    return { kind: "help" };
  }
  if (tokens[0] === "reset") {
    return {
      kind: "apply",
      request: {
        mode: "apply",
        artifactKind: "manifest",
        operation: "upsert",
        scope: "repo",
      },
    };
  }
  if (tokens[0] === "default") {
    const profile = tokens[1]?.trim();
    if (!profile) {
      throw new Error("/ontology-manifest default requires a profile name");
    }
    return {
      kind: "apply",
      request: {
        mode: "apply",
        artifactKind: "manifest",
        operation: "upsert",
        scope: "repo",
        manifestDefaultProfile: profile,
      },
    };
  }
  if (tokens[0] === "profile") {
    const profileName = tokens[1]?.trim();
    if (!profileName) {
      throw new Error("/ontology-manifest profile requires a profile name");
    }

    let includeLayers: string[] | undefined;
    let excludeLayers: string[] | undefined;
    let budget: number | undefined;

    for (let i = 2; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === "--include") {
        const value = tokens[++i];
        if (!value) throw new Error("--include requires a comma-separated layer list");
        includeLayers = value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        continue;
      }
      if (token === "--exclude") {
        const value = tokens[++i];
        if (!value) throw new Error("--exclude requires a comma-separated layer list");
        excludeLayers = value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        continue;
      }
      if (token === "--budget") {
        const value = tokens[++i];
        if (!value) throw new Error("--budget requires a positive integer");
        if (!/^[1-9]\d*$/.test(value)) {
          throw new Error("--budget requires a positive integer");
        }
        const parsed = Number(value);
        if (!Number.isSafeInteger(parsed)) {
          throw new Error("--budget requires a positive integer");
        }
        budget = parsed;
        continue;
      }
      throw new Error(`unknown /ontology-manifest argument: ${token}`);
    }

    return {
      kind: "apply",
      request: {
        mode: "apply",
        artifactKind: "manifest",
        operation: "upsert",
        scope: "repo",
        manifestProfiles: {
          [profileName]: {
            include_layers: includeLayers,
            exclude_layers: excludeLayers,
            budget,
          },
        },
      },
    };
  }

  throw new Error(`unknown /ontology-manifest subcommand: ${tokens[0]}`);
}

export default function ontologyWorkflowsExtension(pi: ExtensionAPI) {
  registerOntologyInteractionRuntime(pi, runtimeDeps);

  pi.registerTool({
    name: "ontology_inspect",
    label: "Ontology Inspect",
    description:
      "Inspect ontology state through a stable workflow core. Supports status, search, and pack while routing repo/company/core targets through ROCS.",
    promptSnippet: "Inspect ontology state through the stable ontology workflow core.",
    promptGuidelines: [
      "Use ontology_inspect before changing domain semantics, concepts, relations, system4d, or bridge mappings.",
      "Prefer kind=status to understand current health, kind=search to find matching ids, and kind=pack for exact concept/relation context.",
    ],
    parameters: asPiToolParameters(inspectSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await inspectOntology(
        params as OntologyInspectRequest,
        { cwd: ctx.cwd },
        runtimeDeps,
      );
      const text = formatInspectResult(result);
      updateStatusFromInspect(ctx, result);
      return {
        content: [{ type: "text", text }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "ontology_proposal",
    label: "Ontology Proposal Check",
    description:
      "Assess a candidate ontology concept or relation without applying changes. Performs collision checks, scope recommendation, id suggestion, and emits a plan-ready ontology_change payload when appropriate.",
    promptSnippet:
      "Assess whether a missing term belongs in ontology before creating an ontology_change plan.",
    promptGuidelines: [
      "Use ontology_proposal when you suspect a missing concept or relation but are not yet sure ontology is the right tool.",
      "Treat this as plan-only governance support: it should assess duplicates, scope, and target ids, not apply changes.",
      "Review high-duplicate or insufficient-evidence results before writing ontology candidate artifacts or change plans.",
    ],
    parameters: asPiToolParameters(proposalSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await proposalRuntime.assess(params as OntologyProposalCandidate, {
        cwd: ctx.cwd,
      });
      return {
        content: [{ type: "text", text: formatProposalAssessment(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "ontology_change",
    label: "Ontology Change",
    description:
      "Plan or apply ontology changes through the stable ontology workflow core. Supports concept, relation, system4d, bridge, manifest, and bootstrap operations with repo/company/core routing.",
    promptSnippet: "Plan or apply ontology changes through one stable workflow core.",
    promptGuidelines: [
      "Use ontology_change instead of direct file edits when changing ontology semantics or scope placement matters.",
      "Use mode=plan first when the change target or schema is uncertain, then mode=apply for the final write.",
      "Use artifactKind=bootstrap to create a repo-local ontology skeleton before the first repo-scoped ontology changes.",
      "Use artifactKind=manifest when the repo-local ontology manifest or profiles need explicit control.",
      "Keep scope explicit when auto routing would be risky; company/core apply calls can write outside the current repo.",
    ],
    parameters: asPiToolParameters(changeSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as OntologyChangeRequest;
      if (request.mode === "apply" && !ctx.hasUI) {
        throw new Error(HEADLESS_MUTATION_ERROR);
      }
      const planned = await planOntologyChange(request, { cwd: ctx.cwd }, runtimeDeps);

      if (request.mode === "apply" && planned.target.externalToCurrentRepo && ctx.hasUI) {
        const ok = await ctx.ui.confirm(
          "Apply ontology change?",
          `This will write outside the current repo:\n\n${planned.target.repoPath}\n\nContinue?`,
        );
        if (!ok) {
          return {
            content: [
              {
                type: "text",
                text: `${formatChangeResult(planned)}\n\nApply cancelled by operator.`,
              },
            ],
            details: { ...planned, cancelled: true },
          };
        }
      }

      const result =
        request.mode === "apply"
          ? await runOntologyChange(request, { cwd: ctx.cwd }, runtimeDeps)
          : planned;

      if (request.mode === "apply") {
        try {
          const refreshed = await inspectOntology(
            {
              kind: "status",
              scope: result.target.scope,
              targetRepo: result.target.repoPath,
              includeValidation: true,
            },
            { cwd: ctx.cwd },
            runtimeDeps,
          );
          updateStatusFromInspect(ctx, refreshed);
        } catch {
          // best-effort UI refresh only
        }
      }

      return {
        content: [{ type: "text", text: formatChangeResult(result) }],
        details: result,
      };
    },
  });

  pi.registerCommand("ontology-status", {
    description: "Inspect ontology status for the current repo/company/core context",
    handler: async (args, ctx) => {
      const rawScope = args.trim();
      const scope = ONTOLOGY_SCOPES.includes(rawScope as (typeof ONTOLOGY_SCOPES)[number])
        ? (rawScope as (typeof ONTOLOGY_SCOPES)[number])
        : undefined;
      const result = await inspectOntology(
        { kind: "status", scope, includeValidation: true },
        { cwd: ctx.cwd },
        runtimeDeps,
      );
      const text = formatInspectResult(result);
      updateStatusFromInspect(ctx, result);
      if (ctx.hasUI) {
        await ctx.ui.editor("Ontology Status", text);
      } else {
        outputCommandText(ctx, text);
      }
    },
  });

  pi.registerCommand("ontology-bootstrap", {
    description: "Create the minimal repo-local ontology/ skeleton for the current repo",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        outputCommandText(ctx, HEADLESS_MUTATION_ERROR);
        return;
      }
      const detected = await workspace.detect(ctx.cwd);
      if (!detected.currentRepoDetectedFromGit) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            "Ontology bootstrap requires a git repo root or a child directory inside a git repo",
            "error",
          );
        }
        return;
      }

      if (detected.currentRepoHasOntology) {
        const result = await inspectOntology(
          { kind: "status", scope: "repo", includeValidation: true },
          { cwd: ctx.cwd },
          runtimeDeps,
        );
        updateStatusFromInspect(ctx, result);
        const text = `Repo-local ontology already exists. Use /ontology-status or /ontology-manifest for follow-up changes.\n\n${formatInspectResult(result)}`;
        if (ctx.hasUI) {
          await ctx.ui.editor("Ontology Bootstrap", text);
        }
        return;
      }

      const repoName = args.trim() || undefined;
      const request: OntologyChangeRequest = {
        mode: "apply",
        artifactKind: "bootstrap",
        operation: "create",
        scope: "repo",
        title: repoName,
        validateAfter: true,
        buildAfter: true,
      };

      const planned = await planOntologyChange(request, { cwd: ctx.cwd }, runtimeDeps);
      if (ctx.hasUI) {
        const ok = await ctx.ui.confirm(
          "Bootstrap ontology?",
          `${formatChangeResult(planned)}\n\nCreate the repo-local ontology skeleton?`,
        );
        if (!ok) {
          ctx.ui.notify("Ontology bootstrap cancelled", "info");
          return;
        }
      }

      const result = await runOntologyChange(request, { cwd: ctx.cwd }, runtimeDeps);
      try {
        const refreshed = await inspectOntology(
          { kind: "status", scope: "repo", includeValidation: true },
          { cwd: ctx.cwd },
          runtimeDeps,
        );
        updateStatusFromInspect(ctx, refreshed);
      } catch {
        // best-effort UI refresh only
      }

      const text = formatChangeResult(result);
      if (ctx.hasUI) {
        await ctx.ui.editor("Ontology Bootstrap", text);
      }
    },
  });

  pi.registerCommand("ontology-manifest", {
    description: "Show or update the repo-local ontology manifest for the current repo",
    handler: async (args, ctx) => {
      const detected = await workspace.detect(ctx.cwd);
      if (!detected.currentRepoDetectedFromGit) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            "Ontology manifest work requires a git repo root or a child directory inside a git repo",
            "error",
          );
        }
        return;
      }

      if (!isRepoLocalOntologyConsumer(detected)) {
        const text = buildRepoOnlyManifestCommandText(
          detected.currentRepoPath,
          detected.currentRepoKind,
        );
        if (ctx.hasUI) {
          await ctx.ui.editor("Ontology Manifest", text);
        }
        return;
      }

      let plan: OntologyManifestCommandPlan;
      try {
        plan = parseOntologyManifestCommandArgs(args);
      } catch (error) {
        const text = `${error instanceof Error ? error.message : String(error)}\n\n${buildManifestHelpText()}`;
        if (ctx.hasUI) {
          await ctx.ui.editor("Ontology Manifest", text);
        }
        return;
      }

      const manifestPath = getRepoManifestPath(detected.currentRepoPath);

      if (plan.kind === "help") {
        if (ctx.hasUI) {
          await ctx.ui.editor("Ontology Manifest", buildManifestHelpText());
        }
        return;
      }

      if (plan.kind === "show") {
        if (!(await files.exists(manifestPath))) {
          const text = `${buildBootstrapSuggestionText(detected.currentRepoPath)}\n\n${buildManifestHelpText()}`;
          if (ctx.hasUI) {
            await ctx.ui.editor("Ontology Manifest", text);
          }
          return;
        }

        const manifestText = await files.readText(manifestPath);
        if (ctx.hasUI) {
          await ctx.ui.editor("Ontology Manifest", manifestText);
        }
        return;
      }

      if (plan.kind !== "apply") {
        return;
      }
      if (!ctx.hasUI) {
        outputCommandText(ctx, HEADLESS_MUTATION_ERROR);
        return;
      }

      const manifestRequest = plan.request;
      const needsBootstrap = !detected.currentRepoHasOntology;
      const bootstrapRequest: OntologyChangeRequest | undefined = needsBootstrap
        ? {
            mode: "apply",
            artifactKind: "bootstrap",
            operation: "create",
            scope: "repo",
            validateAfter: false,
            buildAfter: false,
          }
        : undefined;

      const previewParts: string[] = [];
      if (bootstrapRequest) {
        const bootstrapPlan = await planOntologyChange(
          bootstrapRequest,
          { cwd: ctx.cwd },
          runtimeDeps,
        );
        previewParts.push(
          "# Ontology Bootstrap (pre-step)",
          "",
          formatChangeResult(bootstrapPlan).trim(),
        );
      }
      const manifestPlan = await planOntologyChange(manifestRequest, { cwd: ctx.cwd }, runtimeDeps);
      previewParts.push("# Ontology Manifest", "", formatChangeResult(manifestPlan).trim());

      if (ctx.hasUI) {
        const ok = await ctx.ui.confirm(
          "Apply ontology manifest change?",
          `${previewParts.join("\n\n")}\n\nContinue?`,
        );
        if (!ok) {
          ctx.ui.notify("Ontology manifest update cancelled", "info");
          return;
        }
      }

      if (bootstrapRequest) {
        await runOntologyChange(bootstrapRequest, { cwd: ctx.cwd }, runtimeDeps);
      }
      const result = await runOntologyChange(manifestRequest, { cwd: ctx.cwd }, runtimeDeps);

      try {
        const refreshed = await inspectOntology(
          { kind: "status", scope: "repo", includeValidation: true },
          { cwd: ctx.cwd },
          runtimeDeps,
        );
        updateStatusFromInspect(ctx, refreshed);
      } catch {
        // best-effort UI refresh only
      }

      const manifestText = await files.readText(getRepoManifestPath(detected.currentRepoPath));
      const text = `${formatChangeResult(result)}\n\n## Current manifest\n\n${manifestText}`;
      if (ctx.hasUI) {
        await ctx.ui.editor("Ontology Manifest", text);
      }
    },
  });

  pi.on("session_start", async (event, ctx) => {
    if (!ctx.hasUI) return;

    ctx.ui.setWidget(ONTOLOGY_STATUS_KEY, undefined);

    try {
      const detected = await workspace.detect(ctx.cwd);
      if (shouldSuggestBootstrap(detected)) {
        ctx.ui.setStatus(ONTOLOGY_STATUS_KEY, "repo:none");
        if ((event as { reason?: string }).reason === "startup") {
          ctx.ui.notify(buildBootstrapSuggestionText(detected.currentRepoPath), "info");
        }
        return;
      }

      if (
        !detected.currentRepoHasOntology &&
        !detected.currentCompany &&
        detected.currentRepoKind === "none"
      ) {
        ctx.ui.setStatus(ONTOLOGY_STATUS_KEY, undefined);
        return;
      }

      const result = await inspectOntology(
        { kind: "status", includeValidation: true },
        { cwd: ctx.cwd },
        runtimeDeps,
      );
      updateStatusFromInspect(ctx, result);

      if ((event as { reason?: string }).reason === "startup") {
        ctx.ui.notify(buildStartupNotificationText(result), "info");
      }
    } catch (error) {
      ctx.ui.setStatus(
        ONTOLOGY_STATUS_KEY,
        `ontology unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const prompt = event.prompt.toLowerCase();
    if (!isOntologyRelevantPrompt(prompt)) return;

    let bootstrapHint = "";
    try {
      const detected = await workspace.detect(ctx.cwd);
      if (shouldSuggestBootstrap(detected)) {
        bootstrapHint = `\n- This repo does not have a repo-local ontology yet; use /ontology-bootstrap or ontology_change with artifactKind=bootstrap and scope=repo before the first repo-scoped ontology changes.`;
      }
    } catch {
      // best-effort hint only
    }

    return {
      systemPrompt:
        `${event.systemPrompt}\n\n` +
        `Ontology workflow hint:\n` +
        `- Use ontology_inspect before inventing or changing concepts, relations, invariants, system4d entries, or bridge mappings.\n` +
        `- If you are unsure whether a missing term deserves ontology at all, use ontology_proposal before ontology_change.\n` +
        `- Use ontology_change for ontology writes so routing, validation, and build behavior stay explicit.\n` +
        `- Keep repo/company/core placement explicit when semantic scope matters.` +
        bootstrapHint,
    };
  });
}

function updateStatusFromInspect(
  ctx: { hasUI: boolean; ui: { setStatus: (id: string, value?: string) => void } },
  result: Awaited<ReturnType<typeof inspectOntology>>,
) {
  if (!ctx.hasUI) return;
  const validationState = result.status?.validation?.ok === false ? "invalid" : "ok";
  const counts = result.status
    ? ` concepts=${result.status.counts.concepts} relations=${result.status.counts.relations}`
    : "";
  ctx.ui.setStatus(ONTOLOGY_STATUS_KEY, `${result.target.scope}:${validationState}${counts}`);
}

function isOntologyRelevantPrompt(prompt: string): boolean {
  const patterns = [
    /\bontology\b/,
    /\bconcept\b/,
    /\brelation\b/,
    /\binvariant\b/,
    /\bsystem4d\b/,
    /\bsemantic\b/,
    /\bmeaning\b/,
    /\bbridge mapping\b/,
  ];
  return patterns.some((pattern) => pattern.test(prompt));
}
