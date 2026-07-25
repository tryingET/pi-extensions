/** Read-only Pi adapter over Agent Kernel's existing direction-to-execution controller. */

import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const AK_AUTHORITY = "ak_verifier_and_source_owner_receipts";
const APPLY_BOUNDARY = "explicit_authorization_required_for_mutation";
const COMMAND_TIMEOUT_MS = 30_000;
const REQUIRED_NON_AUTHORIZATIONS = [
  "no_lifecycle_close_from_generic_proceed",
  "no_lifecycle_activation_from_generic_proceed",
  "no_owner_surface_mutation",
  "no_owner_route_dispatch_without_authorization",
  "no_learning_activation",
  "no_publication",
  "no_dspy_dspx_normative_authority",
  "no_apply_capable_mutation_from_cockpit",
] as const;
const SAFE_NEXT_COMMANDS = [
  /^ak direction check --repo \. --machine$/,
  /^ak direction-controller status --repo \. -F json$/,
  /^ak task show [1-9][0-9]* -F json$/,
] as const;

type JsonRecord = Record<string, unknown>;

export interface DirectionControllerExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed?: boolean;
}

export type DirectionControllerExec = (
  command: string,
  args: string[],
  options: { cwd: string; signal?: AbortSignal; timeout: number },
) => Promise<DirectionControllerExecResult>;

export interface DirectionControllerReadback {
  schema_version: "pi.direction_controller.readback.v1";
  read_only: true;
  repo: string;
  intent: string;
  derived_state: string;
  strategic_frame: string | null;
  implementation_wave: string | null;
  execution_task: number | null;
  proposed_transition: string;
  availability: string;
  legal: boolean;
  program_availability: string;
  generated_program_dispatch_ready: boolean;
  generated_program_attempted: false;
  dspx_execution_claimed: false;
  dispatch_performed: false;
  apply_performed: false;
  authorization_granted: false;
  missing_preconditions: string[];
  next_safe_command: string | null;
  non_authorizations: string[];
  source_surfaces: {
    status: "ak.direction_controller.status";
    proposal: "ak.direction_controller.propose";
    transition_check: "ak.direction_controller.transition_check";
  };
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`direction-controller ${label} is not a JSON object`);
  }
  return value as JsonRecord;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`direction-controller ${label} is missing`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`direction-controller ${label} is malformed`);
  }
  return [...value];
}

function exactStringSet(value: unknown, expected: readonly string[], label: string): string[] {
  const actual = stringArray(value, label);
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    expected.some((item) => !actual.includes(item))
  ) {
    throw new Error(`direction-controller ${label} contract drifted`);
  }
  return actual;
}

function safeNextCommand(value: unknown): string {
  const command = nonEmptyString(value, "transition-check.next_safe_command");
  if (!SAFE_NEXT_COMMANDS.some((pattern) => pattern.test(command))) {
    throw new Error("direction-controller transition-check.next_safe_command is not allowlisted");
  }
  return command;
}

function validateAuthorityBoundary(value: unknown, label: string): void {
  const boundary = record(value, `${label}.authority_boundary`);
  if (
    boundary.deterministic_authority !== AK_AUTHORITY ||
    boundary.apply_boundary !== APPLY_BOUNDARY ||
    boundary.dspy_dspx_role !== "proposal_and_empirical_evaluation_only"
  ) {
    throw new Error(`direction-controller ${label} authority boundary drifted`);
  }
}

