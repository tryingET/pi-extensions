import {
  AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_CANDIDATES,
  type AutoresearchCandidateDecisionTriggerCandidate,
  buildAutoresearchCandidateDecisionTriggerCandidates,
} from "./candidateDecisionUi.ts";
import type {
  AutoresearchCandidateBindTriggerMode,
  AutoresearchCandidateDecisionTriggerAction,
  AutoresearchTriggerRunMode,
  AutoresearchTriggerSetupMode,
} from "./commandText.ts";
import { buildAutoresearchCampaignStartToolCall } from "./commandText.ts";
import {
  buildAutoresearchCandidateBindOrMeasureEditorCall,
  buildAutoresearchCandidateDecisionEditorCall,
  parseAutoresearchCandidateDecisionCommand,
} from "./commandTextCandidates.ts";

type AutoresearchTriggerCandidate = {
  id: string;
  label: string;
  detail: string;
  runMode: AutoresearchTriggerRunMode;
  setupMode: AutoresearchTriggerSetupMode;
  maxIterations: number;
};

type AutoresearchCandidateBindTriggerCandidate = {
  id: string;
  label: string;
  detail: string;
};

type AutoresearchTriggerParsedInput = {
  objective: string;
  query: string;
  raw: string;
};

type AutoresearchCandidateDecisionTriggerParsedInput = {
  query: string;
  raw: string;
  directAction: AutoresearchCandidateDecisionTriggerAction | null;
};

type AutoresearchCandidateBindTriggerParsedInput = {
  mode: AutoresearchCandidateBindTriggerMode;
  candidateWorktree: string;
  query: string;
  raw: string;
};

export type AutoresearchTriggerSurface = {
  registerPickerInteraction?: (config: Record<string, unknown>) => { unregister?: () => void };
};

type AutoresearchTriggerApi = {
  setText?: (text: string) => void;
  notify?: (message: string, level?: string) => void;
};

type AutoresearchTriggerContext = {
  cwd?: string;
};

const AUTORESEARCH_LIVE_TRIGGER_ID = "autoresearch-campaign-start-picker";
const AUTORESEARCH_CANDIDATE_BIND_TRIGGER_ID = "autoresearch-candidate-bind-picker";
const AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_ID = "autoresearch-candidate-decision-picker";
const AUTORESEARCH_TRIGGER_CANDIDATES: AutoresearchTriggerCandidate[] = [
  {
    id: "plan-only",
    label: "Plan only",
    detail: "Review metric contract, scope, warnings, and next exact call before execution.",
    runMode: "plan_only",
    setupMode: "autoplan",
    maxIterations: 3,
  },
  {
    id: "governed-setup-plan",
    label: "Governed setup plan",
    detail: "Request the package-owned Prompt Vault setup decision, then stop for review.",
    runMode: "plan_only",
    setupMode: "prompt_vault_setup",
    maxIterations: 3,
  },
  {
    id: "baseline",
    label: "Run baseline",
    detail: "Apply setup and run the first baseline through explicit runMode=baseline.",
    runMode: "baseline",
    setupMode: "autoplan",
    maxIterations: 3,
  },
  {
    id: "bounded-loop",
    label: "Bounded loop",
    detail: "Enter the supervised loop with an explicit three-iteration budget.",
    runMode: "bounded_loop",
    setupMode: "autoplan",
    maxIterations: 3,
  },
];
const AUTORESEARCH_CANDIDATE_BIND_TRIGGER_CANDIDATES: AutoresearchCandidateBindTriggerCandidate[] =
  [
    {
      id: "plan-run",
      label: "Plan candidate measurement",
      detail:
        "Inspect the selected worktree/branch and insert autoresearch_candidate_bind; no run or mutation is applied.",
    },
  ];

export async function loadAutoresearchTriggerSurface(): Promise<AutoresearchTriggerSurface | null> {
  try {
    const interactionModuleName = "@tryinget/pi-interaction";
    return (await import(interactionModuleName)) as AutoresearchTriggerSurface;
  } catch {
    try {
      const triggerAdapterModuleName = "@tryinget/pi-trigger-adapter";
      return (await import(triggerAdapterModuleName)) as AutoresearchTriggerSurface;
    } catch {
      return null;
    }
  }
}

