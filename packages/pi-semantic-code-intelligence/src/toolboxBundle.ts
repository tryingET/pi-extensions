import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import registerSemanticCodeExtension from "../extensions/semantic-code-intelligence.ts";
import { SCI_COMPOSITE_TOOL_SPECS } from "./tool-definitions.ts";

interface ToolboxBundleContext {
  profile: string;
  requestedTools?: string[];
}

export const id = "sci";
export const version = 1;

export function registerToolboxBundle(
  pi: ExtensionAPI,
  context: ToolboxBundleContext = { profile: "read" },
) {
  registerSemanticCodeExtension(pi);
  const requested = new Set(context.requestedTools ?? []);
  return SCI_COMPOSITE_TOOL_SPECS.filter(
    (spec) =>
      (context.profile === "all" || spec.profile === context.profile) &&
      (requested.size === 0 || requested.has(spec.name)),
  ).map((spec) => ({
    name: spec.name,
    profile: spec.profile,
    risk: spec.profile === "read" ? "read" : "mutating",
  }));
}

export default registerToolboxBundle;