async function runAkJson(
  exec: DirectionControllerExec,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<JsonRecord> {
  if (signal?.aborted) throw new Error("direction-controller readback cancelled");
  const result = await exec("ak", args, {
    cwd,
    signal,
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (signal?.aborted || result.killed) throw new Error("direction-controller readback cancelled");
  if (result.code !== 0) {
    const reason = (result.stderr || result.stdout || "unknown error").trim().slice(0, 1000);
    throw new Error(`ak ${args.slice(0, 2).join(" ")} failed (${result.code}): ${reason}`);
  }
  try {
    return record(JSON.parse(result.stdout), args[1] || "output");
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`ak ${args.slice(0, 2).join(" ")} did not emit JSON`);
    }
    throw error;
  }
}

export async function readDirectionController(options: {
  repo: string;
  intent: string;
  exec: DirectionControllerExec;
  signal?: AbortSignal;
}): Promise<DirectionControllerReadback> {
  const requestedRepo = path.resolve(options.repo);
  const intent = options.intent.trim();
  if (!intent) throw new Error("direction-controller intent is required");

  const status = await runAkJson(
    options.exec,
    ["direction-controller", "status", "--repo", requestedRepo, "-F", "json"],
    requestedRepo,
    options.signal,
  );
  if (
    status.surface !== "ak.direction_controller.status" ||
    status.schema_version !== 1 ||
    status.read_only !== true
  ) {
    throw new Error("direction-controller status contract drifted");
  }
  validateAuthorityBoundary(status.authority_boundary, "status");
  const livePosition = record(status.live_position, "status.live_position");
  const canonicalRepo = nonEmptyString(livePosition.repo, "status.live_position.repo");
  record(status.state_vector, "status.state_vector");

  const proposal = await runAkJson(
    options.exec,
    ["direction-controller", "propose", "--repo", requestedRepo, "--intent", intent, "-F", "json"],
    requestedRepo,
    options.signal,
  );
  if (
    proposal.surface !== "ak.direction_controller.propose" ||
    proposal.schema_version !== 1 ||
    proposal.read_only !== true ||
    proposal.apply_performed !== false ||
    proposal.repo !== canonicalRepo ||
    proposal.intent !== intent ||
    proposal.proposal_role !== "advisory_input_only" ||
    proposal.generated_by !== "deterministic_ak_direction_controller_dry_run"
  ) {
    throw new Error("direction-controller proposal contract drifted");
  }
  validateAuthorityBoundary(proposal.authority_boundary, "proposal");
  const transition = nonEmptyString(proposal.transition, "proposal.transition");

  const transitionCheck = await runAkJson(
    options.exec,
    [
      "direction-controller",
      "transition-check",
      "--repo",
      requestedRepo,
      "--transition",
      transition,
      "-F",
      "json",
    ],
    requestedRepo,
    options.signal,
  );
  if (
    transitionCheck.surface !== "ak.direction_controller.transition_check" ||
    transitionCheck.schema_version !== 1 ||
    transitionCheck.read_only !== true ||
    transitionCheck.repo !== canonicalRepo ||
    transitionCheck.requested_transition !== transition
  ) {
    throw new Error("direction-controller transition-check contract drifted");
  }
  validateAuthorityBoundary(transitionCheck.authority_boundary, "transition-check");
  if (
    typeof transitionCheck.legal !== "boolean" ||
    typeof transitionCheck.generated_program_dispatch_ready !== "boolean" ||
    transitionCheck.apply_performed === true ||
    transitionCheck.dispatch_performed === true ||
    transitionCheck.authorization_granted === true
  ) {
    throw new Error("direction-controller transition-check authority fields drifted");
  }
  const availability = nonEmptyString(
    transitionCheck.availability,
    "transition-check.availability",
  );
  if (transitionCheck.legal !== availability.startsWith("legal")) {
    throw new Error("direction-controller transition-check legality is inconsistent");
  }
  const programAvailability = nonEmptyString(
    transitionCheck.program_availability,
    "transition-check.program_availability",
  );
  if (
    transitionCheck.generated_program_dispatch_ready === true &&
    programAvailability.includes("missing")
  ) {
    throw new Error("direction-controller generated-program readiness is inconsistent");
  }
  const missingPreconditions = stringArray(
    transitionCheck.missing_preconditions,
    "transition-check.missing_preconditions",
  );
  if (transitionCheck.legal === true && missingPreconditions.length > 0) {
    throw new Error("direction-controller legal transition carries missing preconditions");
  }
  stringArray(transitionCheck.allowed_mutations, "transition-check.allowed_mutations");
  const nextSafeCommand = safeNextCommand(transitionCheck.next_safe_command);

  const strategicFrame = livePosition.strategic_frame;
  const implementationWave = livePosition.implementation_wave;
  const executionTask = livePosition.execution_task;
  const nonAuthorizations = exactStringSet(
    transitionCheck.non_authorizations,
    REQUIRED_NON_AUTHORIZATIONS,
    "transition-check.non_authorizations",
  );

  return {
    schema_version: "pi.direction_controller.readback.v1",
    read_only: true,
    repo: canonicalRepo,
    intent,
    derived_state: nonEmptyString(status.derived_state, "status.derived_state"),
    strategic_frame:
      strategicFrame && typeof strategicFrame === "object" && !Array.isArray(strategicFrame)
        ? typeof (strategicFrame as JsonRecord).key === "string"
          ? ((strategicFrame as JsonRecord).key as string)
          : null
        : null,
    implementation_wave:
      implementationWave &&
      typeof implementationWave === "object" &&
      !Array.isArray(implementationWave)
        ? typeof (implementationWave as JsonRecord).key === "string"
          ? ((implementationWave as JsonRecord).key as string)
          : null
        : null,
    execution_task:
      executionTask && typeof executionTask === "object" && !Array.isArray(executionTask)
        ? typeof (executionTask as JsonRecord).id === "number"
          ? ((executionTask as JsonRecord).id as number)
          : null
        : null,
    proposed_transition: transition,
    availability,
    legal: transitionCheck.legal,
    program_availability: programAvailability,
    generated_program_dispatch_ready: transitionCheck.generated_program_dispatch_ready,
    generated_program_attempted: false,
    dspx_execution_claimed: false,
    dispatch_performed: false,
    apply_performed: false,
    authorization_granted: false,
    missing_preconditions: missingPreconditions,
    next_safe_command: nextSafeCommand,
    non_authorizations: nonAuthorizations,
    source_surfaces: {
      status: "ak.direction_controller.status",
      proposal: "ak.direction_controller.propose",
      transition_check: "ak.direction_controller.transition_check",
    },
  };
}

export function formatDirectionControllerReadback(readback: DirectionControllerReadback): string {
  const programPosture = readback.generated_program_dispatch_ready
    ? `${readback.program_availability}; dispatch-ready but not invoked by this read-only adapter`
    : `${readback.program_availability}; dispatch unavailable`;
  return [
    "# Direction-to-execution controller readback",
    "",
    `- repo: ${readback.repo}`,
    `- derived_state: ${readback.derived_state}`,
    `- strategic_frame: ${readback.strategic_frame ?? "none"}`,
    `- implementation_wave: ${readback.implementation_wave ?? "none"}`,
    `- execution_task: ${readback.execution_task ?? "none"}`,
    `- proposed_transition: ${readback.proposed_transition}`,
    `- availability: ${readback.availability}`,
    `- legal: ${readback.legal}`,
    `- generated_program: ${programPosture}`,
    "- DSPx execution attempted: false",
    "- dispatch performed: false",
    "- apply performed: false",
    "- authorization granted: false",
    ...(readback.missing_preconditions.length
      ? [
          "",
          "## Missing preconditions",
          ...readback.missing_preconditions.map((item) => `- ${item}`),
        ]
      : []),
    "",
    `Next safe command: ${readback.next_safe_command ?? "none"}`,
    "",
    "AK remains legality authority. This readback does not claim DSPx execution, select policy, create work, dispatch an owner route, or apply a transition.",
  ].join("\n");
}

export function registerDirectionControllerReadbackTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "direction_controller_readback",
    label: "Direction Controller Readback",
    description:
      "Read the existing AK direction-to-execution state machine through status, proposal, and transition-check controls. This tool is read-only, does not invoke DSPx, and reports generated-program readiness without claiming execution.",
    promptSnippet: "Inspect the existing AK direction-to-execution controller without mutation.",
    promptGuidelines: [
      "Use direction_controller_readback when direction-to-execution needs current AK state, a proposed transition, or generated-program readiness.",
      "Treat direction_controller_readback output as read-only AK verification context; it does not authorize transition apply, owner dispatch, task creation, or DSPx execution.",
    ],
    parameters: Type.Object({
      repo: Type.Optional(
        Type.String({
          description: "Target registered repository path (defaults to current cwd).",
        }),
      ),
      intent: Type.String({
        description: "Operator intent to map through AK direction-controller.",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const input = params as { repo?: string; intent: string };
      const readback = await readDirectionController({
        repo: input.repo?.trim() || ctx.cwd,
        intent: input.intent,
        exec: (command, args, execOptions) => pi.exec(command, args, execOptions),
        signal,
      });
      return {
        content: [{ type: "text", text: formatDirectionControllerReadback(readback) }],
        details: { ok: true, readback },
      };
    },
    renderCall(args, theme) {
      const input = args as { repo?: string; intent?: string };
      return new Text(
        theme.fg("toolTitle", theme.bold("direction_controller_readback ")) +
          theme.fg("muted", input.repo || "cwd") +
          theme.fg("dim", ` — ${(input.intent || "").slice(0, 40)}`),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as { readback?: DirectionControllerReadback } | undefined;
      const readback = details?.readback;
      if (!readback) {
        const content = result.content[0];
        return new Text(content?.type === "text" ? content.text.slice(0, 200) : "", 0, 0);
      }
      const color = readback.legal ? "success" : "warning";
      return new Text(
        theme.fg(color, readback.proposed_transition) +
          theme.fg("dim", ` — ${readback.availability} — no apply`),
        0,
        0,
      );
    },
  });
}
