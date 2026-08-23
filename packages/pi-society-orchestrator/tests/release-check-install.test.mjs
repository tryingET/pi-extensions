import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const packageDir = path.resolve(import.meta.dirname, "..");
const releaseCheckPath = path.join(packageDir, "scripts", "release-check.sh");
const releaseSmokePath = path.join(packageDir, "scripts", "release-smoke.mjs");
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
