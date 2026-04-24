import {
  assertIncludes,
  finish,
  parseSelfHostingSuiteArgs,
  readCandidateFile,
} from "../lib/source-assert.mjs";

const { candidateCwd, controllerCwd } = parseSelfHostingSuiteArgs();
const runtimeSource = readCandidateFile(
  candidateCwd,
  "packages/pi-autoresearch/src/core/runtime.ts",
);

assertIncludes(runtimeSource, "AUTORESEARCH_SELF_HOSTING_TOOL_NAME", "runtime source");
assertIncludes(runtimeSource, "action=start_and_watch", "runtime source");
assertIncludes(runtimeSource, "public supervised self-hosting seam", "runtime source");
assertIncludes(runtimeSource, "without package-local self-promotion", "runtime source");

finish({
  suite: "transfer-runtime-surface",
  candidateCwd,
  controllerCwd,
  checked: [
    "runtime tool-name exposure",
    "runtime help mentions start_and_watch",
    "runtime help describes the public supervised self-hosting seam",
    "runtime help preserves no package-local self-promotion guidance",
  ],
});
