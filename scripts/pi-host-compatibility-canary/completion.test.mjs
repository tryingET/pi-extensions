// Trusted reviewed closure. No hostile-code/descendant-containment claim.
// This gate must not be launched until the exact-source review and execution hold
// are separately cleared. Never retry/clean scratch following an unexpected result.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const source = path.dirname(fileURLToPath(import.meta.url));
const manifestFile = path.join(source, "completion-fixture-inputs.json");
assert.ok(lstatSync(manifestFile).isFile() && !lstatSync(manifestFile).isSymbolicLink());
const pinsBytes = readFileSync(manifestFile);
const pins = JSON.parse(pinsBytes);
assert.equal(pins.purpose, "admitted_fixture", "strict entry refuses source observations");
// Bootstrap only builtins before checking helper/test bytes. Pins are externally
// reviewed authority inputs, not hashes automatically blessed from current bytes.
for (const [file, expected] of [
  ["completion.test.mjs", pins.parentOnly["completion.test.mjs"]],
  ["completion-fixture-closure.mjs", pins.copied["completion-fixture-closure.mjs"].sha256],
]) {
  const candidate = path.join(source, file);
  assert.ok(lstatSync(candidate).isFile() && !lstatSync(candidate).isSymbolicLink());
  assert.equal(createHash("sha256").update(readFileSync(candidate)).digest("hex"), expected, `bootstrap changed: ${file}`);
}
const { canonicalPath, regularBytes, verifyNode, verifySource } =
  await import("./completion-fixture-closure.mjs");
verifySource(source, pins);
verifyNode(pins);
// No HOME/PATH fallback: this entry still requires externally admitted scratch.
const temp = canonicalPath(process.env.TMPDIR);
assert.ok(temp !== "/tmp" && !temp.startsWith("/tmp/"), "explicit non-/tmp TMPDIR required");
const scratch = mkdtempSync(path.join(temp, "admitted-fixture-"));
chmodSync(scratch, 0o700); // newly created only; no existing scratch is reused/cleaned
const { registerCompletionFixtures } = await import("./completion-fixture-runner.mjs");
await registerCompletionFixtures({ source, pins, pinsBytes, scratch,
  assertInputUnchanged() {
    assert.deepEqual(regularBytes(manifestFile), pinsBytes, "review input manifest changed");
  },
});
