import { spawnSync } from "node:child_process";
import { normalize } from "./core.js";

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimOutput(value) {
  const text = normalize(value);
  if (!text) return "(empty)";
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

export function runFzfProbe() {
  const probeInput = "alpha\nbeta\ngamma\n";

  const interactive = spawnSync("fzf", [], {
    input: probeInput,
    encoding: "utf8",
    timeout: 1500,
  });

  const filtered = spawnSync("fzf", ["--filter", "be"], {
    input: probeInput,
    encoding: "utf8",
    timeout: 1500,
  });

  return {
    interactive: {
      status: interactive.status,
      signal: interactive.signal,
      stdout: trimOutput(interactive.stdout),
      stderr: trimOutput(interactive.stderr),
      error: interactive.error ? trimOutput(interactive.error.message) : undefined,
    },
    filter: {
      status: filtered.status,
      signal: filtered.signal,
      stdout: trimOutput(filtered.stdout),
      stderr: trimOutput(filtered.stderr),
      error: filtered.error ? trimOutput(filtered.error.message) : undefined,
    },
  };
}
