/**
 * @param {((payload: Record<string, unknown>) => void)|undefined} telemetry
 * @param {Record<string, unknown>} payload
 */
export function emitTelemetry(telemetry, payload) {
  if (typeof telemetry !== "function") return;

  try {
    telemetry({ timestamp: new Date().toISOString(), ...payload });
  } catch (_error) {
    // Best-effort telemetry; never block interaction flow.
  }
}
