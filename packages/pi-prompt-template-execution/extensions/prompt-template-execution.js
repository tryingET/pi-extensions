/**
 * summary: "registers executable prompt-template commands and restores deferred session state on Pi lifecycle hooks."
 * read_when:
 *   - "changing live prompt command registration, host dispatch, or deferred restore hook handling."
 */
import { createLivePromptRunner } from "../src/model-fallback.js";
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
  const runPrompt = createLivePromptRunner(pi);

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
}
