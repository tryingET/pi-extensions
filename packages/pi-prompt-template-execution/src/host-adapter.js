/**
 * Pi host action adapter for non-live prompt-template execution tests.
 *
 * This module normalizes the Pi host APIs used by the command runner without
 * registering commands or owning any execution runtime beyond same-session
 * prompt dispatch.
 */

export class MissingPromptTemplateHostCapabilityError extends Error {
  constructor(capability) {
    super(`Prompt-template execution host does not expose ${capability}.`);
    this.name = "MissingPromptTemplateHostCapabilityError";
    this.capability = capability;
  }
}

function requireFunction(host, name, fallbackName) {
  const primary = host?.[name];
  if (typeof primary === "function") return primary.bind(host);
  const fallback = fallbackName ? host?.[fallbackName] : undefined;
  if (typeof fallback === "function") return fallback.bind(host);
  throw new MissingPromptTemplateHostCapabilityError(
    fallbackName ? `${name}/${fallbackName}` : name,
  );
}

function getUi(ctx) {
  return ctx?.hasUI === false ? undefined : ctx?.ui;
}

export function createPiPromptTemplateHostAdapter(pi, ctx = {}) {
  const queuedSkillMessages = [];
  return {
    get thinking() {
      if (typeof pi?.getThinkingLevel === "function") return pi.getThinkingLevel();
      if (Object.hasOwn(ctx ?? {}, "thinkingLevel")) return ctx.thinkingLevel;
      if (Object.hasOwn(ctx ?? {}, "thinking")) return ctx.thinking;
      return undefined;
    },
    async setModel(model) {
      return requireFunction(pi, "setModel")(model);
    },
    setThinking(thinking) {
      return requireFunction(pi, "setThinkingLevel", "setThinking")(thinking);
    },
    sendUserMessage(content) {
      return requireFunction(pi, "sendUserMessage")(content);
    },
    getCommands() {
      return typeof pi?.getCommands === "function" ? pi.getCommands() : [];
    },
    queueSkillMessage(message) {
      queuedSkillMessages.push(message);
      if (typeof pi?.queueSkillMessage === "function") return pi.queueSkillMessage(message);
      return message;
    },
    get queuedSkillMessages() {
      return queuedSkillMessages;
    },
    notify(message, level = "warning") {
      const ui = getUi(ctx);
      if (typeof ui?.notify === "function") ui.notify(message, level);
    },
  };
}
