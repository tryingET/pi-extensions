// Authored source-only negatives. They perform scratch I/O only when separately authorized.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { COPIED, ORIGINAL_IMPORT, DENIED_IMPORT, checkedChild, copyClosure, digest, originalBytes,
  transformBytes, verifyDestination } from "./completion-fixture-closure.mjs";
import { assertCase, assertFiniteCommand, assertRunEnvelope, finiteCommand, generatedPaths } from "./completion-fixture-cases.mjs";
export function sourceNegatives(source, base, pins, executable) {
  const lifecycle = readFileSync(path.join(source, "host-lifecycle.mjs"));
  const text = lifecycle.toString("utf8");
  for (const file of ["host-lifecycle.mjs", "recovery.mjs"]) {
    const original = readFileSync(path.join(source, file));
    const input = original.toString("utf8");
    assert.throws(() => transformBytes(file, Buffer.from(input.replace(ORIGINAL_IMPORT, 'from "./missing.mjs"'))),
      /exactly one/);
    assert.throws(() => transformBytes(file, Buffer.from(input + `\n// ${ORIGINAL_IMPORT}\n`)), /exactly one/);
    const transformed = transformBytes(file, original);
    assert.equal(digest(transformed), pins.copied[file].destinationSha256);
    assert.ok(transformed.includes(Buffer.from(DENIED_IMPORT)));
  }
  const alteredPin = structuredClone(pins);
  alteredPin.copied["host-lifecycle.mjs"].destinationSha256 = "0".repeat(64);
  assert.throws(() => originalBytes(source, "host-lifecycle.mjs", alteredPin), /changed transformation/);

  const changedSource = path.join(base, "changed-source");
  mkdirSync(changedSource);
  writeFileSync(path.join(changedSource, "host-lifecycle.mjs"), text + "\n// changed bytes\n");
  assert.throws(() => originalBytes(changedSource, "host-lifecycle.mjs", pins), /changed source/);
  const extra = path.join(base, "extra-destination");
  copyClosure(source, extra, pins);
  writeFileSync(path.join(extra, "extra.mjs"), "void 0;\n");
  assert.throws(() => verifyDestination(extra, pins), /extra\/missing/);
  const changed = path.join(base, "changed-destination");
  copyClosure(source, changed, pins);
  writeFileSync(path.join(changed, "runner.mjs"), "// wrong bytes\n");
  assert.throws(() => verifyDestination(changed, pins), /changed destination/);
  const linked = path.join(base, "symlink-destination");
  mkdirSync(linked);
  for (const file of COPIED) {
    if (file === "runner.mjs") symlinkSync(path.join(source, file), path.join(linked, file));
    else writeFileSync(path.join(linked, file), originalBytes(source, file, pins));
  }
  assert.throws(() => verifyDestination(linked, pins), /symlink/);

  const root = path.join(base, "command-root");
  mkdirSync(root);
  const name = "metadata-success";
  const generated = generatedPaths(root, name, true);
  mkdirSync(path.dirname(generated.hostMetadata), { recursive: true });
  for (const file of [generated.hostMetadata, generated.consumerMetadata]) writeFileSync(file, "{}");
  for (const unsafe of ["../ordinary-success", "ordinary-success/extra", "", "__proto__", "ordinary-SUCCESS", "ordinary-success\0"]) {
    assert.throws(() => assertCase(unsafe), /unknown\/unsafe/);
  }
  const approved = finiteCommand(root, name, executable);
  assertFiniteCommand(root, name, approved, executable);
  for (const command of [
    ["npm", ...approved.slice(1)], ["/bin/npm", ...approved.slice(1)], ["/elsewhere/node", ...approved.slice(1)],
    [executable, "-e", "void 0"], [...approved, "extra"], [executable, "--eval", approved[2]],
    [executable, "-e", approved[2] + ";require('node:child_process').spawn('npm')"],
    [executable, "-e", approved[2].replace(generated.target, "/outside-fixture/package.json")],
  ]) assert.throws(() => assertFiniteCommand(root, name, command, executable), /unreviewed complete/);
  for (const unsafe of ["../escape", "/absolute", "a/../../escape", "a//b", ".", "a/./b", "a\\..\\b"]) {
    assert.throws(() => checkedChild(root, unsafe, { absent: true }), /unsafe generated/);
  }
  symlinkSync(base, path.join(root, "alias"));
  assert.throws(() => checkedChild(root, "alias/escape", { absent: true }), /symlink/);
  const manifestPath = path.join(root, `manifest-${name}.json`);
  writeFileSync(manifestPath, "{}");
  const manifest = { manifestPath, hostPackage: "synthetic-host", hostCompanionPackages: [],
    profiles: Object.fromEntries(["current", "upgrade"].map(profile => [profile, { host: {
      version: "0.84.3", reviewAnchor: "synthetic-only" } }])),
    scenarios: ["first", "next"].map(id => ({ id, profiles: ["current", "upgrade"], cwd: ".", cwdAbs: root,
      packages: [generated.packageRelative], command: approved })) };
  const options = { profile: "current", json: true };
  assertRunEnvelope(manifest, options, root, name, executable);
  for (const mutate of [
    m => { m.scenarios[0].command = ["npm", "install"]; },
    m => { m.scenarios[0].cwdAbs = base; },
    m => { m.scenarios[0].packages = ["../escape"]; },
    m => { m.manifestPath = path.join(base, "manifest.json"); },
  ]) {
    const altered = structuredClone(manifest); mutate(altered);
    assert.throws(() => assertRunEnvelope(altered, options, root, name, executable));
  }
  assert.throws(() => assertRunEnvelope(manifest, { ...options, recover: true }, root, name, executable), /unreviewed run options/);
  assert.throws(() => assertRunEnvelope(manifest, options, root, "deny-bare-npm", executable), /cannot use/);
}
