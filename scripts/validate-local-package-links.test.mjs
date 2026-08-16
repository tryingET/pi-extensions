// ---
// summary: "Tests read-only direct/transitive file dependency link validation and gate ordering."
// read_when:
//   - "Changing local package link validation or its root/package gate integration."
// ---

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateLocalPackageLinks } from "./validate-local-package-links.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FULL_GATE = path.join(ROOT, "scripts", "ci", "full.sh");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createFixture(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-local-package-links-"));
  fs.mkdirSync(path.join(repoRoot, "packages"), { recursive: true });
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const packageRoot = (name) => path.join(repoRoot, "packages", name);
  const addPackage = (name, packageName, dependencies = {}) => {
    const root = packageRoot(name);
    writeJson(path.join(root, "package.json"), {
      name: packageName,
      version: "1.0.0",
      ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    });
    return root;
  };
  const installLink = (consumerRoot, dependencyName, targetRoot) => {
    const linkPath = path.join(consumerRoot, "node_modules", ...dependencyName.split("/"));
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.rmSync(linkPath, { recursive: true, force: true });
    fs.symlinkSync(targetRoot, linkPath, process.platform === "win32" ? "junction" : "dir");
    return linkPath;
  };

  return { repoRoot, packageRoot, addPackage, installLink };
}

test("validates direct and transitive file dependency links without mutating manifests", (t) => {
  const fixture = createFixture(t);
  const consumer = fixture.addPackage("consumer", "@example/consumer", {
    "@example/provider": "file:../provider",
  });
  const provider = fixture.addPackage("provider", "@example/provider", {
    "@example/kit": "file:../kit",
  });
  const kit = fixture.addPackage("kit", "@example/kit");
  fixture.installLink(consumer, "@example/provider", provider);
  fixture.installLink(provider, "@example/kit", kit);

  const manifestPath = path.join(consumer, "package.json");
  const beforeText = fs.readFileSync(manifestPath, "utf8");
  const beforeMtime = fs.statSync(manifestPath).mtimeMs;
  const result = validateLocalPackageLinks({
    repoRoot: fixture.repoRoot,
    packageRoots: [consumer],
  });

  assert.equal(result.ok, true);
  assert.equal(result.packageCount, 3);
  assert.equal(result.linkCount, 2);
  assert.deepEqual(result.issues, []);
  assert.equal(fs.readFileSync(manifestPath, "utf8"), beforeText);
  assert.equal(fs.statSync(manifestPath).mtimeMs, beforeMtime);
});

test("reports a missing installed link with the owning package repair command", (t) => {
  const fixture = createFixture(t);
  const consumer = fixture.addPackage("consumer", "@example/consumer", {
    "@example/provider": "file:../provider",
  });
  fixture.addPackage("provider", "@example/provider");

  const result = validateLocalPackageLinks({
    repoRoot: fixture.repoRoot,
    packageRoots: [consumer],
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, "missing_installed_link");
  assert.match(result.issues[0].summary, /node_modules\/@example\/provider/);
  assert.equal(result.issues[0].repair, "cd packages/consumer && npm install");
});

test("rejects dangling and wrong installed targets by canonical real path", (t) => {
  const fixture = createFixture(t);
  const consumer = fixture.addPackage("consumer", "@example/consumer", {
    "@example/provider": "file:../provider",
  });
  fixture.addPackage("provider", "@example/provider");
  const wrongProvider = fixture.addPackage("wrong-provider", "@example/provider");

  const linkPath = fixture.installLink(consumer, "@example/provider", wrongProvider);
  let result = validateLocalPackageLinks({ repoRoot: fixture.repoRoot, packageRoots: [consumer] });
  assert.equal(result.issues[0].code, "installed_target_mismatch");

  fs.rmSync(linkPath);
  fs.symlinkSync(
    path.join(fixture.repoRoot, "packages", "missing-provider"),
    linkPath,
    process.platform === "win32" ? "junction" : "dir",
  );
  result = validateLocalPackageLinks({ repoRoot: fixture.repoRoot, packageRoots: [consumer] });
  assert.equal(result.issues[0].code, "dangling_installed_link");
});

test("rejects target name mismatches and repository escapes", (t) => {
  const fixture = createFixture(t);
  const mismatchConsumer = fixture.addPackage("mismatch-consumer", "@example/consumer", {
    "@example/provider": "file:../provider",
  });
  fixture.addPackage("provider", "@example/not-provider");

  let result = validateLocalPackageLinks({
    repoRoot: fixture.repoRoot,
    packageRoots: [mismatchConsumer],
  });
  assert.equal(result.issues[0].code, "target_name_mismatch");

  const outsideRoot = path.join(path.dirname(fixture.repoRoot), `${path.basename(fixture.repoRoot)}-outside`);
  writeJson(path.join(outsideRoot, "package.json"), {
    name: "@example/outside",
    version: "1.0.0",
  });
  t.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  const escapeConsumer = fixture.addPackage("escape-consumer", "@example/escape-consumer", {
    "@example/outside": `file:../../../${path.basename(outsideRoot)}`,
  });

  result = validateLocalPackageLinks({
    repoRoot: fixture.repoRoot,
    packageRoots: [escapeConsumer],
  });
  assert.equal(result.issues[0].code, "target_outside_repo");
});

test("rejects selected package roots outside the repository", (t) => {
  const fixture = createFixture(t);
  const outsideRoot = path.join(path.dirname(fixture.repoRoot), `${path.basename(fixture.repoRoot)}-selected`);
  writeJson(path.join(outsideRoot, "package.json"), {
    name: "@example/outside",
    version: "1.0.0",
  });
  t.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));

  const result = validateLocalPackageLinks({
    repoRoot: fixture.repoRoot,
    packageRoots: [outsideRoot],
  });
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, "package_root_outside_repo");
});

