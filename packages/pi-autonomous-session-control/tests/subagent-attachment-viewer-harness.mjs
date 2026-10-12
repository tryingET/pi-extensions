// Registry/control API seam only. Real installed native Editor/Markdown/Container renderers below.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "./subagent-attachment-registry.ts" &&
      context.parentURL?.endsWith("subagent-attachment-viewer.ts")
    ) {
      return { url: "asc-viewer-test:registry", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url !== "asc-viewer-test:registry") return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: `
      export function readAttachmentTicket() { return globalThis.__viewerTicket; }
      export async function acknowledgeAttachmentWithRetry(path, options) {
        if (!globalThis.__viewerEditorInstalled) throw new Error('ACK before editor input handler');
        await globalThis.__viewerBootstrapGate;
        options.signal.throwIfAborted();
        globalThis.__viewerAcks++;
        return globalThis.__viewerTicket;
      }
      export function attachmentViewerStillBound() { return globalThis.__viewerBound && globalThis.__viewerAcks > 0; }
      export function publishAttachmentViewerSafety(ticket, value) {
        if (!globalThis.__viewerBound || !globalThis.__viewerAcks || globalThis.__viewerSafetyBusy) return false;
        globalThis.__viewerSafetySnapshots.push(structuredClone(value));
        return true;
      }
      export function detachAttachment() { globalThis.__viewerDetaches++; }
    `,
    };
  },
});
