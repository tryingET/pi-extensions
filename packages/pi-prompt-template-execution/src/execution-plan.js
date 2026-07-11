/**
summary: "Selects a prompt model, renders model conditionals and arguments, and describes switch, restore, and send actions."
read_when:
  - "Changing inherited-model behavior, prompt rendering, thinking restoration, or execution-plan action ordering."
*/
import { selectModelCandidate } from "@tryinget/pi-model-selection";

import { substituteArgs } from "./args.js";
import { renderModelConditionals } from "./model-conditionals.js";

function sameModel(a, b) {
  if (!a || !b) return a === b;
  return a.provider === b.provider && a.id === b.id;
}

export { renderModelConditionals };

export function renderPromptForResolvedModel(prompt, args, model) {
  const conditionals = renderModelConditionals(prompt.content, model, prompt.name);
  const content = substituteArgs(conditionals.content, args);
  if (content.trim().length === 0) {
    return {
      empty: `Prompt \`${prompt.name}\` rendered to an empty message.`,
      warning: conditionals.error,
    };
  }
  return {
    content,
    warning: conditionals.error,
  };
}

export async function preparePromptExecutionPlan(
  prompt,
  args,
  currentModel,
  modelRegistry,
  options = {},
) {
  const selectedModel =
    prompt.models.length === 0
      ? (() => {
          const inheritedModel = Object.hasOwn(options, "inheritedModel")
            ? options.inheritedModel
            : currentModel;
          if (!inheritedModel) {
            return {
              message: `Prompt \`${prompt.name}\` has no \`model\` configured and there is no active session model to inherit.`,
            };
          }
          return {
            model: inheritedModel,
            alreadyActive: sameModel(currentModel, inheritedModel),
          };
        })()
      : await selectModelCandidate(prompt.models, currentModel, { modelRegistry });

  if (!selectedModel) return undefined;
  if ("message" in selectedModel) return selectedModel;

  const rendered = renderPromptForResolvedModel(prompt, args, selectedModel.model);
  if (rendered.empty) {
    return {
      message: rendered.empty,
      warning: rendered.warning,
    };
  }

  const shouldSwitchModel = !sameModel(currentModel, selectedModel.model);
  const restore = prompt.restore !== false;
  return {
    promptName: prompt.name,
    selectedModel,
    content: rendered.content ?? "",
    warning: rendered.warning,
    thinking: prompt.thinking,
    restore,
    actions: {
      switchModel: shouldSwitchModel
        ? {
            from: currentModel,
            to: selectedModel.model,
          }
        : undefined,
      restoreModel: restore && shouldSwitchModel ? currentModel : undefined,
      setThinking: prompt.thinking,
      restoreThinking: restore && prompt.thinking ? true : undefined,
      sendUserMessage: rendered.content ?? "",
    },
  };
}
