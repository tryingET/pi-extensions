import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
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

const files = createFilesystemPort();
const rocs = createRocsCliPort();
const workspace = createWorkspacePort();
const runtimeDeps = { files, rocs, workspace };

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
  system4dPath: Type.Optional(Type.String()),
  system4dAction: Type.Optional(StringEnum(SYSTEM4D_ACTIONS)),
  system4dValue: Type.Optional(Type.Unknown()),
  validateAfter: Type.Optional(Type.Boolean()),
  buildAfter: Type.Optional(Type.Boolean()),
});

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
    parameters: inspectSchema,
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
    name: "ontology_change",
    label: "Ontology Change",
    description:
      "Plan or apply ontology changes through the stable ontology workflow core. Supports concept, relation, system4d, and bridge operations with repo/company/core routing.",
    promptSnippet: "Plan or apply ontology changes through one stable workflow core.",
    promptGuidelines: [
      "Use ontology_change instead of direct file edits when changing ontology semantics or scope placement matters.",
      "Use mode=plan first when the change target or schema is uncertain, then mode=apply for the final write.",
      "Keep scope explicit when auto routing would be risky; company/core apply calls can write outside the current repo.",
    ],
    parameters: changeSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as OntologyChangeRequest;
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
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    try {
      const detected = await workspace.detect(ctx.cwd);
      if (
        !detected.currentRepoHasOntology &&
        !detected.currentCompany &&
        detected.currentRepoKind === "none"
      ) {
        return;
      }

      const result = await inspectOntology(
        { kind: "status", includeValidation: true },
        { cwd: ctx.cwd },
        runtimeDeps,
      );
      updateStatusFromInspect(ctx, result);
      ctx.ui.setWidget("ontology-workflows", [
        `ontology scope=${result.target.scope}`,
        `repo=${result.target.repoPath}`,
        `concepts=${result.status?.counts.concepts ?? "?"} relations=${result.status?.counts.relations ?? "?"}`,
        `validation=${result.status?.validation?.ok === false ? "fail" : "ok"}`,
        "picker: /ontology:<query>[::scope]",
        "pack: /ontology-pack:<query>[::scope]",
        "change: /ontology-change:<query>[::scope]",
      ]);
    } catch (error) {
      ctx.ui.setStatus(
        "ontology-workflows",
        `ontology unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  pi.on("before_agent_start", async (event) => {
    const prompt = event.prompt.toLowerCase();
    if (!isOntologyRelevantPrompt(prompt)) return;
    return {
      systemPrompt:
        `${event.systemPrompt}\n\n` +
        `Ontology workflow hint:\n` +
        `- Use ontology_inspect before inventing or changing concepts, relations, invariants, system4d entries, or bridge mappings.\n` +
        `- Use ontology_change for ontology writes so routing, validation, and build behavior stay explicit.\n` +
        `- Keep repo/company/core placement explicit when semantic scope matters.`,
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
  ctx.ui.setStatus("ontology-workflows", `${result.target.scope}:${validationState}${counts}`);
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
