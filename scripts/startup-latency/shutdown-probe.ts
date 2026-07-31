import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function startupShutdownProbe(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => ctx.shutdown());
}
