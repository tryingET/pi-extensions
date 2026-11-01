// ---
// summary: "owns one oracle-regression evidence directory and retains explicit or failed runs"
// read_when:
//   - "changing oracle regression artifact retention or successful-run cleanup"
// ---

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Only this freshly allocated directory is eligible for automatic cleanup. The suite calls
 * finish after all scenarios and synchronous, single-process oracle workers have settled.
 * An explicit evidence parent or any scenario/artifact failure preserves the whole run.
 */
export function createOracleEvidence(
  directory = process.env.PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR,
) {
  const explicit = typeof directory === "string" && directory.length > 0;
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(explicit ? directory : os.tmpdir(), "oracle-regression-")),
  );
  const identity = fs.lstatSync(root);
  let failed = false;
  let removed = false;
  return {
    root,
    fail() {
      failed = true;
    },
    finish() {
      if (explicit || failed) return { retained: true, reason: explicit ? "explicit" : "failure" };
      if (removed) return { retained: false };
      const current = fs.lstatSync(root);
      if (
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        current.dev !== identity.dev ||
        current.ino !== identity.ino
      )
        throw new Error(`Oracle evidence identity changed; refusing cleanup: ${root}`);
      fs.rmSync(root, { recursive: true });
      removed = true;
      return { retained: false };
    },
  };
}