test("rejects dependency names containing platform path separators", (t) => {
  const fixture = createFixture(t);
  const invalidName = "..\\outside";
  const consumer = fixture.addPackage("consumer", "@example/consumer", {
    [invalidName]: "file:../provider",
  });
  fixture.addPackage("provider", invalidName);

  const result = validateLocalPackageLinks({
    repoRoot: fixture.repoRoot,
    packageRoots: [consumer],
  });
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, "invalid_dependency_name");
});

test("terminates cyclic local dependency graphs deterministically", (t) => {
  const fixture = createFixture(t);
  const packageA = fixture.addPackage("a", "@example/a", { "@example/b": "file:../b" });
  const packageB = fixture.addPackage("b", "@example/b", { "@example/a": "file:../a" });
  fixture.installLink(packageA, "@example/b", packageB);
  fixture.installLink(packageB, "@example/a", packageA);

  const result = validateLocalPackageLinks({ repoRoot: fixture.repoRoot, packageRoots: [packageA] });
  assert.equal(result.ok, true);
  assert.equal(result.packageCount, 2);
  assert.equal(result.linkCount, 2);
});

test("root full gate runs link validation before entering full validation", (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-local-link-gate-order-"));
  t.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
  const binDir = path.join(tmpRoot, "bin");
  const logPath = path.join(tmpRoot, "node.log");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, "node"),
    `#!/bin/sh\nprintf '%s\\n' "$*" > "$FAKE_NODE_LOG"\nexit 23\n`,
    { mode: 0o755 },
  );

  const result = spawnSync("bash", [FULL_GATE], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      FAKE_NODE_LOG: logPath,
      PI_EXTENSIONS_TMPDIR: path.join(tmpRoot, "tmp"),
      PI_SKIP_PACKAGES: "0",
    },
  });

  assert.equal(result.status, 23);
  assert.match(fs.readFileSync(logPath, "utf8"), /validate-local-package-links\.mjs/);
});

test("root full gate skips link validation when package validation is explicitly skipped", (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-local-link-gate-skip-"));
  t.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
  const binDir = path.join(tmpRoot, "bin");
  const logPath = path.join(tmpRoot, "node.log");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, "node"),
    `#!/bin/sh\nprintf '%s\\n' "$*" > "$FAKE_NODE_LOG"\nexit 23\n`,
    { mode: 0o755 },
  );

  const result = spawnSync("bash", [FULL_GATE], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      FAKE_NODE_LOG: logPath,
      PI_EXTENSIONS_TMPDIR: path.join(tmpRoot, "tmp"),
      PI_SKIP_PACKAGES: "1",
      PI_SKIP_ROCS: "1",
      PI_SKIP_PACKAGE_RELEASE_CONTRACTS: "1",
    },
  });

  assert.equal(result.status, 23);
  const firstNodeCall = fs.readFileSync(logPath, "utf8");
  assert.doesNotMatch(firstNodeCall, /validate-local-package-links\.mjs/);
  assert.match(firstNodeCall, /release-components\.mjs validate/);
});
