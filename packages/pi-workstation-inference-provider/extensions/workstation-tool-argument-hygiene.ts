/**
summary: "Repairs wrapping newlines that the vLLM qwen3 XML tool parser leaks into tool arguments before the tool executes."
read_when:
  - "Tool calls from a workstation-inference model fail with ENOENT on a path that looks correct."
  - "Changing which tool parameters are safe to normalize."
*/
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Why this exists.
 *
 * The canonical baseline lane serves with `--tool-call-parser qwen3_coder`. That parser
 * (`vllm/parser/qwen3.py`) reads `<parameter=NAME>VALUE</parameter>` and then calls
 * `_trim_wrapping_newlines`, which strips exactly ONE leading and ONE trailing newline —
 * the pair the chat template itself emits. Any additional newline the model produces
 * survives into the argument value.
 *
 * The result is a *valid* string that is silently wrong: `read` receives
 * `"/path/to/AGENTS.md\n"`, fails ENOENT, the model retries the same call, and the
 * session livelocks. One observed run burned 21 identical calls over 456 s that way.
 *
 * Pi validates tool arguments before `beforeToolCall` fires, so this hook only ever sees
 * schema-valid input. That is exactly the right scope: a call with missing arguments
 * already fails loudly with a validation error the model recovers from, while this
 * corruption passes validation and needs repairing here.
 */

/**
 * Parameters whose values are paths, patterns or commands, where a wrapping line break is
 * parser residue rather than content.
 *
 * Deliberately excluded: `write.content` and `edit.edits[].oldText` / `newText`. Leading and
 * trailing newlines are meaningful there — `edit` matches `oldText` exactly against the file,
 * so trimming it would turn a silent parser bug into a silent edit bug.
 */
const TRIMMABLE_PARAMETERS: Readonly<Record<string, readonly string[]>> = {
  bash: ["command"],
  powershell: ["command"],
  read: ["path"],
  write: ["path"],
  edit: ["path"],
  grep: ["pattern", "path", "glob"],
  find: ["pattern", "path"],
  ls: ["path"],
};

export interface ToolArgumentRepair {
  readonly tool: string;
  readonly parameter: string;
  readonly before: string;
  readonly after: string;
}

/** Strip leading and trailing line breaks only. Interior content is never touched. */
function stripWrappingNewlines(value: string): string {
  return value.replace(/^[\r\n]+/, "").replace(/[\r\n]+$/, "");
}

/**
 * Repair `input` in place. Returns one entry per parameter that was changed.
 *
 * A repair that would empty the value is skipped: a whitespace-only argument is a real
 * model error and should reach the tool so it fails visibly rather than being papered over.
 */
export function repairToolArguments(
  toolName: string,
  input: Record<string, unknown>,
): ToolArgumentRepair[] {
  const parameters = TRIMMABLE_PARAMETERS[toolName];
  if (!parameters) {
    return [];
  }

  const repairs: ToolArgumentRepair[] = [];
  for (const parameter of parameters) {
    const value = input[parameter];
    if (typeof value !== "string") {
      continue;
    }
    const after = stripWrappingNewlines(value);
    if (after === value || after.length === 0) {
      continue;
    }
    input[parameter] = after;
    repairs.push({ tool: toolName, parameter, before: value, after });
  }
  return repairs;
}

export function describeRepairs(repairs: readonly ToolArgumentRepair[]): string {
  const parameters = repairs.map((repair) => `${repair.tool}.${repair.parameter}`).join(", ");
  return `Trimmed parser-leaked newlines from ${parameters}`;
}

/**
 * Register the hook. `onRepair` is optional and lets the caller decide how to surface a
 * repair; a normal session stays silent, and wiring a reporter turns this into a live
 * measurement of how often the lane corrupts arguments.
 */
export function registerToolArgumentHygiene(
  pi: ExtensionAPI,
  options: { readonly onRepair?: (repairs: readonly ToolArgumentRepair[]) => void } = {},
): void {
  pi.on("tool_call", (event) => {
    const repairs = repairToolArguments(event.toolName, event.input as Record<string, unknown>);
    if (repairs.length > 0) {
      options.onRepair?.(repairs);
    }
    return undefined;
  });
}
