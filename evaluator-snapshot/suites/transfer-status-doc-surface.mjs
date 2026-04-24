import {
  assertIncludes,
  finish,
  parseSelfHostingSuiteArgs,
  readCandidateFile,
} from "../lib/source-assert.mjs";

const { candidateCwd, controllerCwd } = parseSelfHostingSuiteArgs();
const currentVsTarget = readCandidateFile(
  candidateCwd,
  "packages/pi-autoresearch/docs/project/current-vs-target.md",
);

assertIncludes(currentVsTarget, "`autoresearch_self_hosting_run`", "current-vs-target");
assertIncludes(currentVsTarget, "start_and_watch", "current-vs-target");
assertIncludes(currentVsTarget, "hidden background daemon", "current-vs-target");
assertIncludes(currentVsTarget, "still no package-local self-promotion", "current-vs-target");

finish({
  suite: "transfer-status-doc-surface",
  candidateCwd,
  controllerCwd,
  checked: [
    "status note mentions the self-hosting public seam",
    "status note records start_and_watch",
    "status note preserves no hidden background daemon wording",
    "status note preserves no package-local self-promotion wording",
  ],
});
