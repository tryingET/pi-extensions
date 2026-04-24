import {
  assertIncludes,
  finish,
  parseSelfHostingSuiteArgs,
  readCandidateFile,
} from "../lib/source-assert.mjs";

const { candidateCwd, controllerCwd } = parseSelfHostingSuiteArgs();
const extensionSource = readCandidateFile(
  candidateCwd,
  "packages/pi-autoresearch/extensions/pi-autoresearch.ts",
);

assertIncludes(extensionSource, 'name: AUTORESEARCH_SELF_HOSTING_TOOL_NAME', "extension source");
assertIncludes(extensionSource, 'Type.Literal("start_and_watch")', "extension source");
assertIncludes(extensionSource, 'emitAutoresearchSelfHostingUpdate', "extension source");
assertIncludes(extensionSource, 'action === "run" || action === "start_and_watch"', "extension source");

finish({
  suite: "dev-self-hosting-tool-surface",
  candidateCwd,
  controllerCwd,
  checked: [
    "tool registration",
    "start_and_watch action literal",
    "in-call progress update helper",
    "run/start_and_watch bounded execution branch",
  ],
});
