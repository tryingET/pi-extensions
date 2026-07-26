// summary: defines visible-loop prompt queues and safely expands slash templates and delegated commit checkpoints.
// read_when:
//   - changing default loop prompts, prompt-template resolution, commit delegation, or completion checkpoint text.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  renderSelfEvolutionCandidateCloseoutTemplate,
  type SelfEvolutionExecutionEnvelope,
} from "./selfEvolutionEnvelope.ts";
import type { VisibleLoopExecutionBinding } from "./visibleLoopTypes.ts";

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

const DEFAULT_PROMPT_VAULT_INSTRUCTIONS = [
  "Use Prompt Vault (`~/ai-society/core/prompt-vault`) like trigger folders.",
  "1) Select the single best-matching template for this task.",
  "- `vault_query(..., include_content:false)`",
  "2) Retrieve that template's full content.",
  "- `vault_retrieve(..., include_content:true)`",
  "3) Before executing it, check dispatch posture.",
  '- `vault_dispatch_check({ template_names: ["<name>"] })`',
  "- If posture is `text_ok`, execute it as written.",
  "- If posture requires orchestrator dispatch/gating, use that binding; do not bypass the gate with text-only interpretation.",
  "4) Execution means: inspect the current repo/state, apply the needed bounded fixes, run verification, and only then report. Do not stop after retrieving the template, quoting it, or filling its output format with a plan.",
  "5) If the template has an OUTPUT FORMAT, follow it exactly for the final answer, but make the fields reflect actual work performed, explicit deferrals, or hard blockers.",
  "6) Do not reference unretrieved frameworks.",
  "7) If vault is unavailable, continue best-effort and say so.",
  "Use as many frameworks as necessary, and as few as possible.",
  "Grounding (one line at end):",
  "`grounding: template=<name>, vault_status=<ok|unavailable>`",
].join("\n");

export const DEFAULT_LOOP_VALIDATION_CONTRACT_PROMPT = [
  "Repo loop validation guidance:",
  "- If this repo exposes a repo-owned loop validation contract or loop-* aliases, use the repo-declared invocation by phase instead of hardcoding repo-specific validation names.",
  "- Typical phases: `loop-doctor` for non-failing diagnostics; `loop-verify-fast` for focused inner-loop checks; `loop-impact-plan` to classify changed-file risk; `loop-impact-run` for bounded/expanded impact checks; `loop-impact-wide` for wide/full-required impact plans (include a concise reason if the repo command supports it); `loop-landing-check` for the repo-declared landing/readiness gate.",
  "- Run those phases through the form documented by the repo (`just loop-*`, `npm run loop-*`, or another repo-owned wrapper) rather than assuming bare commands are on PATH.",
  "- If a loop-* command is absent, use the closest repo-local equivalent and report the fallback.",
  "- Treat loop commands as repo-owned evidence-producing diagnostics/checks, not authority. Do not claim validation authority, merge approval, production activation, AK task closure, or semantic completion from these checks alone.",
].join("\n");

export const DEFAULT_IMPLEMENTATION_VERIFICATION_FOCUS_PROMPT = [
  "Verification expectation: after the implementation is complete, run the repo's normal focused validation for the touched slice.",
  "If the repo clearly documents loop-* aliases as its validation wrapper, use them at verification time only; do not start this turn by auditing validation plumbing unless implementation or verification is blocked by it.",
  "Keep the main work focus on the bounded implementation and its direct proof.",
].join("\n");

export const GOVERNED_DEEP_REVIEW_OBJECTIVE =
  "Perform the full governed adversarial deep review of the current implementation and repository state. Return ranked, evidence-backed findings for the next bounded Nexus fixup.";

