// Private controller/rendering protocol ONLY. Pi publisher/broker message envelopes are unchanged.
export const PANEL_PROTOCOL = 2;
/** Fatal readiness/event gate, even for unverified development overrides. No view or command
 * may be sent to an incompatible child, and a late ready cannot undo the rejection.
 * @param {import("node:child_process").ChildProcessWithoutNullStreams & {_protocolError?: string}} child
 * @param {{protocol?: unknown}} event
 * @param {{state?: string; error?: string | null}} status @param {() => void} revoke */
export function admitPanelEvent(child, event, status, revoke) {
  if (child._protocolError) return false;
  if (event.protocol === PANEL_PROTOCOL) return true;
  child._protocolError =
    "Native panel private protocol mismatch: expected " +
    PANEL_PROTOCOL +
    ", received " +
    String(event.protocol) +
    ". Rebuild/use a matching controller and panel.";
  revoke();
  status.state = "error";
  status.error = child._protocolError;
  child.stdin.end();
  child.kill("SIGTERM");
  return false;
}
