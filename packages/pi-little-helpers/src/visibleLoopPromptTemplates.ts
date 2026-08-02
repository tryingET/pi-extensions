// summary: expands visible-loop prompt templates and renders delegated commit and completion checkpoints.
// read_when:
//   - changing prompt expansion, delegation, or completion; default queue text lives in visibleLoopPromptDefaults.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  renderSelfEvolutionCandidateCloseoutTemplate,
  type SelfEvolutionExecutionEnvelope,
} from "./selfEvolutionEnvelope.ts";
import { DEFAULT_LOOP_VALIDATION_CONTRACT_PROMPT } from "./visibleLoopPromptDefaults.ts";
import type { VisibleLoopExecutionBinding } from "./visibleLoopTypes.ts";

const VISIBLE_LOOP_COMMIT_DELEGATION_TIMEOUT_SECONDS = 30 * 60;

export * from "./visibleLoopPromptDefaults.ts";

export function bindVisibleLoopExecutionPrompt(
  prompt: string,
  binding: VisibleLoopExecutionBinding,
): string {
  const bindingText =
    binding.mode === "ak_task"
      ? `AK task #${binding.taskId}`
      : binding.mode === "self_evolution_candidate"
        ? `self-evolution candidate ${binding.candidateId}`
        : `operator objective ${JSON.stringify(binding.objective)}`;
  return [
    "EXECUTION BINDING — FAIL CLOSED",
    `This loop is bound to ${bindingText}.`,
    "Verify that binding against the owning repo/runtime before mutation. The binding fixes the slice; it does not grant missing owner authority, expand task scope, or make session text canonical.",
    "If the binding is missing, stale, completed, ambiguous, outside the repo, or blocked on an owner/decision gate, stop before implementation. Do not select an adjacent slice, execute later queued review/fixup/posture/commit prompts, or signal loop completion.",
    "Every queued turn remains inside this same binding. Deep review and Nexus may harden the bound implementation only; they must not choose product direction or create a replacement task.",
    "Do not place secrets in loop objectives or reports; the binding is persisted in local loop state.",
    "",
    prompt,
  ].join("\n");
}

interface VisibleLoopPromptTemplate {
  name: string;
  content: string;
}

export interface VisibleLoopPromptExpansion {
  ok: boolean;
  prompt: string;
  templateName?: string;
  error?: string;
}

export interface VisibleLoopCommitDelegationPromptInput {
  commitPrompt: string;
  configPath: string;
  cwd: string;
  runId: string;
  iteration: number;
  promptIndex: number;
  commandName?: string;
  title?: string;
  selfEvolutionEnvelope?: SelfEvolutionExecutionEnvelope;
}

export interface VisibleLoopCommitDelegationDispatchRequest {
  profile: "minimal";
  name: string;
  objective: string;
  tools: "read,bash";
  timeout: number;
  prompt_name: string;
  prompt_tags: string[];
  prompt_source: "pi-little-helpers";
}

export function createVisibleLoopCommitDelegationDispatchRequest(
  input: VisibleLoopCommitDelegationPromptInput,
): VisibleLoopCommitDelegationDispatchRequest {
  const loopCommandName = normalizeLoopCommandName(input.commandName);
  return {
    profile: "minimal",
    name: normalizeDelegatedCommitSubagentName(input.runId, input.iteration),
    objective: renderVisibleLoopCommitObjective(input),
    tools: "read,bash",
    timeout: VISIBLE_LOOP_COMMIT_DELEGATION_TIMEOUT_SECONDS,
    prompt_name: `${loopCommandName}-commit-delegation`,
    prompt_tags: [loopCommandName, "visible-loop", "commit-delegation"],
    prompt_source: "pi-little-helpers",
  };
}

