import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createSidequestExtension } from "../extensions/sidequest.ts";

export const PEER_SPAWN_TOOL_NAMES = [
  "fork_peer_spawn",
  "scout_peer_spawn",
  "candidate_peer_spawn",
] as const;

export interface ToolboxBundleRegistrationContext {
  profile?: string;
  requestedTools?: string[];
}

export function registerToolboxBundle(
  pi: ExtensionAPI,
  _context: ToolboxBundleRegistrationContext = {},
): void {
  createSidequestExtension()(pi);
}

export default registerToolboxBundle;