export const DEFAULT_PRODUCT_POSTURE_REFRESH_PROMPT = [
  "Update the owning product-posture.md before loop completion.",
  "",
  "Default target: @docs/project/product-posture.md in the current cwd.",
  "If this loop routed implementation into a package/subdirectory, update that owning package's docs/project/product-posture.md instead; update root posture only when root routing/control-plane behavior changed.",
  "",
  "Use the actual implementation, validation, docs, and bugfixes from this iteration.",
  "Treat product-posture as the next-iteration frontier map, not a changelog.",
  "",
  "Make the smallest truthful update that records:",
  "- what product maturity changed;",
  "- what proof/validation now exists;",
  "- what main gap remains;",
  "- any authority/provenance/source-owner boundary that became clearer;",
  "- what the next highest-leverage slice should understand before choosing work.",
  "",
  "If the owning product-posture file is missing or cannot be updated truthfully, stop and report the blocker.",
  "Do not send/allow the visible-loop completion signal until the owning posture refresh is done.",
  "Do not commit yet.",
].join("\n");

export const GOVERNED_DEEP_REVIEW_PROMPT = [
  "Governed deep-review execution step.",
  "",
  "Call `vault_execute_template` exactly once with:",
  '- `template_name`: `"deep-review"`',
  `- \`objective\`: \`"${GOVERNED_DEEP_REVIEW_OBJECTIVE}"\``,
  "",
  "The tool must execute the Prompt Vault template through its verified workflow binding and return `details.ok=true`, `executionSurface=workflow_execute`, an exact Vault `handoffId`, and `status=done`.",
  "Do not use `vault_retrieve` content or a local `deep-review.md` file as execution.",
  "If the tool is unavailable, blocked, fails, times out, or returns any other status, report the blocker and stop. Do not proceed to Nexus fixup, posture refresh, commit, or loop completion.",
].join("\n");

export const DEFAULT_NEXUS_LOOP_PROMPTS = [
  GOVERNED_DEEP_REVIEW_PROMPT,
  [
    "proceed with nexus implementation until completion and verification",
    "",
    DEFAULT_IMPLEMENTATION_VERIFICATION_FOCUS_PROMPT,
  ].join("\n"),
  [
    "fix any bugs / code smells / gaps or tech-debt left with atomic-completion",
    "",
    DEFAULT_PROMPT_VAULT_INSTRUCTIONS,
  ].join("\n"),
  DEFAULT_PRODUCT_POSTURE_REFRESH_PROMPT,
  "/commit",
] as const;

