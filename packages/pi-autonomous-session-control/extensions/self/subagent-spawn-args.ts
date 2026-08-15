import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { SubagentState } from "./subagent-session.ts";
import { getSubagentSessionFile } from "./subagent-spawn-status.ts";
import type { SubagentDef } from "./subagent-spawn-types.ts";

const CURRENT_SUBAGENT_PROTOCOL_HELPER = "subagent-pi-json-filter-v2";

export function resolveSubagentProtocolHelperPath(moduleUrl = import.meta.url): string {
  const modulePath = fileURLToPath(moduleUrl);
  const moduleDir = dirname(modulePath);
  if (modulePath.endsWith(".js")) {
    return join(moduleDir, `${CURRENT_SUBAGENT_PROTOCOL_HELPER}.js`);
  }
  if (moduleDir.includes(`${sep}node_modules${sep}`)) {
    return join(
      moduleDir,
      "..",
      "..",
      "dist",
      "extensions",
      "self",
      `${CURRENT_SUBAGENT_PROTOCOL_HELPER}.js`,
    );
  }
  return join(moduleDir, `${CURRENT_SUBAGENT_PROTOCOL_HELPER}.ts`);
}

const SUBAGENT_PROTOCOL_HELPER_PATH = resolveSubagentProtocolHelperPath();

export function createSubagentProtocolArgs(params: {
  def: SubagentDef;
  model: string;
  cwd: string;
  state: SubagentState;
  startupTimeoutMs: number;
  executionTimeoutMs: number;
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
    params.def.userPrompt || params.def.objective,
    "--startup-timeout-ms",
    String(params.startupTimeoutMs),
    "--execution-timeout-ms",
    String(params.executionTimeoutMs),
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