export async function maybeRegisterAutoresearchLiveTrigger(
  explicitTriggerSurface?: AutoresearchTriggerSurface | null,
): Promise<{ unregister: () => void }> {
  try {
    const triggerSurface = explicitTriggerSurface ?? (await loadAutoresearchTriggerSurface());
    if (typeof triggerSurface?.registerPickerInteraction !== "function") {
      return { unregister: () => {} };
    }

    const registrations: Array<{ unregister?: () => void }> = [];

    registrations.push(
      triggerSurface.registerPickerInteraction({
        id: AUTORESEARCH_CANDIDATE_BIND_TRIGGER_ID,
        description:
          "pi-autoresearch candidate bind/measure picker for $$ autoresearch bind|measure [current|<worktree>]",
        priority: 116,
        match: /^\$\$\s*(?:autoresearch|ar)\s+(?:candidate\s+)?(bind|measure)(?:\s+([^\n]*))?$/,
        requireCursorAtEnd: true,
        debounceMs: 150,
        showInPicker: true,
        pickerLabel: "$$ autoresearch bind/measure",
        pickerDetail: "Inspect a candidate worktree and prepare measurement binding",
        parseInput: (
          match: { groups?: string[] },
          context?: AutoresearchTriggerContext,
        ): AutoresearchCandidateBindTriggerParsedInput => {
          const mode = String(match?.groups?.[0] ?? "bind") === "measure" ? "measure" : "bind";
          const raw = String(match?.groups?.[1] ?? "").trim();
          const cwd = context?.cwd ?? process.cwd();
          const candidateWorktree = raw && raw.toLowerCase() !== "current" ? raw : cwd;
          return { mode, candidateWorktree, query: raw, raw };
        },
        loadCandidates: () => ({ candidates: AUTORESEARCH_CANDIDATE_BIND_TRIGGER_CANDIDATES }),
        selectTitle: ({ parsed }: { parsed?: AutoresearchCandidateBindTriggerParsedInput }) => {
          const query = parsed?.query ? `: ${parsed.query}` : " current";
          const mode = parsed?.mode ?? "bind";
          return `Autoresearch candidate ${mode}${query}`;
        },
        applySelection: ({
          parsed,
          context,
          api,
        }: {
          selected?: AutoresearchCandidateBindTriggerCandidate;
          parsed?: AutoresearchCandidateBindTriggerParsedInput;
          context?: AutoresearchTriggerContext;
          api?: AutoresearchTriggerApi;
        }) => {
          const cwd = context?.cwd ?? process.cwd();
          const candidateWorktree = parsed?.candidateWorktree ?? cwd;
          api?.setText?.(
            buildAutoresearchCandidateBindOrMeasureEditorCall(
              cwd,
              candidateWorktree,
              parsed?.mode ?? "bind",
            ),
          );
        },
        onNoCandidates: ({ api }: { api?: AutoresearchTriggerApi }) => {
          api?.notify?.("No autoresearch candidate-bind actions are available.", "warning");
        },
        onError: ({ error, api }: { error?: unknown; api?: AutoresearchTriggerApi }) => {
          api?.notify?.(
            `Autoresearch candidate-bind picker error: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        },
      }),
    );

    registrations.push(
      triggerSurface.registerPickerInteraction({
        id: AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_ID,
        description:
          "pi-autoresearch candidate decision picker for $$ autoresearch candidate|keep|discard|rewind",
        priority: 115,
        match:
          /^\$\$\s*(?:autoresearch|ar)\s+(?:(candidate|decision)(?:\s+([^\n]*))?|(keep|discard|rewind))$/,
        requireCursorAtEnd: true,
        debounceMs: 150,
        showInPicker: true,
        pickerLabel: "$$ autoresearch candidate decision",
        pickerDetail: "Plan keep/discard/rewind without applying worktree actions",
        parseInput: (match: {
          groups?: string[];
        }): AutoresearchCandidateDecisionTriggerParsedInput => {
          const direct = parseAutoresearchCandidateDecisionCommand(
            String(match?.groups?.[2] ?? ""),
          );
          const raw = direct ? String(match?.groups?.[2] ?? "") : String(match?.groups?.[1] ?? "");
          const query = direct ? raw : raw.trim();
          return { query, raw, directAction: direct };
        },
        loadCandidates: ({
          parsed,
          context,
        }: {
          parsed?: AutoresearchCandidateDecisionTriggerParsedInput;
          context?: AutoresearchTriggerContext;
        }) => ({
          candidates: buildAutoresearchCandidateDecisionTriggerCandidates({
            cwd: context?.cwd ?? process.cwd(),
            directAction: parsed?.directAction ?? null,
          }),
        }),
        selectTitle: ({ parsed }: { parsed?: AutoresearchCandidateDecisionTriggerParsedInput }) => {
          const query = parsed?.query ? `: ${parsed.query}` : "";
          return `Autoresearch candidate decision${query}`;
        },
        applySelection: ({
          selected,
          parsed,
          context,
          api,
        }: {
          selected?: AutoresearchCandidateDecisionTriggerCandidate;
          parsed?: AutoresearchCandidateDecisionTriggerParsedInput;
          context?: AutoresearchTriggerContext;
          api?: AutoresearchTriggerApi;
        }) => {
          const fallback = parsed?.directAction
            ? AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_CANDIDATES.find(
                (candidate) => candidate.action === parsed.directAction,
              )
            : AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_CANDIDATES[0];
          const selectedDecision = selected ?? fallback;
          if (!selectedDecision) {
            api?.notify?.("No autoresearch candidate-decision action is available.", "warning");
            return;
          }
          const cwd = context?.cwd ?? process.cwd();
          api?.setText?.(
            buildAutoresearchCandidateDecisionEditorCall(cwd, selectedDecision.action),
          );
        },
        onNoCandidates: ({ api }: { api?: AutoresearchTriggerApi }) => {
          api?.notify?.("No autoresearch candidate-decision actions are available.", "warning");
        },
        onError: ({ error, api }: { error?: unknown; api?: AutoresearchTriggerApi }) => {
          api?.notify?.(
            `Autoresearch candidate-decision picker error: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        },
      }),
    );

    registrations.push(
      triggerSurface.registerPickerInteraction({
        id: AUTORESEARCH_LIVE_TRIGGER_ID,
        description: "pi-autoresearch campaign-start picker for $$ autoresearch <objective>",
        priority: 105,
        match: /^\$\$\s*(?:autoresearch|ar)(?:\s+([^\n]*))?$/,
        requireCursorAtEnd: true,
        debounceMs: 150,
        showInPicker: true,
        pickerLabel: "$$ autoresearch picker",
        pickerDetail: "Supervised campaign start modes",
        parseInput: (match: { groups?: string[] }): AutoresearchTriggerParsedInput => {
          const raw = String(match?.groups?.[0] ?? "");
          const objective = raw.trim();
          return { objective, query: objective, raw };
        },
        loadCandidates: () => ({
          candidates: AUTORESEARCH_TRIGGER_CANDIDATES,
        }),
        selectTitle: ({ parsed }: { parsed?: AutoresearchTriggerParsedInput }) => {
          const objective = parsed?.objective ? `: ${parsed.objective}` : "";
          return `Autoresearch campaign start${objective}`;
        },
        applySelection: ({
          selected,
          parsed,
          context,
          api,
        }: {
          selected?: AutoresearchTriggerCandidate;
          parsed?: AutoresearchTriggerParsedInput;
          context?: AutoresearchTriggerContext;
          api?: AutoresearchTriggerApi;
        }) => {
          const objective = parsed?.objective.trim() ?? "";
          if (!objective) {
            api?.setText?.("$$ autoresearch <objective>");
            api?.notify?.(
              "Autoresearch picker needs an objective after '$$ autoresearch'.",
              "warning",
            );
            return;
          }

          const selectedMode = selected ?? AUTORESEARCH_TRIGGER_CANDIDATES[0];
          const cwd = context?.cwd ?? process.cwd();
          api?.setText?.(
            buildAutoresearchCampaignStartToolCall({
              cwd,
              objective,
              setupMode: selectedMode.setupMode,
              runMode: selectedMode.runMode,
              maxIterations: selectedMode.maxIterations,
            }),
          );
        },
        onNoCandidates: ({ api }: { api?: AutoresearchTriggerApi }) => {
          api?.notify?.("No autoresearch campaign-start modes are available.", "warning");
        },
        onError: ({ error, api }: { error?: unknown; api?: AutoresearchTriggerApi }) => {
          api?.notify?.(
            `Autoresearch picker error: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        },
      }),
    );

    return {
      unregister: () => {
        for (const registration of registrations) {
          if (typeof registration?.unregister === "function") registration.unregister();
        }
      },
    };
  } catch {
    return { unregister: () => {} };
  }
}
