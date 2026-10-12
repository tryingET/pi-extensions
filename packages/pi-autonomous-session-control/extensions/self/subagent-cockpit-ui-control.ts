// Shared outcome vocabulary and inert display text; no dashboard overlay or controls.
import { stripTerminalSequences } from "@earendil-works/pi-tui";

export const COCKPIT_FILTERS = [
  "all",
  "running",
  "done",
  "error",
  "timeout",
  "aborted",
  "abandoned",
] as const;
export type CockpitFilter = (typeof COCKPIT_FILTERS)[number];

// Local artifact text is data, never terminal instructions or Markdown commands.
export function cockpitText(value: string, limit = 4000): string {
  return stripTerminalSequences(value.slice(0, limit)).replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: explicitly exclude terminal control bytes.
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    "",
  );
}