export function renderVisibleLoopCommitDelegationPrompt(
  input: VisibleLoopCommitDelegationPromptInput,
): string {
  const loopCommandName = normalizeLoopCommandName(input.commandName);
  const loopTitle = normalizeLoopTitle(input.title, loopCommandName);
  const dispatchRequest = createVisibleLoopCommitDelegationDispatchRequest(input);

  return [
    `${loopTitle} commit delegation step.`,
    "",
    "Do not run the commit workflow in this loop child session.",
    "The configured `/commit` prompt has already been resolved through visible-loop prompt expansion. Do not send a literal `/commit` slash command to the delegated worker.",
    "",
    "Call `dispatch_subagent` exactly once with this request:",
    "The generated request uses a finite 30-minute execution timeout. Do not rewrite it to `timeout: 0`, add `allowUnlimited`, or require host-level unlimited-timeout policy.",
    "",
    "```json",
    JSON.stringify(dispatchRequest, null, 2),
    "```",
    "",
    "After `dispatch_subagent` returns, inspect its result:",
    "1. If the subagent reports successful commit workflow completion, call `visible_loop_child_complete` exactly once with:",
    "",
    "```json",
    JSON.stringify(
      {
        configPath: input.configPath,
        iteration: input.iteration,
        ...(input.selfEvolutionEnvelope
          ? {
              candidateCloseout: renderSelfEvolutionCandidateCloseoutTemplate(
                input.selfEvolutionEnvelope,
              ),
            }
          : {}),
      },
      null,
      2,
    ),
    "```",
    "",
    ...(input.selfEvolutionEnvelope
      ? [
          "Replace each candidateCloseout placeholder truthfully. Evidence refs must be host-correlatable: a successful package-check bash toolCallId for reflection, an ordered ASC live-proof ledger runId for liveRuntimeProof, or the exact canonical owner-artifact path for promotion. Free-form claims and invented IDs fail closed.",
        ]
      : []),
    "2. If dispatch fails, times out, aborts, or reports a blocker, stop and report the exact dispatch identity and status. Do not mark the loop iteration complete and do not retry or re-dispatch within the same iteration.",
    "3. Unless the result explicitly proves `confirmed_no_effects`, treat commit, index, worktree, provenance-note, validation-process, and child-process effects as indeterminate. Require controller/operator reconciliation before any fresh loop run.",
    "",
    "The ordinary completion checkpoint is intentionally not queued for this delegated commit step; this tool call is the completion gate.",
    "",
    `Context: delegated commit prompt for iteration ${input.iteration}, prompt index ${input.promptIndex}.`,
  ].join("\n");
}

function renderVisibleLoopCommitObjective(input: {
  commitPrompt: string;
  cwd: string;
  runId: string;
  iteration: number;
  commandName?: string;
  title?: string;
}): string {
  const loopCommandName = normalizeLoopCommandName(input.commandName);
  const loopTitle = normalizeLoopTitle(input.title, loopCommandName);
  return [
    `${loopTitle} delegated commit workflow.`,
    "",
    "Context:",
    `- cwd: ${input.cwd}`,
    `- ${loopCommandName} run id: ${input.runId}`,
    `- iteration: ${input.iteration}`,
    "",
    "Run the resolved commit prompt below in the current repo.",
    "Do not perform new implementation work or broaden scope; this delegation is only for commit workflow completion.",
    "Use the repo loop validation guidance below when selecting validation commands for the commit workflow.",
    "",
    DEFAULT_LOOP_VALIDATION_CONTRACT_PROMPT,
    "",
    "If validation, staging, grouping, or provenance-note handling is ambiguous, stop and report the blocker without committing further.",
    "",
    "Success contract for the final response:",
    "- List created commit sha(s) and subjects, or say clean/no-op if no commit was needed.",
    "- State validation commands run and results.",
    "- State provenance-note status when applicable.",
    "",
    "Resolved /commit prompt:",
    "```md",
    input.commitPrompt,
    "```",
  ].join("\n");
}

function normalizeLoopCommandName(value: string | undefined): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "visible-loop"
  );
}

