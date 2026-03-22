import assert from "node:assert/strict";
import test from "node:test";

import { rewriteReadmeGithubLinks } from "../scripts/prepare-portable-readme.mjs";

test("rewriteReadmeGithubLinks pins package doc links to the requested commit", () => {
  const source = [
    "- [Doc](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/dev/plan.md)",
    "- [Other](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/README.md)",
  ].join("\n");

  const result = rewriteReadmeGithubLinks(source, {
    repoUrl: "https://github.com/tryingET/pi-extensions",
    repoDirectory: "packages/pi-vault-client",
    ref: "abc123def456",
  });

  assert.match(result, /blob\/abc123def456\/packages\/pi-vault-client\/docs\/dev\/plan\.md/);
  assert.match(result, /blob\/abc123def456\/packages\/pi-vault-client\/README\.md/);
  assert.doesNotMatch(result, /blob\/main\/packages\/pi-vault-client\//);
});

test("rewriteReadmeGithubLinks leaves unrelated GitHub links untouched", () => {
  const source = [
    "- [Neighbor](https://github.com/tryingET/pi-extensions/blob/main/packages/other-package/README.md)",
    "- [External](https://github.com/example/elsewhere/blob/main/README.md)",
  ].join("\n");

  const result = rewriteReadmeGithubLinks(source, {
    repoUrl: "https://github.com/tryingET/pi-extensions",
    repoDirectory: "packages/pi-vault-client",
    ref: "abc123def456",
  });

  assert.equal(result, source);
});
