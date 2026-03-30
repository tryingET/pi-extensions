const DEBUG_COMMAND = "/ptx-debug-commands [query]";

export function isNoPromptTemplateAvailabilityReason(reason) {
  return (
    reason === "prompt-command-source-unavailable" ||
    reason === "no-prompt-templates" ||
    reason === "no-prefillable-prompt-templates"
  );
}

export function formatNoPromptTemplateAvailabilityWarning(reason) {
  switch (reason) {
    case "prompt-command-source-unavailable":
      return "No prompt templates available (prompt-command-source-unavailable). PTX could not inspect any commands from pi.getCommands(); confirm prompt-template discovery is enabled for this session (avoid '--no-prompt-templates'), then reload.";
    case "no-prompt-templates":
      return `No prompt templates available (no-prompt-templates). PTX can see commands, but none are prompt-template commands in this session. Verify the expected templates are loaded, then use '${DEBUG_COMMAND}' in a UI session to inspect visible prompt commands and paths.`;
    case "no-prefillable-prompt-templates":
      return `No prompt templates available (no-prefillable-prompt-templates). Prompt commands are visible, but none expose a usable template path for PTX prefill. Use '${DEBUG_COMMAND}' in a UI session to inspect path/status drift.`;
    default:
      return reason ? `No prompt templates available (${reason}).` : "No prompt templates available.";
  }
}

export function formatNoPromptTemplateSelectionWarning(reason) {
  if (isNoPromptTemplateAvailabilityReason(reason)) {
    return formatNoPromptTemplateAvailabilityWarning(reason);
  }

  return reason ? `No prompt template selected (${reason}).` : "No prompt template selected.";
}
