import { prepareTemplateForExecutionCompat } from "./templatePreparationCompat.js";
import type { PreparedTemplateSuccess, Template } from "./vaultTypes.js";

export interface RoutePromptShape {
  outputHeading: "Output:" | "Output format:";
  reasoningLabel: string;
  includeInvokeStep: boolean;
}

export function buildRoutePrompt(
  metaContent: string,
  context: string,
  options: RoutePromptShape,
): string {
  const commandLine = options.includeInvokeStep ? "COMMAND: /vault:[tool]\n" : "";
  return `${metaContent}

---

## ROUTING REQUEST

Analyze this situation and determine:
1. Which PHASE this is in
2. Which FORMALIZATION level (0-4)
3. Which cognitive tool(s) to apply
${options.includeInvokeStep ? "4. The command to invoke\n" : ""}Context: ${context}

${options.outputHeading}
${options.outputHeading === "Output format:" ? "```\n" : ""}PHASE: [phase]
LEVEL: [0-4]
TOOLS: [tool1, tool2]
${commandLine}REASONING: [${options.reasoningLabel}]
${options.outputHeading === "Output format:" ? "```\n" : ""}`;
}

export function getRoutePromptShapeForChannel(channel: string): RoutePromptShape | null {
  if (channel === "input-transform") {
    return {
      outputHeading: "Output format:",
      reasoningLabel: "why these tools",
      includeInvokeStep: true,
    };
  }
  if (channel === "slash-command") {
    return {
      outputHeading: "Output:",
      reasoningLabel: "why",
      includeInvokeStep: false,
    };
  }
  return null;
}

export function prepareRoutePrompt(
  metaTemplate: Template,
  options: {
    context: string;
    currentCompany: string;
    shape: RoutePromptShape;
  },
): { ok: true; prompt: string; prepared: PreparedTemplateSuccess } | { ok: false; error: string } {
  const prepared = prepareTemplateForExecutionCompat(metaTemplate.content, {
    context: options.context,
    currentCompany: options.currentCompany,
    templateName: metaTemplate.name,
    appendContextSection: false,
    allowLegacyPiVarsAutoDetect: false,
  });
  if (!prepared.ok) {
    return {
      ok: false,
      error: prepared.error,
    };
  }

  return {
    ok: true,
    prepared,
    prompt: buildRoutePrompt(prepared.prepared, options.context, options.shape),
  };
}
