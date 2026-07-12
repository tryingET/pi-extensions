/**
 * summary: "registers executable prompt-template commands and restores deferred session state on Pi lifecycle hooks."
 * read_when:
 *   - "changing live prompt command registration, host dispatch, or deferred restore hook handling."
 */
import {
  executePromptTemplateCommand,
  restorePromptTemplateSessionState,
} from "../src/command-runner.js";
import { createPiPromptTemplateHostAdapter } from "../src/host-adapter.js";
import {
  createPromptTemplateRegistrationState,
  registerPromptTemplateCommands,
} from "../src/registration.js";

function commandName(command) {
  const raw = command?.invocationName ?? command?.name ?? command;
  if (typeof raw !== "string") return undefined;
  return raw.startsWith("/") ? raw.slice(1) : raw;
}

function executionCommandSnapshot(commands) {
  if (!Array.isArray(commands)) return [];
  return commands.filter((command) => {
    const source = command?.source;
    if (source === "prompt" || source === "skill") return false;
    return Boolean(commandName(command));
  });
}

export default function promptTemplateExecutionExtension(pi) {
  const state = createPromptTemplateRegistrationState();
  let pendingRestore;

  async function runPrompt(prompt, args, ctx) {
    const host = createPiPromptTemplateHostAdapter(pi, ctx);
    const result = await executePromptTemplateCommand(prompt, args, ctx, host, {
      restoreTiming: "agent_settled",
    });
    if (result?.deferredRestore) pendingRestore = result.deferredRestore;
    return result;
  }

  pi.on("session_start", async (_event, ctx) => {
    const plan = registerPromptTemplateCommands(
      pi,
      {
        cwd: ctx.cwd,
        enablePromptTemplateExecution: true,
        loaderTestsPassed: true,
        noDoubleRegistrationPreflight: true,
        getExistingCommands: () => executionCommandSnapshot(pi.getCommands()),
        handler: runPrompt,
      },
      state,
    );

    if (!plan.ok) {
      ctx.ui?.notify?.(
        `prompt-template-execution registration skipped: ${plan.message}`,
        "warning",
      );
      return;
    }

    ctx.ui?.notify?.(
      `prompt-template-execution registered ${plan.commands.length} prompt command(s)`,
      "info",
    );
  });

  pi.on("agent_settled", async (_event, ctx) => {
    const restore = pendingRestore;
    pendingRestore = undefined;
    if (!restore) return;
    const host = createPiPromptTemplateHostAdapter(pi, ctx);
    await restorePromptTemplateSessionState(restore, ctx, host);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const restore = pendingRestore;
    pendingRestore = undefined;
    if (!restore) return;
    const host = createPiPromptTemplateHostAdapter(pi, ctx);
    await restorePromptTemplateSessionState(restore, ctx, host);
  });
}