function normalizeLoopTitle(value: string | undefined, commandName: string): string {
  if (value?.trim()) return value.trim();
  return commandName
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function normalizeDelegatedCommitSubagentName(runId: string, iteration: number): string {
  const normalizedRunId = runId
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${normalizedRunId || "visible-loop"}-commit-${iteration}`;
}

export function renderVisibleLoopCompletionPrompt(input: {
  configPath: string;
  iteration: number;
  promptCount: number;
  productPosturePath?: string;
  productPostureExists?: boolean;
  visionPath?: string;
  visionExists?: boolean;
  selfEvolutionEnvelope?: SelfEvolutionExecutionEnvelope;
}): string {
  const postureLines = input.productPosturePath
    ? [
        `Launch-recorded product-posture target: ${JSON.stringify(input.productPosturePath)} (${input.productPostureExists ? "exists" : "missing at launch"}).`,
        ...(input.visionPath
          ? [
              `Launch-recorded vision target: ${JSON.stringify(input.visionPath)} (${input.visionExists ? "exists" : "missing at launch"}).`,
            ]
          : []),
        "If implementation routed to a different owning package or surface, an earlier product-posture refresh prompt or the delegated commit verification must have named and refreshed that corrected posture target before completion.",
      ]
    : [];
  const candidateCloseoutLines = input.selfEvolutionEnvelope
    ? [
        "This is a candidate-bound loop. The completion tool also requires candidateCloseout:",
        JSON.stringify(
          renderSelfEvolutionCandidateCloseoutTemplate(input.selfEvolutionEnvelope),
          null,
          2,
        ),
        "Replace each placeholder truthfully. Evidence refs must be host-correlatable: a successful package-check bash toolCallId for reflection, an ordered ASC live-proof ledger runId for liveRuntimeProof, or the exact canonical owner-artifact path for promotion. Free-form claims and invented IDs fail closed.",
      ]
    : [];
  return [
    "Visible-loop internal completion checkpoint.",
    "All real prompts for this iteration have now been delivered as prior follow-up turns.",
    "Do not do new implementation, review, or planning work in this checkpoint turn.",
    "If and only if the immediately previous real prompt turn is complete, call the `visible_loop_child_complete` tool with exactly:",
    `- configPath: ${JSON.stringify(input.configPath)}`,
    `- iteration: ${input.iteration}`,
    ...candidateCloseoutLines,
    "Do not call the tool before the previous prompt turn is complete.",
    "Do not call the tool if any configured product-posture refresh or /commit prompt failed, stopped for clarification, or left validation/commit incomplete.",
    ...postureLines,
    `Context: this checkpoint follows ${input.promptCount} real prompt(s) in the current visible-loop iteration.`,
  ].join("\n");
}

export function expandVisibleLoopPromptTemplate(
  prompt: string,
  cwd: string,
): VisibleLoopPromptExpansion {
  const templateName = getVisibleLoopSlashTemplateName(prompt);
  if (!templateName) return { ok: true, prompt };
  const resolved = resolveVisibleLoopPromptTemplate(prompt, cwd);
  if (!resolved) {
    return {
      ok: false,
      prompt,
      templateName,
      error: `prompt template /${templateName} is not available to visible-loop expansion`,
    };
  }
  return { ok: true, prompt: resolved.content, templateName: resolved.name };
}

export function listMissingVisibleLoopPromptTemplates(
  prompts: readonly string[],
  cwd: string,
): string[] {
  const templates = loadVisibleLoopPromptTemplates(cwd);
  const templateNames = new Set(templates.map((template) => template.name));
  return uniqueStrings(
    prompts
      .map((prompt) => getVisibleLoopSlashTemplateName(prompt))
      .filter((name): name is string => name !== null)
      .filter((name) => !templateNames.has(name)),
  );
}

function resolveVisibleLoopPromptTemplate(
  prompt: string,
  cwd: string,
): { name: string; content: string } | null {
  const templateName = getVisibleLoopSlashTemplateName(prompt);
  if (!templateName) return null;
  const templates = loadVisibleLoopPromptTemplates(cwd);
  if (templates.length === 0) return null;

  const spaceIndex = prompt.indexOf(" ");
  const argsString = spaceIndex === -1 ? "" : prompt.slice(spaceIndex + 1);
  const template = templates.find((candidate) => candidate.name === templateName);
  if (!template) return null;

  return {
    name: template.name,
    content: substituteVisibleLoopPromptArgs(
      template.content,
      parseVisibleLoopPromptArgs(argsString),
    ),
  };
}

function getVisibleLoopSlashTemplateName(prompt: string): string | null {
  if (!prompt.startsWith("/")) return null;
  const spaceIndex = prompt.indexOf(" ");
  const templateName = spaceIndex === -1 ? prompt.slice(1) : prompt.slice(1, spaceIndex);
  return templateName.trim() || null;
}

function loadVisibleLoopPromptTemplates(cwd: string): VisibleLoopPromptTemplate[] {
  // Extension-originated pi.sendUserMessage deliberately bypasses Pi command handling and
  // prompt-template expansion. The public extension API does not expose the active package,
  // settings, or CLI prompt-template list, so visible-loop performs the safe subset it can
  // resolve itself: the default project and global prompt directories documented by Pi.
  // Unresolved slash templates fail closed instead of being sent as misleading literal text.
  const dirs = [join(cwd, ".pi", "prompts"), join(homedir(), ".pi", "agent", "prompts")];
  const templates: VisibleLoopPromptTemplate[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    try {
      for (const entry of readdirSync(dir)) {
        if (!entry.endsWith(".md")) continue;
        const name = entry.replace(/\.md$/, "");
        if (seen.has(name)) continue;
        const path = join(dir, entry);
        const stats = statSync(path);
        if (!stats.isFile()) continue;
        seen.add(name);
        templates.push({
          name,
          content: stripVisibleLoopFrontmatter(readFileSync(path, "utf8")).trim(),
        });
      }
    } catch {
      // Prompt expansion is best-effort for ordinary visible-loop prompts.
    }
  }
  return templates;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function stripVisibleLoopFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---\n", 4);
  return end === -1 ? content : content.slice(end + "\n---\n".length);
}

function parseVisibleLoopPromptArgs(argsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of argsString) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) args.push(current);
  return args;
}

function substituteVisibleLoopPromptArgs(content: string, args: string[]): string {
  let result = content;
  result = result.replace(/\$(\d+)/g, (_, num) => args[Number.parseInt(num, 10) - 1] ?? "");
  result = result.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_, startStr, lengthStr) => {
    const start = Math.max(0, Number.parseInt(startStr, 10) - 1);
    if (lengthStr) return args.slice(start, start + Number.parseInt(lengthStr, 10)).join(" ");
    return args.slice(start).join(" ");
  });
  const allArgs = args.join(" ");
  result = result.replace(/\$ARGUMENTS/g, allArgs);
  result = result.replace(/\$@/g, allArgs);
  return result;
}
