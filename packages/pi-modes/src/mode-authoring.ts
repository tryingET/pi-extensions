import { MODE_SCHEMA_VERSION, type ModeDefinition, type ModeScope } from "./modes.ts";

export function parseScopedArguments(args: string): {
  scope: Exclude<ModeScope, "builtin">;
  rest: string;
} {
  const values = args.trim().split(/\s+/).filter(Boolean);
  const project = values[0] === "--project";
  if (project) values.shift();
  return { scope: project ? "project" : "global", rest: values.join(" ") };
}

export function modeTemplate(key: string): ModeDefinition {
  return {
    schemaVersion: MODE_SCHEMA_VERSION,
    key,
    label: key
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
      .join(" "),
    description: "Describe when this mode should be used.",
    promptStrategy: "replace_base",
    systemPrompt: "Define the complete static base system prompt for this mode.",
  };
}
