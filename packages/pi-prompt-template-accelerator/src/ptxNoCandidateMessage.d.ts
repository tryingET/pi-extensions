// summary: "declares helpers for recognizing and formatting missing prompt-template outcomes"
// read_when:
//   - "changing typed no-candidate reason checks or warning formatter signatures"

export function isNoPromptTemplateAvailabilityReason(reason?: string): boolean;
export function formatNoPromptTemplateAvailabilityWarning(reason?: string): string;
export function formatNoPromptTemplateSelectionWarning(reason?: string): string;
