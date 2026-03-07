import { readFile } from "node:fs/promises";
import { buildTransformedCommand } from "./buildTransformedCommand.js";
import { inferContextArgs } from "./inferContextArgs.js";
import { mapArgsByUsage } from "./mapArgsByUsage.js";
import { parseRawCommand, RawCommandParseError } from "./parseRawCommand.js";
import { parseTemplatePlaceholders } from "./parseTemplatePlaceholders.js";
import { parseTemplateArgHints } from "./parseTemplateArgHints.js";
import { resolvePromptTemplate } from "./resolvePromptTemplate.js";
import { resolveTemplatePolicy } from "./ptxPolicyConfig.js";

/**
 * Build a deterministic transform plan for a raw slash command.
 */
export async function planPromptTemplateTransform({ pi, ctx, rawText, policyConfig }) {
  let parsed;
  try {
    parsed = parseRawCommand(rawText);
  } catch (error) {
    if (error instanceof RawCommandParseError) {
      return { status: "parse-error", error };
    }
    throw error;
  }

  if (!parsed) {
    return { status: "not-slash-command" };
  }

  const templateCommand = resolvePromptTemplate(pi.getCommands(), parsed.commandName);
  if (!templateCommand) {
    return {
      status: "non-template-command",
      parsed,
    };
  }

  const policy = resolveTemplatePolicy(parsed.commandName, policyConfig);
  if (!policy.allowed) {
    return {
      status: "policy-blocked",
      parsed,
      templateCommand,
      policy,
    };
  }

  if (!templateCommand.path) {
    return {
      status: "template-path-missing",
      parsed,
      templateCommand,
      policy,
    };
  }

  let templateText;
  try {
    templateText = await readFile(templateCommand.path, "utf8");
  } catch (error) {
    return {
      status: "template-read-error",
      parsed,
      templateCommand,
      policy,
      error,
    };
  }

  const usage = parseTemplatePlaceholders(templateText);
  const hints = parseTemplateArgHints(templateText);
  const inferred = await inferContextArgs({
    pi,
    ctx,
    providedArgs: parsed.args,
  });

  const mappedArgs = mapArgsByUsage(parsed.args, inferred, usage, hints);
  const transformed = buildTransformedCommand(parsed.commandName, mappedArgs);

  return {
    status: "ok",
    parsed,
    templateCommand,
    policy,
    usage,
    hints,
    inferred,
    mappedArgs,
    transformed,
  };
}
