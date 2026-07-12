#!/usr/bin/env node
// summary: Tests the slash resume review UI, exact foreground call transfer, and plan-only boundaries.
// read_when:
//   - Changing /autoresearch resume editor content, confirmation prompts, or composer behavior.
// Slash resume review dogfood contract.
// Exercises the package extension command surface for /autoresearch resume against an isolated
// resumable runtime snapshot. It opens no real editor and runs no foreground resume executor.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionUrl = pathToFileURL(path.join(packageRoot, "extensions/pi-autoresearch.ts")).href;
const runtimeUrl = pathToFileURL(path.join(packageRoot, "src/runtime.ts")).href;
const strictDefault = process.env.DOGFOOD_CONTRACT_STRICT ?? "1";

const runnerSource = `
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { registerPiAutoresearchExtension } from ${JSON.stringify(extensionUrl)};
import {
  buildAutoresearchRuntimeStatus,
  executeAutoresearchSetup,
} from ${JSON.stringify(runtimeUrl)};

const providedCwd = process.env.PI_AUTORESEARCH_RESUME_UI_DOGFOOD_CWD;
const cwd = providedCwd
  ? path.resolve(providedCwd)
  : mkdtempSync(path.join(os.tmpdir(), "autoresearch-resume-ui-dogfood-"));
const shouldCleanup = !providedCwd;
const blockers = [];
const commands = new Map();
const tools = new Map();
const eventHandlers = new Map();
const toolInvocations = [];
let editorTitle = "";
let editorText = "";
let composerText = "";
const notifications = [];

try {
  registerPiAutoresearchExtension({
    registerCommand(name, command) {
      commands.set(name, command);
    },
    registerTool(tool) {
      const originalExecute = tool.execute;
      tools.set(tool.name, {
        ...tool,
        async execute(...args) {
          toolInvocations.push(tool.name);
          return originalExecute.apply(tool, args);
        },
      });
    },
    on(event, handler) {
      eventHandlers.set(event, handler);
    },
  });

  await executeAutoresearchSetup({
    cwd,
    action: "baseline",
    reconfigure: true,
    name: "resume-ui-dogfood",
    metricName: "unresolved_resume_ui_blockers",
    metricUnit: "count",
    direction: "lower",
    metricThreshold: 0,
    benchmarkCommand: "printf 'METRIC unresolved_resume_ui_blockers=0\\n'",
    checksCommand: "printf 'resume ui checks ok\\n'",
    description: "Prepare a reusable runtime snapshot for slash resume review dogfood.",
    timeoutSeconds: 30,
    checksTimeoutSeconds: 30,
  });
  buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

  const command = commands.get("autoresearch");
  if (!command?.handler) {
    blockers.push("autoresearch_command_not_registered");
  } else {
    await command.handler("resume", {
      cwd,
      hasUI: true,
      ui: {
        async editor(title, text) {
          editorTitle = String(title ?? "");
          editorText = String(text ?? "");
          return editorText;
        },
        setEditorText(text) {
          composerText = String(text ?? "");
        },
        notify(message, level) {
          notifications.push({ message: String(message ?? ""), level: String(level ?? "") });
        },
      },
    });
  }

  if (!/foreground autoresearch resume/i.test(editorTitle)) {
    blockers.push("missing_foreground_resume_editor_title");
  }
  if (!/PI-AUTORESEARCH RESUME APPLY REVIEW/u.test(editorText)) {
    blockers.push("missing_resume_apply_review_heading");
  }
  if (!editorText.includes("autoresearch.resume_apply_plan.v1")) {
    blockers.push("missing_resume_apply_plan_packet");
  }
  if (!editorText.includes("autoresearch_runtime_resume_apply")) {
    blockers.push("missing_resume_apply_executor_call");
  }
  if (!editorText.includes('operatorConfirmation: "RUN FOREGROUND RESUME"')) {
    blockers.push("missing_exact_resume_confirmation");
  }
  if (!/segmentKey: "[^"]+"/u.test(editorText)) {
    blockers.push("missing_concrete_segment_key");
  }
  if (!/runtimeKey: "[^"]+"/u.test(editorText)) {
    blockers.push("missing_concrete_runtime_key");
  }
  if (!editorText.includes("- plan ready: yes")) {
    blockers.push("resume_apply_plan_not_ready");
  }
  if (!editorText.includes("- execution authorized: no")) {
    blockers.push("resume_apply_plan_authorized_too_early");
  }
  if (editorText.includes("- foreground apply call: (blocked)")) {
    blockers.push("foreground_apply_call_blocked");
  }
  const budgetPrompt = "Replace " + String.fromCharCode(96) + "<explicit>" + String.fromCharCode(96) + " budgets";
  if (!editorText.includes(budgetPrompt)) {
    blockers.push("missing_budget_placeholder_review_prompt");
  }
  for (const phrase of [
    "does not run benchmarks",
    "spawn peers",
    "mutate candidates",
    "external evidence",
    "no daemon",
    "peer launch",
    "candidate lifecycle mutation",
    "external evidence/learning write",
  ]) {
    if (!editorText.includes(phrase)) blockers.push("missing_boundary_phrase:" + phrase);
  }
  if (toolInvocations.length > 0) {
    blockers.push("unexpected_tool_invocations:" + toolInvocations.join(","));
  }
  if (composerText === editorText) {
    blockers.push("full_resume_review_transferred_to_message_editor");
  }
  if (!composerText.startsWith("autoresearch_runtime_resume_apply(")) {
    blockers.push("message_editor_missing_exact_resume_call");
  }
  if (/PI-AUTORESEARCH RESUME APPLY REVIEW/u.test(composerText)) {
    blockers.push("message_editor_contains_review_markdown");
  }
  if (!composerText.includes('operatorConfirmation: "RUN FOREGROUND RESUME"')) {
    blockers.push("message_editor_missing_exact_resume_confirmation");
  }
  if (
    notifications.length !== 1 ||
    !/Accepted foreground resume call into the message editor/u.test(notifications[0]?.message ?? "")
  ) {
    blockers.push("missing_resume_call_notification");
  }
} catch (error) {
  blockers.push("exception:" + (error instanceof Error ? error.message : String(error)));
} finally {
  if (shouldCleanup) rmSync(cwd, { recursive: true, force: true });
}

const ok = blockers.length === 0;
console.log(
  "CONTRACT " +
    (ok ? "ok" : "fail") +
    " resume-slash-review: /autoresearch resume prepared the foreground resume review",
);
console.log(
  "CONTRACT " +
    (ok ? "ok" : "fail") +
    " resume-slash-boundary: review kept execution plan-only with exact confirmation and budgets",
);
console.log("METRIC unresolved_resume_ui_blockers=" + blockers.length);
console.log(
  JSON.stringify(
    {
      blockers,
      cwd,
      editorTitle,
      editorHasResumeApplyPlan: editorText.includes("autoresearch.resume_apply_plan.v1"),
      editorHasExecutor: editorText.includes("autoresearch_runtime_resume_apply"),
      editorHasExactConfirmation: editorText.includes('operatorConfirmation: "RUN FOREGROUND RESUME"'),
      editorHasConcreteKeys:
        /segmentKey: "[^"]+"/u.test(editorText) && /runtimeKey: "[^"]+"/u.test(editorText),
      editorHasBudgetPlaceholders: editorText.includes(
        "Replace " + String.fromCharCode(96) + "<explicit>" + String.fromCharCode(96) + " budgets",
      ),
      composerTextMatchesEditorText: composerText === editorText,
      composerHasOnlyResumeCall: composerText.startsWith("autoresearch_runtime_resume_apply("),
      composerHasReviewMarkdown: /PI-AUTORESEARCH RESUME APPLY REVIEW/u.test(composerText),
      toolInvocationCount: toolInvocations.length,
      toolInvocations,
      notificationCount: notifications.length,
      notification: notifications[0] ?? null,
    },
    null,
    2,
  ),
);

if (process.env.DOGFOOD_CONTRACT_STRICT !== "0" && blockers.length > 0) {
  process.exitCode = 1;
}
`;

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--input-type=module", "--eval", runnerSource],
  {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, DOGFOOD_CONTRACT_STRICT: strictDefault },
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? (result.error ? 1 : 0);
