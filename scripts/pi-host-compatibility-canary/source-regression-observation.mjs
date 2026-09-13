// SOURCE OBSERVATION, not reviewed/admitted binary or source qualification.
// The normal-CI caller trusts its repo and current Node. No manifest is rewritten.
import path from "node:path";
import { COPIED, PARENT_ONLY, OBSERVATION_KIND, assertSupportedNode, canonicalPath,
  digest, regularBytes, transformBytes, verifyFixtureNode, verifySource } from "./completion-fixture-closure.mjs";
export function observeSourceRegression(source) {
  assertSupportedNode(process.version); // refuse before source reads or scratch effects
  const observedNode = { identityBasis: OBSERVATION_KIND, version: process.version,
    path: canonicalPath(process.execPath), sha256: digest(regularBytes(process.execPath)) };
  const OBSERVATION = { schemaVersion: 1, purpose: "source_regression", observationKind: OBSERVATION_KIND,
    trust: "Observed source-regression identity; copy consistency only, NOT independent qualification approval",
    observedNode, copied: {}, parentOnly: {},
    rootWrapper: { file: "../pi-host-compatibility-canary.test.mjs" } };
  for (const file of COPIED) {
    const bytes = regularBytes(path.join(source, file));
    OBSERVATION.copied[file] = { sha256: digest(bytes), destinationSha256: digest(transformBytes(file, bytes)),
      transform: ["host-lifecycle.mjs", "recovery.mjs"].includes(file) ? "deny-lifecycle-import-once" : "identity" };
  }
  for (const file of PARENT_ONLY) OBSERVATION.parentOnly[file] = digest(regularBytes(path.join(source, file)));
  OBSERVATION.rootWrapper.sha256 = digest(regularBytes(path.resolve(source, OBSERVATION.rootWrapper.file)));
  verifySource(source, OBSERVATION);
  verifyFixtureNode(OBSERVATION);
  return OBSERVATION;
}