export const DEFAULT_VISIBLE_LOOP_PROMPTS = [
  [
    "read @docs/project/vision.md and @docs/project/product-posture.md.",
    "Treat product-posture as an active work artifact: it should shape slice choice up front and be refreshed before completion, not treated as an optional changelog.",
    "If you route work from a monorepo root into a package, identify the owning package's docs/project/product-posture.md as the posture target before implementation.",
    "The visible-loop config records cwd-level product-posture/vision paths and launch-time existence flags; treat them as launch hints and correct them explicitly if package routing chooses a different owner.",
    "",
    "Use the explicit execution binding supplied by the loop as the fixed slice.",
    "Test that bound slice against current repo state before mutation; do not select a different or adjacent product slice.",
    "Reason from first principles and consider multi-order effects within the bound scope.",
    "",
    "Before implementation, produce a compact design membrane:",
    "",
    "1. CURRENT STATE",
    "- What exists now?",
    "- What is broken, missing, stale, misleading, or under-proven?",
    "- What evidence from files/tests/docs supports that?",
    "",
    "2. RECONSTRUCTED OBJECTIVE",
    "- What should actually be improved?",
    "- Why is this the highest-leverage next move?",
    "- Which product-posture file owns this loop's frontier update?",
    "- What would done mean in observable terms?",
    "",
    "3. OWNER / AUTHORITY BOUNDARIES",
    "- What does this package/repo own?",
    "- What must remain external?",
    "- What would authority drift look like?",
    "",
    "4. DOMAIN / DATA / STATE MODEL",
    "- What are the core entities and lifecycle states?",
    "- What inputs, outputs, files, DBs, tools, subprocesses, or generated artifacts are involved?",
    "- What is canonical truth vs projection/cache/receipt/packet?",
    "",
    "5. TRUST / SECURITY MODEL",
    "- Which inputs are caller-controlled or untrusted?",
    "- What paths/processes/network/DBs can be read or written?",
    "- What path escape, symlink, TOCTOU, size/time, permission, stale-state, injection, or secret-leak risks exist?",
    "- What must be redacted?",
    "- What must fail closed?",
    "",
    "6. UX / AX / DX CONTRACT",
    "- What should the operator see?",
    "- What should the agent see?",
    "- What wording could imply false authority, false provenance, or false completion?",
    "- What exact next actions should be obvious?",
    "",
    "7. FAILURE / ROLLBACK MODEL",
    "- What partial writes or artifacts can occur?",
    "- How are failures surfaced?",
    "- How is the change reverted?",
    "- What is the point of no return?",
    "",
    "8. ADVERSARIAL TEST PLAN",
    "- Name the negative/adversarial tests required before done.",
    "- Include malicious input, missing/stale state, wrong owner surface, path escape, symlink/TOCTOU, huge input, permission failure, misleading provenance, and rollback/partial-write cases when relevant.",
    "",
    "Do not implement until the design membrane is explicit.",
    "",
    "Then implement the bounded complete change that satisfies the membrane.",
    "Do not optimize for smallest diff. Optimize for bounded completeness:",
    "- broad enough to satisfy the design membrane;",
    "- narrow enough to avoid unrelated ownership drift;",
    "- complete enough that known bugs/gaps are not left to later;",
    "- structural enough to remove root causes when patching symptoms would compound debt.",
    "",
    "Verify with normal tests, adversarial/negative tests from the membrane, docs/artifact checks if behavior changed, and dogfooding where relevant.",
    "",
    DEFAULT_IMPLEMENTATION_VERIFICATION_FOCUS_PROMPT,
    "",
    "Proceed until completed and validated.",
  ].join("\n"),
  "proceed",
  "proceed",
  "proceed",
  GOVERNED_DEEP_REVIEW_PROMPT,
  [
    "proceed with nexus implementation until completion and verification",
    "",
    DEFAULT_IMPLEMENTATION_VERIFICATION_FOCUS_PROMPT,
  ].join("\n"),
  [
    "fix any bugs / code smells / gaps or tech-debt left with atomic-completion",
    "",
    DEFAULT_PROMPT_VAULT_INSTRUCTIONS,
  ].join("\n"),
  DEFAULT_PRODUCT_POSTURE_REFRESH_PROMPT,
  "/commit",
] as const;

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

export function renderVisibleLoopCommitDelegationPrompt(input: {
  commitPrompt: string;
  configPath: string;
  cwd: string;
  runId: string;
  iteration: number;
  promptIndex: number;
  commandName?: string;
  title?: string;
  selfEvolutionEnvelope?: SelfEvolutionExecutionEnvelope;
}): string {
  const loopCommandName = normalizeLoopCommandName(input.commandName);
  const loopTitle = normalizeLoopTitle(input.title, loopCommandName);
  const dispatchRequest = {
    profile: "minimal",
    name: normalizeDelegatedCommitSubagentName(input.runId, input.iteration),
    objective: renderVisibleLoopCommitObjective(input),
    tools: "read,bash",
    timeout: 0,
    prompt_name: `${loopCommandName}-commit-delegation`,
    prompt_tags: [loopCommandName, "visible-loop", "commit-delegation"],
    prompt_source: "pi-little-helpers",
  };

  return [
    `${loopTitle} commit delegation step.`,
    "",
    "Do not run the commit workflow in this loop child session.",
    "The configured `/commit` prompt has already been resolved through visible-loop prompt expansion. Do not send a literal `/commit` slash command to the delegated worker.",
    "",
    "Call `dispatch_subagent` exactly once with this request:",
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
    "2. If dispatch fails, times out, or reports a blocker/failure, stop and report that status. Do not mark the loop iteration complete.",
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
