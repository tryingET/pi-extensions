// ---
// summary: "builds the Claude Code settings fragment that lets sessions publish live ribbon state"
// read_when:
//   - "changing which Claude Code hook events the ribbon subscribes to"
// ---

/**
 * Only low-frequency events are hooked. Tool, thinking and idle state already come from the
 * transcript at no cost, so nothing runs per tool call; hooks add exactly what the transcript
 * cannot express, which is that a session is blocked waiting for the operator.
 */
export const CLAUDE_HOOK_EVENTS = Object.freeze([
  "SessionStart",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SessionEnd",
]);

/**
 * @param {string} hookCommand absolute command Claude Code runs for each event
 * @returns {{hooks: Record<string, Array<{matcher: string; hooks: Array<{type: "command"; command: string}>}>>}}
 */
export function claudeHookSettings(hookCommand) {
  const command = String(hookCommand ?? "").trim();
  if (!command) throw new Error("A hook command is required.");
  /** @type {Record<string, Array<{matcher: string; hooks: Array<{type: "command"; command: string}>}>>} */
  const hooks = {};
  for (const event of CLAUDE_HOOK_EVENTS) {
    hooks[event] = [{ matcher: "", hooks: [{ type: "command", command }] }];
  }
  return { hooks };
}

/**
 * Merge the ribbon's hooks into existing settings without disturbing unrelated configuration or
 * duplicating an entry that already runs this exact command.
 * @param {Record<string, any>} settings
 * @param {string} hookCommand
 */
export function mergeClaudeHookSettings(settings, hookCommand) {
  const desired = claudeHookSettings(hookCommand);
  const merged = { ...(settings ?? {}) };
  const existingHooks = { ...(merged.hooks ?? {}) };
  for (const [event, entries] of Object.entries(desired.hooks)) {
    const current = Array.isArray(existingHooks[event]) ? [...existingHooks[event]] : [];
    const alreadyPresent = current.some((entry) =>
      (entry?.hooks ?? []).some(
        /** @param {any} hook */ (hook) => String(hook?.command ?? "") === hookCommand,
      ),
    );
    existingHooks[event] = alreadyPresent ? current : [...current, ...entries];
  }
  merged.hooks = existingHooks;
  return merged;
}
