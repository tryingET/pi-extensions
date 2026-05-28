import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  LITTLE_HELPERS_CAPABILITY_MANIFEST,
  LITTLE_HELPERS_PEER_TOOL_NAMES,
} from "./capabilityManifest.ts";

export const PEER_SPAWN_TOOL_NAMES = LITTLE_HELPERS_PEER_TOOL_NAMES;
export const PEER_SPAWN_CAPABILITY_MANIFEST = LITTLE_HELPERS_CAPABILITY_MANIFEST;

export interface ToolboxBundleRegistrationContext {
  profile?: string;
  requestedTools?: string[];
}

export function registerToolboxBundle(
  pi: ExtensionAPI,
  _context: ToolboxBundleRegistrationContext = {},
): void {
  createSidequestExtension({ registerCommands: false, registerTools: true })(pi);
}

export default registerToolboxBundle;
