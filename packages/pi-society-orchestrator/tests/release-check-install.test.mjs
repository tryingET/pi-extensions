import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const packageDir = path.resolve(import.meta.dirname, "..");
const releaseCheckPath = path.join(packageDir, "scripts", "release-check.sh");
const releaseSmokePath = path.join(packageDir, "scripts", "release-smoke.mjs");
const releaseLocalDependenciesPath = path.join(
  packageDir,
  "scripts",
  "release-local-dependencies.mjs",
);
const vaultReleaseLocalDependenciesPath = path.resolve(
  packageDir,
  "../pi-vault-client/scripts/release-local-dependencies.mjs",
);
const vaultReleaseCheckPath = path.resolve(
  packageDir,
  "../pi-vault-client/scripts/release-check.sh",
);
const processTmpDirInput = process.env.TMPDIR;
assert.equal(typeof processTmpDirInput, "string", "TMPDIR is required for focused release tests");
assert.ok(
  fs.statSync(processTmpDirInput).isDirectory(),
  `TMPDIR does not exist: ${processTmpDirInput}`,
);
const processTmpDir = fs.realpathSync(processTmpDirInput);

function makeTestRoot(label) {
  return fs.mkdtempSync(path.join(processTmpDir, `pi-orch-${label}-`));
}

function fixtureEnv(tmpDir) {
  return {
    ...process.env,
    TMPDIR: tmpDir,
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_CACHE: path.join(tmpDir, "npm-cache"),
    NPM_CONFIG_FUND: "false",
  };
}

function packFixture({ root, directoryName, manifest, files }) {
  const fixtureDir = path.join(root, directoryName);
  const packDir = path.join(root, "tarballs");
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const binTargets = new Set(
    typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin || {}),
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(fixtureDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    if (binTargets.has(relativePath)) fs.chmodSync(filePath, 0o755);
  }
  const tarballName = execFileSync("npm", ["pack", "--silent", "--pack-destination", packDir], {
    cwd: fixtureDir,
    encoding: "utf8",
    env: fixtureEnv(root),
  })
    .trim()
    .split(/\r?\n/)
    .at(-1);
  return path.join(packDir, tarballName);
}

function createExactTarballSet(root) {
  const postinstallMarker = path.join(root, "postinstall-ran.marker");
  const postinstallSource = `require("node:fs").writeFileSync(${JSON.stringify(postinstallMarker)}, "ran")`;
  const packageA = packFixture({
    root,
    directoryName: "package-a",
    manifest: {
      name: "@ak4887-fixture/package-a",
      version: "1.0.0",
      main: "index.cjs",
      bin: { "ak4887-package-a": "cli.cjs" },
      files: ["index.cjs", "cli.cjs"],
      scripts: { postinstall: `node -e '${postinstallSource}'` },
    },
    files: {
      "index.cjs": 'module.exports = { source: "exact-package-a-tarball" };\n',
      "cli.cjs": '#!/usr/bin/env node\nconsole.log("package-a-bin");\n',
    },
  });
  const packageB = packFixture({
    root,
    directoryName: "package-b",
    manifest: {
      name: "@ak4887-fixture/package-b",
      version: "1.0.0",
      main: "index.cjs",
      files: ["index.cjs"],
      dependencies: {
        // Deliberately mismatched: the release install must override this
        // transitive request with the exact generated package-a tarball.
        "@ak4887-fixture/package-a": "0.0.1",
      },
    },
    files: {
      "index.cjs":
        'module.exports = require("@ak4887-fixture/package-a").source + ":via-package-b";\n',
    },
  });
  return { tarballs: [packageA, packageB], postinstallMarker };
}

function createCollidingBinTarball(root) {
  return packFixture({
    root,
    directoryName: "package-c",
    manifest: {
      name: "@ak4887-fixture/package-c",
      version: "1.0.0",
      bin: { "ak4887-package-a": "other-cli.cjs" },
      files: ["other-cli.cjs"],
    },
    files: { "other-cli.cjs": "#!/usr/bin/env node\n" },
  });
}

function runSourcedShell(script, args, env) {
  return spawnSync("bash", ["-c", `source "$1"; ${script}`, "bash", releaseCheckPath, ...args], {
    cwd: packageDir,
    encoding: "utf8",
    env,
  });
}

function collectExportTargets(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectExportTargets(entry, output);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectExportTargets(entry, output);
  }
  return output;
}

