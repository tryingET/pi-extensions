import {
  assertIncludes,
  finish,
  parseSelfHostingSuiteArgs,
  readCandidateFile,
} from "../lib/source-assert.mjs";

const { candidateCwd, controllerCwd } = parseSelfHostingSuiteArgs();
const readme = readCandidateFile(candidateCwd, "packages/pi-autoresearch/README.md");

assertIncludes(readme, "`autoresearch_self_hosting_run`", "README");
assertIncludes(readme, "`action=start_and_watch`", "README");
assertIncludes(readme, "hidden daemonized autonomy", "README");
assertIncludes(readme, "automatic controller rotation", "README");

finish({
  suite: "holdout-operator-guidance-surface",
  candidateCwd,
  controllerCwd,
  checked: [
    "public self-hosting tool mention",
    "start_and_watch operator guidance",
    "bounded non-goal: hidden daemonized autonomy",
    "bounded non-goal: automatic controller rotation",
  ],
});
