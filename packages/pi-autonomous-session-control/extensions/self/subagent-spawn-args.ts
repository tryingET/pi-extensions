import { fileURLToPath } from "node:url";
import type { SubagentState } from "./subagent-session.ts";
import { getSubagentSessionFile } from "./subagent-spawn-status.ts";
import type { SubagentDef } from "./subagent-spawn-types.ts";

const SUBAGENT_PROTOCOL_HELPER_PATH = fileURLToPath(
  new URL("./subagent-pi-json-filter.ts", import.meta.url),
);

export function createSubagentProtocolArgs(params: {
  def: SubagentDef;
  model: string;
  cwd: string;
  state: SubagentState;
}): string[] {
  const args = [
    SUBAGENT_PROTOCOL_HELPER_PATH,
    "--cwd",
    params.cwd || process.cwd(),
    "--model",
    params.model,
    "--tools",
    params.def.tools,
    "--thinking",
    params.def.thinking || "off",
    "--session-file",
    getSubagentSessionFile(params.def, params.state),
    "--objective",
    params.def.objective,
  ];

  for (const extensionSource of params.def.extensionSources ?? []) {
    if (typeof extensionSource === "string" && extensionSource.trim().length > 0) {
      args.push("--extension", extensionSource);
    }
  }

  if (params.def.noSkills) {
    args.push("--no-skills", "true");
  }

  for (const skillSource of params.def.skillSources ?? []) {
    if (typeof skillSource === "string" && skillSource.trim().length > 0) {
      args.push("--skill", skillSource);
    }
  }

  if (params.def.systemPrompt) {
    args.push("--system-prompt", params.def.systemPrompt);
  }

  return args;
}
