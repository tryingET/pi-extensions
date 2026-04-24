/**
 * Non-live registration guard for future prompt-template command activation.
 *
 * This module does not make the package live. It provides fail-closed command
 * registration controls so a future cutover can prove no duplicate slash-command
 * ownership before replacing npm:pi-prompt-template-model.
 */
import { createPromptTemplateExecutionHandler } from "./command-runner.js";
import { buildPromptCommandDescription, loadPromptTemplates } from "./loader.js";

export function createPromptTemplateRegistrationState() {
  return {
    promptCommandsRegistered: false,
  };
}

function commandName(command) {
  const raw = command?.invocationName ?? command?.name ?? command;
  if (typeof raw !== "string") return undefined;
  return raw.startsWith("/") ? raw.slice(1) : raw;
}

function existingCommandNameSet(commands) {
  if (!Array.isArray(commands)) return undefined;
  return new Set(commands.map(commandName).filter(Boolean));
}

function promptNamesFromMap(prompts) {
  if (prompts instanceof Map) return [...prompts.keys()];
  if (Array.isArray(prompts)) return prompts.map((prompt) => prompt?.name).filter(Boolean);
  return [];
}

export function findPromptCommandCollisions(prompts, existingCommands) {
  const existingNames = existingCommandNameSet(existingCommands);
  if (!existingNames) return undefined;
  return promptNamesFromMap(prompts)
    .filter((name) => existingNames.has(name))
    .sort();
}

export function evaluatePromptTemplateRegistration(options = {}, state = {}) {
  if (options.enablePromptTemplateExecution !== true) {
    return {
      ok: false,
      reason: "disabled",
      message: "prompt-template command registration is disabled by default",
    };
  }

  if (state.promptCommandsRegistered) {
    return {
      ok: false,
      reason: "already_registered_by_this_package",
      message: "pi-prompt-template-execution already registered prompt commands in this runtime",
    };
  }

  if (options.loaderTestsPassed !== true) {
    return {
      ok: false,
      reason: "loader_tests_not_confirmed",
      message: "loader/execution-plan tests must be confirmed before live command registration",
    };
  }

  if (options.noDoubleRegistrationPreflight !== true) {
    return {
      ok: false,
      reason: "missing_no_double_registration_preflight",
      message: "no-double-registration preflight must be confirmed before command registration",
    };
  }

  const collisions = findPromptCommandCollisions(options.prompts, options.existingCommands);
  if (!collisions) {
    return {
      ok: false,
      reason: "unknown_existing_commands",
      message: "existing command list is unknown; provide an explicit command snapshot",
    };
  }

  if (collisions.length > 0) {
    return {
      ok: false,
      reason: "existing_command_collision",
      collisions,
      message: `refusing to register prompt command(s) already present: ${collisions.join(", ")}`,
    };
  }

  return {
    ok: true,
    commands: promptNamesFromMap(options.prompts).sort(),
    message: "prompt-template command registration preflight passed",
  };
}

export function buildPromptCommandRegistrationPlan(
  loadResult,
  existingCommands,
  options = {},
  state = {},
) {
  const prompts = loadResult?.prompts ?? new Map();
  const evaluation = evaluatePromptTemplateRegistration(
    {
      ...options,
      prompts,
      existingCommands,
    },
    state,
  );

  if (!evaluation.ok) {
    return {
      ...evaluation,
      diagnostics: loadResult?.diagnostics ?? [],
      commands: [],
    };
  }

  const commands = [...prompts.values()].map((prompt) => ({
    name: prompt.name,
    description: buildPromptCommandDescription(prompt),
    prompt,
  }));

  return {
    ...evaluation,
    diagnostics: loadResult?.diagnostics ?? [],
    commands,
  };
}

function resolveExistingCommands(pi, options) {
  if (Array.isArray(options.existingCommands)) return options.existingCommands;
  if (typeof options.getExistingCommands === "function") return options.getExistingCommands();
  if (typeof pi?.getCommands === "function") return pi.getCommands();
  return undefined;
}

export function registerPromptTemplateCommands(
  pi,
  options = {},
  state = createPromptTemplateRegistrationState(),
) {
  const load = options.loadPromptTemplates ?? loadPromptTemplates;
  const loadResult = options.loadResult ?? load({ cwd: options.cwd });
  const existingCommands = resolveExistingCommands(pi, options);
  const plan = buildPromptCommandRegistrationPlan(loadResult, existingCommands, options, state);
  if (!plan.ok) return plan;

  const handler = options.handler ?? createPromptTemplateExecutionHandler(pi, options);
  for (const command of plan.commands) {
    pi.registerCommand(command.name, {
      description: command.description,
      handler: async (args, ctx) => {
        if (typeof handler !== "function") {
          ctx?.ui?.notify?.(
            `Prompt-template execution handler is not configured for /${command.name}.`,
            "error",
          );
          return;
        }
        return handler(command.prompt, args, ctx);
      },
    });
  }

  state.promptCommandsRegistered = true;
  return plan;
}

export function createPromptTemplateExecutionExtension(options = {}) {
  const state = options.state ?? createPromptTemplateRegistrationState();
  return function promptTemplateExecutionExtension(pi) {
    return registerPromptTemplateCommands(pi, options, state);
  };
}
