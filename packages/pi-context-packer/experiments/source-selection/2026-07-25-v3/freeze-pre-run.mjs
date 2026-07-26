#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

import {
  CHECKSUMS,
  PRE_REVIEW_ALLOWED_PATHS,
  PRE_REVIEW_CHECKSUMS,
  PRE_RUN_ALLOWED_PATHS,
  PRE_RUN_REVIEW,
  RESULT,
} from "./experiment-config.mjs";
import { exists, fail, rawDigest, stableJson } from "./experiment-runtime.mjs";
import { createChecksumManifest } from "./preparation-artifacts.mjs";
import { verifyManifest } from "./run-ranking.mjs";

if (await exists(CHECKSUMS)) fail(`refusing existing final checksum manifest: ${CHECKSUMS}`);
if (await exists(RESULT)) fail(`ranking result must remain absent: ${RESULT}`);
await verifyManifest(PRE_REVIEW_CHECKSUMS, PRE_REVIEW_ALLOWED_PATHS);
const review = await readFile(PRE_RUN_REVIEW, "utf8");
if (!review.includes("Decision: **ACCEPT**") || !review.includes("rankingExecuted: false")) {
  fail("pre-run review must explicitly ACCEPT while rankingExecuted is false");
}
const manifest = await createChecksumManifest(PRE_RUN_ALLOWED_PATHS);
await writeFile(CHECKSUMS, manifest, { flag: "wx", mode: 0o644 });
process.stdout.write(
  stableJson({
    status: "final-pre-run-manifest-frozen",
    entries: PRE_RUN_ALLOWED_PATHS.length,
    sha256: rawDigest(manifest),
    rankingExecuted: false,
    resultAbsent: true,
  }),
);
