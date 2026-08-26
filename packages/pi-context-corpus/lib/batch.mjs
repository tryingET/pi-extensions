// ---
// summary: "Optional batch orchestration: expand a session glob and shell out to the overlay replay to (re)produce strata.json artifacts."
// read_when:
//   - "Changing --sessions glob handling, replay spawning, or per-session output layout."
// ---
// The corpus never parses session JSONL itself. Replay is owned by
// pi-context-overlay/scripts/context-strata-replay.mjs; we only invoke it with an
// explicit --out under the corpus dir so nothing is written to system /tmp.

import { spawnSync } from "node:child_process";
import { existsSync, globSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

const stem = (name) => name.replace(/\.[^.]*$/, "");

/** Expand an operator-provided glob to a sorted, de-duplicated list of .jsonl session files. */
export function expandSessionGlob(pattern) {
  const matches = globSync(pattern).filter((file) => file.endsWith(".jsonl"));
  return [...new Set(matches)].sort();
}

/**
 * Run the replay script once per session file, writing each session's artifacts into
 * <corpusDir>/<session-stem>/. Honors TMPDIR: the replay --out is always explicit,
 * so the replay never falls back to its system tmp default.
 */
export function runBatch({ sessions, replayScript, corpusDir }) {
  if (!replayScript || !existsSync(replayScript)) {
    throw new Error(`replay script not found: ${replayScript}`);
  }
  const results = [];
  for (const session of sessions) {
    const id = stem(basename(session));
    const outDir = join(corpusDir, id);
    mkdirSync(outDir, { recursive: true });
    const result = spawnSync(process.execPath, [replayScript, session, "--out", outDir], {
      encoding: "utf8",
    });
    const ok = result.status === 0;
    results.push({
      id,
      // Measured provenance: the operator-given session path is the corpus's own
      // input, recorded verbatim (not inferred from the sessions directory layout).
      sourceSession: session,
      outDir,
      ok,
      error: ok
        ? null
        : ((result.stderr || result.stdout || "replay exited non-zero")
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .pop()
            ?.slice(0, 200) ?? "replay exited non-zero"),
    });
  }
  return results;
}
