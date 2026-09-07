#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

import {
  ATTEMPT_SENTINEL,
  CHECKSUMS,
  PRE_REVIEW_ALLOWED_PATHS,
  PRE_REVIEW_CHECKSUMS,
  PRE_RUN_ALLOWED_PATHS,
  PRE_RUN_REVIEW,
  RESULT,
} from "./experiment-config.mjs";
import { exists, fail, rawDigest, stableJson } from "./experiment-process.mjs";
import { createChecksumManifest, verifyChecksumManifest } from "./preparation-artifacts.mjs";

if (await exists(CHECKSUMS)) fail(`refusing existing final manifest: ${CHECKSUMS}`);
if ((await exists(ATTEMPT_SENTINEL)) || (await exists(RESULT))) {
  fail("attempt sentinel and result must be absent before final manifest freeze");
}
await verifyChecksumManifest(PRE_REVIEW_CHECKSUMS, PRE_REVIEW_ALLOWED_PATHS);
const review = await readFile(PRE_RUN_REVIEW, "utf8");
if (!review.includes("Decision: **ACCEPT**") || !review.includes("rankingExecuted: false")) {
  fail("pre-run review must explicitly accept while rankingExecuted is false");
}
const manifest = await createChecksumManifest(PRE_RUN_ALLOWED_PATHS);
await writeFile(CHECKSUMS, manifest, { flag: "wx", mode: 0o644 });
process.stdout.write(
  stableJson({
    status: "v4-final-pre-run-manifest-frozen",
    entries: PRE_RUN_ALLOWED_PATHS.length,
    sha256: rawDigest(manifest),
    rankingExecuted: false,
    attemptSentinelAbsent: true,
    resultAbsent: true,
  }),
);