function listShippedEntrypoints(manifest, rootDir) {
  const targets = [
    ...collectExportTargets(manifest.exports),
    ...(Array.isArray(manifest.pi?.extensions) ? manifest.pi.extensions : []),
  ];
  assert.ok(
    targets.length > 0,
    "package exports or pi.extensions must declare shipped entrypoints",
  );
  return [...new Set(targets)].sort().map((target) => {
    assert.equal(typeof target, "string");
    assert.ok(target.startsWith("./"), `Shipped entrypoint must be package-relative: ${target}`);
    assert.equal(
      target.includes("*"),
      false,
      `Wildcard shipped entrypoint is not bounded: ${target}`,
    );
    const resolved = fs.realpathSync(path.resolve(rootDir, target));
    assert.ok(
      resolved.startsWith(`${fs.realpathSync(rootDir)}${path.sep}`),
      `Shipped entrypoint escapes package: ${target}`,
    );
    return resolved;
  });
}

function resolveStaticRelativeImport(importerPath, specifier) {
  const unresolved = path.resolve(path.dirname(importerPath), specifier);
  const candidates = [
    unresolved,
    unresolved.replace(/\.js$/, ".ts"),
    unresolved.replace(/\.mjs$/, ".mts"),
    `${unresolved}.ts`,
    `${unresolved}.mts`,
    `${unresolved}.js`,
    `${unresolved}.mjs`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.mts"),
    path.join(unresolved, "index.js"),
    path.join(unresolved, "index.mjs"),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(resolved, `Could not resolve static runtime import ${specifier} from ${importerPath}`);
  return fs.realpathSync(resolved);
}

function listStaticRelativeImports(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers = new Set();
  const recordStringLiteral = (node) => {
    if (node && ts.isStringLiteralLike(node) && node.text.startsWith(".")) {
      specifiers.add(node.text);
    }
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      recordStringLiteral(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      recordStringLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...specifiers].sort();
}

function collectStaticRuntimeClosure(entrypoints, rootDir = packageDir) {
  const canonicalRoot = fs.realpathSync(rootDir);
  const queue = entrypoints.map((entry) => fs.realpathSync(entry));
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const specifier of listStaticRelativeImports(current)) {
      const importedPath = resolveStaticRelativeImport(current, specifier);
      assert.ok(
        importedPath === canonicalRoot || importedPath.startsWith(`${canonicalRoot}${path.sep}`),
        `Shipped entrypoint import escapes the package: ${current} -> ${importedPath}`,
      );
      queue.push(importedPath);
    }
  }
  return [...visited].sort();
}

function missingPackedClosure(runtimeClosure, rootDir, packedFiles) {
  return runtimeClosure
    .map((filePath) => path.relative(rootDir, filePath).split(path.sep).join("/"))
    .filter((relativePath) => !packedFiles.has(relativePath));
}

function listEscapingSymlinks(rootDir) {
  const canonicalRoot = fs.realpathSync(rootDir);
  const escaping = [];
  const queue = [canonicalRoot];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink()) {
        const target = fs.realpathSync(entryPath);
        if (target !== canonicalRoot && !target.startsWith(`${canonicalRoot}${path.sep}`)) {
          escaping.push(`${entryPath} -> ${target}`);
        }
      } else if (stat.isDirectory()) {
        queue.push(entryPath);
      }
    }
  }
  return escaping;
}

