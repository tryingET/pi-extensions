/**
 * Non-live prompt-template command runner.
 *
 * This module executes a prepared prompt against an injected host action surface.
 * It does not register slash commands and does not create subagent/loop runtime.
 */
import { preparePromptExecutionPlan } from "./execution-plan.js";
import { createPiPromptTemplateHostAdapter } from "./host-adapter.js";
import { loadPromptTemplates } from "./loader.js";
import { resolvePromptSkillMessage } from "./skills.js";

function notify(ctx, message, level = "warning", host = {}) {
  if (typeof host?.notify === "function") {
    host.notify(message, level);
    return;
  }
  if (typeof ctx?.ui?.notify === "function") ctx.ui.notify(message, level);
}

async function maybeCall(fn, ...args) {
  if (typeof fn !== "function") return undefined;
  return fn(...args);
}

function getHostAction(ctx, host, name) {
  return host?.[name] ?? ctx?.[name];
}

function getCurrentThinking(ctx, host) {
  if (typeof host?.getThinking === "function") return host.getThinking();
  if (Object.hasOwn(host ?? {}, "thinking")) return host.thinking;
  if (Object.hasOwn(ctx ?? {}, "thinking")) return ctx.thinking;
  if (Object.hasOwn(ctx ?? {}, "thinkingLevel")) return ctx.thinkingLevel;
  return undefined;
}

function modelRef(model) {
  return model ? `${model.provider}/${model.id}` : "<none>";
}

export async function restorePromptTemplateSessionState(deferredRestore, ctx, host = {}) {
  if (!deferredRestore) return { ok: true, restored: [] };
  const restored = [];
  const setModel = getHostAction(ctx, host, "setModel");
  const setThinking = getHostAction(ctx, host, "setThinking");

  if (Object.hasOwn(deferredRestore, "thinking") && typeof setThinking === "function") {
    await setThinking(deferredRestore.thinking ?? "off");
    restored.push("thinking");
  }
  if (deferredRestore.model && typeof setModel === "function") {
    const ok = await setModel(deferredRestore.model);
    if (ok === false) {
      notify(ctx, `Failed to restore model ${modelRef(deferredRestore.model)}`, "error", host);
      return { ok: false, reason: "model_restore_failed", restored };
    }
    restored.push("model");
  }

  return { ok: true, restored };
}

export async function executePromptTemplateCommand(prompt, args, ctx, host = {}, options = {}) {
  const currentModel = options.currentModel ?? ctx?.model;
  const modelRegistry = options.modelRegistry ?? ctx?.modelRegistry;
  const plan = await preparePromptExecutionPlan(prompt, args, currentModel, modelRegistry, options);

  if (!plan) {
    notify(ctx, `No available model from: ${prompt.models.join(", ")}`, "error", host);
    return { ok: false, reason: "no_available_model" };
  }
  if (plan.message) {
    if (plan.warning) notify(ctx, plan.warning, "warning", host);
    notify(ctx, plan.message, "error", host);
    return { ok: false, reason: "aborted", message: plan.message };
  }
  if (plan.warning) notify(ctx, plan.warning, "warning", host);

  const setModel = getHostAction(ctx, host, "setModel");
  const setThinking = getHostAction(ctx, host, "setThinking");
  const sendUserMessage = getHostAction(ctx, host, "sendUserMessage");
  const queueSkillMessage = getHostAction(ctx, host, "queueSkillMessage");
  const previousThinking = getCurrentThinking(ctx, host);
  const switchedModel = plan.actions.switchModel;
  const changedThinking = Boolean(plan.actions.setThinking && setThinking);
  const deferRestore =
    options.restoreTiming === "agent_settled" || options.restoreTiming === "deferred";
  let sent = false;
  const deferredRestore = {
    ...(plan.actions.restoreModel ? { model: plan.actions.restoreModel } : {}),
    ...(plan.restore && changedThinking ? { thinking: previousThinking ?? "off" } : {}),
  };

  try {
    if (switchedModel) {
      const switched = await maybeCall(setModel, switchedModel.to);
      if (switched === false) {
        notify(ctx, `Failed to switch to model ${modelRef(switchedModel.to)}`, "error", host);
        return { ok: false, reason: "model_switch_failed", plan };
      }
    }

    if (plan.actions.setThinking) {
      await maybeCall(setThinking, plan.actions.setThinking);
    }

    if (prompt.skill) {
      const commands =
        typeof host?.getCommands === "function" ? host.getCommands() : options.commands;
      const skillResolution = resolvePromptSkillMessage(prompt.skill, ctx?.cwd, {
        ...options.skillOptions,
        commands,
      });
      if (skillResolution.kind === "error") {
        notify(ctx, skillResolution.error, "error", host);
        return { ok: false, reason: "skill_not_found", message: skillResolution.error, plan };
      }
      if (skillResolution.kind === "ready") {
        if (typeof queueSkillMessage !== "function") {
          notify(
            ctx,
            "Prompt-template execution host does not expose queueSkillMessage.",
            "error",
            host,
          );
          return { ok: false, reason: "missing_skill_queue", plan };
        }
        await queueSkillMessage(skillResolution.message);
      }
    }

    if (typeof sendUserMessage !== "function") {
      notify(ctx, "Prompt-template execution host does not expose sendUserMessage.", "error", host);
      return { ok: false, reason: "missing_send_user_message", plan };
    }

    await sendUserMessage(plan.content);
    sent = true;
    return {
      ok: true,
      plan,
      ...(deferRestore && (deferredRestore.model || Object.hasOwn(deferredRestore, "thinking"))
        ? { deferredRestore }
        : {}),
    };
  } finally {
    if (!deferRestore || !sent) {
      if (plan.restore && changedThinking) {
        await maybeCall(setThinking, previousThinking ?? "off");
      }
      if (plan.actions.restoreModel) {
        await maybeCall(setModel, plan.actions.restoreModel);
      }
    }
  }
}

export function createPromptCommandHandler(options = {}) {
  const load = options.loadPromptTemplates ?? loadPromptTemplates;
  const execute = options.executePromptTemplateCommand ?? executePromptTemplateCommand;

  return async function promptCommandHandler(commandName, args, ctx, host = {}) {
    const loadResult = options.loadResult ?? load({ cwd: ctx?.cwd ?? process.cwd() });
    const prompt = loadResult.prompts.get(commandName);
    if (!prompt) {
      notify(ctx, `Prompt template /${commandName} was not found.`, "error", host);
      return { ok: false, reason: "prompt_not_found", diagnostics: loadResult.diagnostics ?? [] };
    }

    return execute(prompt, args, ctx, host, options);
  };
}

export function createPromptTemplateExecutionHandler(pi, options = {}) {
  return async function promptTemplateExecutionHandler(prompt, args, ctx) {
    const host = options.host ?? createPiPromptTemplateHostAdapter(pi, ctx);
    return executePromptTemplateCommand(prompt, args, ctx, host, options);
  };
}
