// UI-only API seam. Does not test/implement the independently owned control backend.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./subagent-control.ts")
      return { url: "asc-ui-test:cancel", shortCircuit: true };
    if (specifier === "./subagent-cockpit-data.ts") {
      return { url: "asc-ui-test:cockpit-data", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "asc-ui-test:cancel")
      return {
        format: "module",
        shortCircuit: true,
        source: `
      export function cancelSubagentDispatch(params) {
        globalThis.__ascUiCancelCalls?.push(params);
        return { ok: true, status: "cancel_requested", dispatchId: params.dispatchId, sessionName: params.expectedSessionName };
      }
    `,
      };
    if (url === "asc-ui-test:cockpit-data") {
      return {
        format: "module",
        shortCircuit: true,
        source: `
        export function readSubagentCockpit(sessionsDir, sessionName, options) {
          globalThis.__ascUiReadCalls?.push({ sessionsDir, sessionName, options });
          const snapshot = globalThis.__ascUiReadSnapshots?.get(sessionName);
          if (snapshot) return snapshot;
          throw new Error("UI tests must inject a snapshot source");
        }
        export function requestSubagentSteering(params) {
          globalThis.__ascUiSteeringCalls?.push(params);
          return { ok: true, status: "queued", requestId: "test-request" };
        }
      `,
      };
    }
    return nextLoad(url, context);
  },
});