test("focused release tests use the explicitly managed TMPDIR", () => {
  const root = makeTestRoot("managed-tmpdir");
  try {
    assert.equal(processTmpDir, fs.realpathSync(process.env.TMPDIR));
    assert.ok(root.startsWith(`${processTmpDir}${path.sep}`));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("isolated install disables lifecycle scripts and binds exact tarball bytes/content", () => {
  const root = makeTestRoot("release-install-success");
  try {
    const { tarballs, postinstallMarker } = createExactTarballSet(root);
    const installRoot = path.join(root, "install-project");
    const maliciousUserConfig = path.join(root, "ambient.npmrc");
    fs.writeFileSync(
      maliciousUserConfig,
      "registry=https://registry.attacker.invalid/\nignore-scripts=false\nbin-links=true\n",
    );
    const env = {
      ...fixtureEnv(root),
      NPM_CONFIG_REGISTRY: "https://registry.attacker.invalid/",
      NPM_CONFIG_USERCONFIG: maliciousUserConfig,
      NPM_CONFIG_IGNORE_SCRIPTS: "false",
      NPM_CONFIG_PACKAGE_LOCK: "true",
      NPM_CONFIG_BIN_LINKS: "true",
      NPM_CONFIG_BEFORE: "2030-01-01T00:00:00.000Z",
    };
    const result = runSourcedShell(
      'install_tarball_set "$2" "$3" "$4"',
      [installRoot, ...tarballs],
      env,
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Exact tarball digest\/content ownership:/);
    assert.match(result.stdout, /No ambient workspace links:/);
    assert.match(result.stdout, /Exact generated bin ownership: 1 bin link/);
    assert.match(result.stdout, /Canonical npm registry: https:\/\/registry\.npmjs\.org\//);
    assert.equal(fs.existsSync(postinstallMarker), false, "postinstall must never execute");

    const bindings = JSON.parse(
      fs.readFileSync(path.join(installRoot, "release-tarball-bindings.json"), "utf8"),
    );
    assert.equal(bindings.registry, "https://registry.npmjs.org/");
    assert.equal(new Date(bindings.activePolicy.before).toISOString(), "2030-01-01T00:00:00.000Z");
    assert.ok(bindings.packages.every((entry) => /^[a-f0-9]{128}$/.test(entry.sha512)));
    const npmrc = fs.readFileSync(path.join(installRoot, ".npmrc"), "utf8");
    assert.match(npmrc, /^registry=https:\/\/registry\.npmjs\.org\/$/m);
    assert.match(npmrc, /^ignore-scripts=true$/m);
    assert.match(npmrc, /^bin-links=false$/m);
    assert.doesNotMatch(npmrc, /attacker/);

    const nodeModulesRoot = path.join(installRoot, "node_modules");
    const packageADir = path.join(nodeModulesRoot, "@ak4887-fixture", "package-a");
    const packageBDir = path.join(nodeModulesRoot, "@ak4887-fixture", "package-b");
    assert.equal(fs.lstatSync(packageADir).isSymbolicLink(), false);
    assert.equal(fs.lstatSync(packageBDir).isSymbolicLink(), false);
    assert.equal(
      execFileSync("node", ["-p", `require(${JSON.stringify(packageBDir)})`], {
        encoding: "utf8",
      }).trim(),
      "exact-package-a-tarball:via-package-b",
    );
    const binPath = path.join(nodeModulesRoot, ".bin", "ak4887-package-a");
    assert.equal(fs.lstatSync(binPath).isSymbolicLink(), true);
    assert.equal(fs.realpathSync(binPath), path.join(packageADir, "cli.cjs"));
    assert.deepEqual(listEscapingSymlinks(nodeModulesRoot), []);
    assert.equal(fs.existsSync(path.join(installRoot, "package-lock.json")), false);

    const installedSource = path.join(packageADir, "index.cjs");
    const originalSource = fs.readFileSync(installedSource);
    fs.writeFileSync(installedSource, 'module.exports = { source: "substituted" };\n');
    const substituted = runSourcedShell(
      'verify_install_project "$2" "$3" "$4"',
      [installRoot, ...tarballs],
      fixtureEnv(root),
    );
    assert.notEqual(substituted.status, 0);
    assert.match(substituted.stderr, /Packed content mismatch/);
    fs.writeFileSync(installedSource, originalSource);

    fs.appendFileSync(tarballs[0], "substituted-tarball-bytes");
    const rebound = runSourcedShell(
      'verify_install_project "$2" "$3" "$4"',
      [installRoot, ...tarballs],
      fixtureEnv(root),
    );
    assert.notEqual(rebound.status, 0);
    assert.match(rebound.stderr, /Tarball digest mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("exact generated bin proof rejects missing, extra, and wrong-target links", () => {
  const root = makeTestRoot("release-bin-adversarial");
  try {
    const { tarballs } = createExactTarballSet(root);
    const installRoot = path.join(root, "install-project");
    const installed = runSourcedShell(
      'install_tarball_set "$2" "$3" "$4"',
      [installRoot, ...tarballs],
      fixtureEnv(root),
    );
    assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`);
    const binDir = path.join(installRoot, "node_modules", ".bin");
    const binPath = path.join(binDir, "ak4887-package-a");

    fs.rmSync(binPath);
    const missing = runSourcedShell(
      'verify_install_project "$2" "$3" "$4"',
      [installRoot, ...tarballs],
      fixtureEnv(root),
    );
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Generated bin set mismatch/);

    const rematerialized = runSourcedShell(
      'materialize_generated_bins "$2"',
      [installRoot],
      fixtureEnv(root),
    );
    assert.equal(rematerialized.status, 0, rematerialized.stderr);
    fs.symlinkSync(
      path.relative(
        binDir,
        path.join(installRoot, "node_modules", "@ak4887-fixture", "package-b", "index.cjs"),
      ),
      path.join(binDir, "unexpected-bin"),
    );
    const extra = runSourcedShell(
      'verify_install_project "$2" "$3" "$4"',
      [installRoot, ...tarballs],
      fixtureEnv(root),
    );
    assert.notEqual(extra.status, 0);
    assert.match(extra.stderr, /Generated bin set mismatch/);
    fs.rmSync(path.join(binDir, "unexpected-bin"));

    fs.rmSync(binPath);
    fs.symlinkSync(
      path.relative(
        binDir,
        path.join(installRoot, "node_modules", "@ak4887-fixture", "package-b", "index.cjs"),
      ),
      binPath,
    );
    const wrongTarget = runSourcedShell(
      'verify_install_project "$2" "$3" "$4"',
      [installRoot, ...tarballs],
      fixtureEnv(root),
    );
    assert.notEqual(wrongTarget.status, 0);
    assert.match(wrongTarget.stderr, /Generated bin target mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("isolated install rejects duplicate package and generated bin owners before npm", () => {
  const root = makeTestRoot("release-install-failure");
  try {
    const { tarballs } = createExactTarballSet(root);
    const installRoot = path.join(root, "duplicate-project");
    const duplicate = runSourcedShell(
      'install_tarball_set "$2" "$3" "$4"',
      [installRoot, tarballs[0], tarballs[0]],
      fixtureEnv(root),
    );
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /Duplicate release tarball package name/);
    assert.equal(fs.existsSync(path.join(installRoot, "node_modules")), false);

    const collisionRoot = path.join(root, "collision-project");
    const collision = runSourcedShell(
      'install_tarball_set "$2" "$3" "$4"',
      [collisionRoot, tarballs[0], createCollidingBinTarball(root)],
      fixtureEnv(root),
    );
    assert.notEqual(collision.status, 0);
    assert.match(collision.stderr, /Generated bin collision/);
    assert.equal(fs.existsSync(path.join(collisionRoot, "node_modules")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("release temp creation requires TMPDIR and allocates only beneath it", () => {
  const root = makeTestRoot("release-tmpdir");
  try {
    const success = runSourcedShell('release_temp_dir "focused-test"', [], fixtureEnv(root));
    assert.equal(success.status, 0, success.stderr);
    const created = fs.realpathSync(success.stdout.trim());
    assert.ok(created.startsWith(`${fs.realpathSync(root)}${path.sep}`));
    fs.rmdirSync(created);

    const missingTmpEnv = fixtureEnv(root);
    delete missingTmpEnv.TMPDIR;
    const failure = runSourcedShell('release_temp_dir "focused-test"', [], missingTmpEnv);
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /TMPDIR is required/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("release cleanup removes tracked TMPDIR artifacts and honors explicit retention", () => {
  const root = makeTestRoot("release-cleanup");
  try {
    const removable = [
      path.join(root, "agent"),
      path.join(root, "local-deps"),
      path.join(root, "package.tgz"),
    ];
    fs.mkdirSync(removable[0]);
    fs.mkdirSync(removable[1]);
    fs.writeFileSync(removable[2], "tarball");
    const cleanupResult = runSourcedShell(
      'TEST_AGENT_DIR="$2"; LOCAL_DEP_PACK_DIR="$3"; TARBALL_PATH="$4"; cleanup_release_artifacts',
      removable,
      fixtureEnv(root),
    );
    assert.equal(cleanupResult.status, 0, cleanupResult.stderr);
    for (const artifact of removable) assert.equal(fs.existsSync(artifact), false);

    const retained = path.join(root, "retained-agent");
    fs.mkdirSync(retained);
    const retainResult = runSourcedShell(
      'TEST_AGENT_DIR="$2"; KEEP_RELEASE_ARTIFACTS=1; cleanup_release_artifacts',
      [retained],
      fixtureEnv(root),
    );
    assert.equal(retainResult.status, 0, retainResult.stderr);
    assert.equal(fs.existsSync(retained), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("release smoke removes its owned scratch root after an early preflight failure", () => {
  const root = makeTestRoot("release-smoke-early-failure");
  try {
    const malformedRoot = path.join(root, "malformed");
    const malformedPackage = path.join(malformedRoot, "package");
    const tarballPath = path.join(root, "malformed.tgz");
    const agentDir = path.join(root, "agent");
    const installRoot = path.join(root, "install");
    fs.mkdirSync(malformedPackage, { recursive: true });
    fs.mkdirSync(agentDir);
    fs.mkdirSync(installRoot);
    fs.writeFileSync(path.join(malformedPackage, "README.md"), "missing manifest\n");
    execFileSync("tar", ["-czf", tarballPath, "-C", malformedRoot, "package"]);
    const packageSpec = `npm:${tarballPath}`;
    fs.writeFileSync(
      path.join(agentDir, "settings.json"),
      `${JSON.stringify({ packages: [{ source: packageSpec }] })}\n`,
    );

    const result = spawnSync("node", [releaseSmokePath], {
      cwd: packageDir,
      encoding: "utf8",
      env: {
        ...fixtureEnv(root),
        PI_CODING_AGENT_DIR: agentDir,
        PI_RELEASE_INSTALL_ROOT: installRoot,
        PACKAGE_SPEC: packageSpec,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing tarball package\.json/);
    assert.deepEqual(
      fs.readdirSync(root).filter((entry) => entry.startsWith("pi-orch-release-smoke-root-")),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("packed artifact contains exports plus pi.extensions static runtime-import closure", () => {
  const root = makeTestRoot("packed-import-closure");
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
    const entrypoints = listShippedEntrypoints(manifest, packageDir);
    const declaredTargets = new Set([
      ...collectExportTargets(manifest.exports),
      ...manifest.pi.extensions,
    ]);
    assert.deepEqual(
      new Set(
        entrypoints.map(
          (entry) => `./${path.relative(packageDir, entry).split(path.sep).join("/")}`,
        ),
      ),
      declaredTargets,
    );
    const runtimeClosure = collectStaticRuntimeClosure(entrypoints);
    const tarballName = execFileSync("npm", ["pack", "--silent", "--pack-destination", root], {
      cwd: packageDir,
      encoding: "utf8",
      env: fixtureEnv(root),
    })
      .trim()
      .split(/\r?\n/)
      .at(-1);
    const packedFiles = new Set(
      execFileSync("tar", ["-tzf", path.join(root, tarballName)], { encoding: "utf8" })
        .split(/\r?\n/)
        .filter(Boolean)
        .map((entry) => entry.replace(/^package\//, "")),
    );

    assert.deepEqual(missingPackedClosure(runtimeClosure, packageDir, packedFiles), []);
    assert.ok(
      packedFiles.has("extensions/autoresearch-tool-adapters.ts"),
      "packed artifact must include the society-orchestrator entrypoint helper",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("shipped-entry closure detects an omitted exported entry and its imports", () => {
  const root = makeTestRoot("exported-entry-omission");
  try {
    fs.writeFileSync(path.join(root, "exported.ts"), 'export { value } from "./helper.js";\n');
    fs.writeFileSync(path.join(root, "helper.ts"), "export const value = 1;\n");
    fs.writeFileSync(path.join(root, "extension.ts"), "export default function extension() {}\n");
    const manifest = {
      exports: { "./exported": "./exported.ts" },
      pi: { extensions: ["./extension.ts"] },
    };
    const closure = collectStaticRuntimeClosure(listShippedEntrypoints(manifest, root), root);
    const missing = missingPackedClosure(closure, root, new Set(["extension.ts"]));
    assert.deepEqual(missing, ["exported.ts", "helper.ts"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("vault release check refuses system temporary storage", () => {
  const source = fs.readFileSync(vaultReleaseCheckPath, "utf8");
  assert.doesNotMatch(source, /mktemp(?: -d)? \/tmp\//);
  assert.match(source, /npm install --ignore-scripts --legacy-peer-deps/);
  assert.match(source, /if ! LOCAL_DEP_TARBALL_OUTPUT=/);
  assert.doesNotMatch(source, /mapfile[^\n]+< <\(/);
  const result = spawnSync("bash", [vaultReleaseCheckPath], {
    cwd: path.dirname(vaultReleaseCheckPath),
    encoding: "utf8",
    env: { ...process.env, TMPDIR: "/tmp" },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refuses system \/tmp/);
});

test("local dependency packing prepares locked dev tools in isolated scratch", () => {
  const root = makeTestRoot("local-dependency-prepack-dev");
  try {
    const appDir = path.join(root, "app");
    const dependencyDir = path.join(root, "dependency");
    const buildToolDir = path.join(root, "build-tool");
    const prepackMarker = path.join(root, "prepack.marker");
    const dependencyLink = path.join(root, "dependency-link");
    const installMarker = path.join(root, "install.marker");
    const registryMarker = path.join(root, "registry.marker");
    fs.mkdirSync(appDir);
    fs.mkdirSync(dependencyDir);
    fs.mkdirSync(buildToolDir);
    fs.symlinkSync(dependencyDir, dependencyLink, "dir");
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      `${JSON.stringify({
        name: "@fixture/app",
        version: "1.0.0",
        dependencies: { "@fixture/dependency": "file:../dependency-link" },
      })}\n`,
    );
    fs.writeFileSync(
      path.join(buildToolDir, "package.json"),
      `${JSON.stringify({
        name: "@fixture/build-tool",
        version: "1.0.0",
        main: "index.cjs",
        scripts: {
          postinstall: `node -e 'require("node:fs").writeFileSync(${JSON.stringify(installMarker)}, "ran")'`,
        },
      })}\n`,
    );
    fs.writeFileSync(path.join(buildToolDir, "index.cjs"), "module.exports = 'ready';\n");
    fs.writeFileSync(
      path.join(dependencyDir, "verify-prepack.cjs"),
      `const { execFileSync } = require("node:child_process");\nconst fs = require("node:fs");\nif (require("@fixture/build-tool") !== "ready") process.exit(1);\nfs.writeFileSync(${JSON.stringify(prepackMarker)}, "ran");\nfs.writeFileSync(${JSON.stringify(registryMarker)}, execFileSync("npm", ["config", "get", "registry"], { encoding: "utf8" }).trim());\nfs.writeFileSync("relative-prepack.marker", "scratch-only");\n`,
    );
    fs.writeFileSync(
      path.join(dependencyDir, "package.json"),
      `${JSON.stringify({
        name: "@fixture/dependency",
        version: "1.0.0",
        main: "index.cjs",
        scripts: { prepack: "node verify-prepack.cjs" },
        devDependencies: { "@fixture/build-tool": "file:../build-tool" },
      })}\n`,
    );
    fs.writeFileSync(path.join(dependencyDir, "index.cjs"), "module.exports = true;\n");
    fs.writeFileSync(
      path.join(dependencyDir, ".npmrc"),
      "registry=https://registry.attacker.invalid/\n//registry.npmjs.org/:_authToken=SHOULD_NOT_CROSS\n",
    );
    const lock = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], {
      cwd: dependencyDir,
      encoding: "utf8",
      env: fixtureEnv(root),
    });
    assert.equal(lock.status, 0, lock.stderr);
    const packagePath = path.join(dependencyDir, "package.json");
    const lockPath = path.join(dependencyDir, "package-lock.json");
    const packageBytes = fs.readFileSync(packagePath);
    const lockBytes = fs.readFileSync(lockPath);
    const npmrcPath = path.join(dependencyDir, ".npmrc");
    const npmrcBytes = fs.readFileSync(npmrcPath);
    assert.equal(fs.existsSync(path.join(dependencyDir, "node_modules")), false);
    assert.deepEqual(
      fs.readFileSync(releaseLocalDependenciesPath),
      fs.readFileSync(vaultReleaseLocalDependenciesPath),
      "orchestrator and vault local dependency helpers must stay byte-identical",
    );

    for (const [index, helperPath] of [
      releaseLocalDependenciesPath,
      vaultReleaseLocalDependenciesPath,
    ].entries()) {
      const packDir = path.join(root, `packed-${index}`);
      fs.mkdirSync(path.join(packDir, ".source-workspace"), { recursive: true });
      fs.mkdirSync(path.join(packDir, ".npm-home"), { recursive: true });
      fs.writeFileSync(path.join(packDir, ".source-workspace", "sentinel"), "preserve");
      fs.writeFileSync(path.join(packDir, ".npm-home", "sentinel"), "preserve");
      fs.rmSync(prepackMarker, { force: true });
      fs.rmSync(registryMarker, { force: true });
      const packed = spawnSync(
        process.execPath,
        [helperPath, "--pack-dir", packDir, "--output", "tarballs"],
        {
          cwd: appDir,
          encoding: "utf8",
          env: {
            ...fixtureEnv(root),
            NPM_CONFIG_IGNORE_SCRIPTS: "true",
            npm_config_ignore_scripts: "true",
          },
        },
      );
      assert.equal(packed.status, 0, packed.stderr);
      const tarballs = packed.stdout.trim().split(/\r?\n/).filter(Boolean);
      assert.equal(tarballs.length, 1);
      assert.ok(fs.existsSync(tarballs[0]));
      assert.equal(fs.readFileSync(prepackMarker, "utf8"), "ran");
      assert.equal(fs.readFileSync(registryMarker, "utf8"), "https://registry.npmjs.org/");
      assert.equal(
        fs.readFileSync(path.join(packDir, ".source-workspace", "sentinel"), "utf8"),
        "preserve",
      );
      assert.equal(
        fs.readFileSync(path.join(packDir, ".npm-home", "sentinel"), "utf8"),
        "preserve",
      );
      assert.deepEqual(
        fs
          .readdirSync(packDir)
          .filter(
            (entry) =>
              entry.startsWith(".source-workspace.") ||
              entry.startsWith(".npm-home.") ||
              entry === ".release-local-dependencies.lock",
          ),
        [],
      );
    }

    assert.equal(fs.existsSync(path.join(dependencyDir, "node_modules")), false);
    assert.equal(fs.existsSync(path.join(dependencyDir, "relative-prepack.marker")), false);
    assert.equal(fs.existsSync(installMarker), false);
    assert.deepEqual(fs.readFileSync(packagePath), packageBytes);
    assert.deepEqual(fs.readFileSync(lockPath), lockBytes);
    assert.deepEqual(fs.readFileSync(npmrcPath), npmrcBytes);

    const outsideFile = path.join(root, "outside.txt");
    const internalLink = path.join(dependencyDir, "escaping-link");
    fs.writeFileSync(outsideFile, "outside");
    fs.symlinkSync(outsideFile, internalLink);
    const symlinkPackDir = path.join(root, "packed-symlink");
    const symlinked = spawnSync(
      process.execPath,
      [releaseLocalDependenciesPath, "--pack-dir", symlinkPackDir, "--output", "tarballs"],
      { cwd: appDir, encoding: "utf8", env: fixtureEnv(root) },
    );
    assert.notEqual(symlinked.status, 0);
    assert.match(symlinked.stderr, /Symlink is not allowed/);
    assert.deepEqual(
      fs
        .readdirSync(symlinkPackDir)
        .filter(
          (entry) =>
            entry.startsWith(".source-workspace.") ||
            entry.startsWith(".npm-home.") ||
            entry === ".release-local-dependencies.lock",
        ),
      [],
    );
    fs.rmSync(internalLink);

    fs.rmSync(lockPath);
    const locklessPackDir = path.join(root, "packed-lockless");
    const lockless = spawnSync(
      process.execPath,
      [releaseLocalDependenciesPath, "--pack-dir", locklessPackDir, "--output", "tarballs"],
      { cwd: appDir, encoding: "utf8", env: fixtureEnv(root) },
    );
    assert.notEqual(lockless.status, 0);
    assert.match(lockless.stderr, /Locked dev dependency preparation is required/);
    assert.deepEqual(
      fs
        .readdirSync(locklessPackDir)
        .filter(
          (entry) =>
            entry.startsWith(".source-workspace.") ||
            entry.startsWith(".npm-home.") ||
            entry === ".release-local-dependencies.lock",
        ),
      [],
    );

    fs.writeFileSync(lockPath, lockBytes);
    const brokenManifest = JSON.parse(packageBytes.toString("utf8"));
    brokenManifest.devDependencies["@fixture/build-tool"] = "file:../missing-build-tool";
    fs.writeFileSync(packagePath, `${JSON.stringify(brokenManifest)}\n`);
    const partialPackDir = path.join(root, "packed-partial-failure");
    const partial = spawnSync(
      process.execPath,
      [releaseLocalDependenciesPath, "--pack-dir", partialPackDir, "--output", "tarballs"],
      { cwd: appDir, encoding: "utf8", env: fixtureEnv(root) },
    );
    assert.notEqual(partial.status, 0);
    assert.deepEqual(
      fs
        .readdirSync(partialPackDir)
        .filter(
          (entry) =>
            entry.startsWith(".source-workspace.") ||
            entry.startsWith(".npm-home.") ||
            entry === ".release-local-dependencies.lock",
        ),
      [],
    );
    fs.writeFileSync(packagePath, packageBytes);

    const activePackDir = path.join(root, "packed-active");
    const activeLock = path.join(activePackDir, ".release-local-dependencies.lock");
    fs.mkdirSync(activeLock, { recursive: true });
    fs.writeFileSync(path.join(activeLock, "sentinel"), "active");
    const concurrent = spawnSync(
      process.execPath,
      [releaseLocalDependenciesPath, "--pack-dir", activePackDir, "--output", "tarballs"],
      { cwd: appDir, encoding: "utf8", env: fixtureEnv(root) },
    );
    assert.notEqual(concurrent.status, 0);
    assert.match(concurrent.stderr, /pack directory is already active/);
    assert.equal(fs.readFileSync(path.join(activeLock, "sentinel"), "utf8"), "active");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local dependency collection visits a shared DAG once in dependency-first order", () => {
  const root = makeTestRoot("local-dependency-diamond");
  try {
    const appDir = path.join(root, "app");
    const packageA = path.join(root, "package-a");
    const packageB = path.join(root, "package-b");
    const shared = path.join(root, "shared");
    for (const directory of [appDir, packageA, packageB, shared]) fs.mkdirSync(directory);

    const writeManifest = (directory, name, dependencies = {}) => {
      fs.writeFileSync(
        path.join(directory, "package.json"),
        `${JSON.stringify({ name, version: "1.0.0", dependencies })}\n`,
      );
    };
    writeManifest(appDir, "@fixture/app", {
      "@fixture/package-a": "file:../package-a",
      "@fixture/package-b": "file:../package-b",
    });
    writeManifest(packageA, "@fixture/package-a", { "@fixture/shared": "file:../shared" });
    writeManifest(packageB, "@fixture/package-b", { "@fixture/shared": "file:../shared" });
    writeManifest(shared, "@fixture/shared");

    const readCountPath = path.join(root, "manifest-read-count");
    const preloadPath = path.join(root, "count-manifest-reads.cjs");
    fs.writeFileSync(
      preloadPath,
      `const fs = require("node:fs");
const path = require("node:path");
const original = fs.readFileSync;
const originalWrite = fs.writeFileSync;
let count = 0;
fs.readFileSync = function(file, ...args) {
  if (path.basename(String(file)) === "package.json") count += 1;
  return original.call(this, file, ...args);
};
process.on("exit", () => originalWrite(${JSON.stringify(readCountPath)}, String(count)));
`,
    );
    const result = spawnSync(
      process.execPath,
      ["--require", preloadPath, releaseLocalDependenciesPath, "--output", "json"],
      {
        cwd: appDir,
        encoding: "utf8",
        env: fixtureEnv(root),
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      fs.readFileSync(readCountPath, "utf8"),
      "4",
      "each manifest in the shared DAG must be read exactly once",
    );
    assert.deepEqual(
      JSON.parse(result.stdout).localDependencies.map(({ name }) => name),
      ["@fixture/shared", "@fixture/package-a", "@fixture/package-b"],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local dependency collection rejects cycles before packing", () => {
  const root = makeTestRoot("local-dependency-cycle");
  try {
    const appDir = path.join(root, "app");
    const packageA = path.join(root, "package-a");
    const packageB = path.join(root, "package-b");
    fs.mkdirSync(appDir);
    fs.mkdirSync(packageA);
    fs.mkdirSync(packageB);
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({
        name: "@fixture/app",
        version: "1.0.0",
        dependencies: { "@fixture/package-a": "file:../package-a" },
      }),
    );
    fs.writeFileSync(
      path.join(packageA, "package.json"),
      JSON.stringify({
        name: "@fixture/package-a",
        version: "1.0.0",
        dependencies: { "@fixture/package-b": "file:../package-b" },
      }),
    );
    fs.writeFileSync(
      path.join(packageB, "package.json"),
      JSON.stringify({
        name: "@fixture/package-b",
        version: "1.0.0",
        dependencies: { "@fixture/package-a": "file:../package-a" },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        releaseLocalDependenciesPath,
        "--pack-dir",
        path.join(root, "packed"),
        "--output",
        "tarballs",
      ],
      { cwd: appDir, encoding: "utf8", env: fixtureEnv(root) },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Local dependency cycle detected/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
