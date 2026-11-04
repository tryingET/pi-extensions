// AK7845 inspection findings F1-F3 (evidence 20303): the closure may hold only what the lock names by its
// real package identity, a reused runtime must still be the tree that was installed, and every packed file
// must be tracked at the commit or rebuilt output. Real installs: tests/live/task-session-install.reality.live.mjs.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as closure from "../task-session-runtime/closure.mjs";

const { SDK_PACKAGES, SDK_VERSION } = closure;
const REGISTRY = "https://registry.npmjs.org/";
const tarball = (name, version) => `${REGISTRY}${name}/-/${name.split("/").at(-1)}-${version}.tgz`;
const entry = (name, version) => ({
  version,
  resolved: tarball(name, version),
  integrity: `sha512-${name}${version}`,
});
function lockFixture() {
  const packages = {
    "": { dependencies: Object.fromEntries(SDK_PACKAGES.map((name) => [name, SDK_VERSION])) },
    "node_modules/left-pad": entry("left-pad", "1.0.0"),
  };
  for (const name of SDK_PACKAGES) packages[`node_modules/${name}`] = entry(name, SDK_VERSION);
  return { lockfileVersion: 3, packages };
}

test("F1: Given an npm alias installing an own package under another name, then the lock refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/innocent-alias"] = {
    ...entry("@tryinget/pi-model-selection", "0.1.0"),
    name: "@tryinget/pi-model-selection",
  };
  assert.throws(() => closure.assertLayerOneLock(lock), /lock_alias_forbidden/);
});

test("F1: Given an entry resolved to another package's tarball, then the lock refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/left-pad"].resolved = tarball("@tryinget/pi-telemetry", "0.4.2");
  assert.throws(() => closure.assertLayerOneLock(lock), /lock_entry_not_registry/);
});

for (const spec of ["npm:@tryinget/pi-telemetry@0.4.2", "^1.0.0", "file:../x", "latest"]) {
  test(`F1: Given a root manifest dependency ${spec}, then it refuses anything but an exact version`, () => {
    assert.throws(
      () => closure.assertRuntimeManifest({ dependencies: { x: spec } }),
      /runtime_spec_not_exact/,
    );
  });
}

test("F1: Given the committed root manifest, then every dependency is an exact version", () => {
  assert.doesNotThrow(() => closure.assertRuntimeManifest(closure.readRuntimeManifest()));
});

test("F1: Given an installed entry whose package name differs from its path, then verify refuses", () => {
  const lock = lockFixture();
  const installed = structuredClone(lock.packages);
  installed["node_modules/left-pad"].name = "@tryinget/pi-telemetry";
  assert.throws(() => closure.verifyInstalled(installed, lock, []), /closure_entry_alias/);
});

test("Given an override the lock does not install, then the override check refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/undici"] = entry("undici", "8.10.2");
  assert.throws(
    () => closure.assertOverridesCurrent(lock, { overrides: { undici: "8.12.3" } }),
    /lock_override_not_applied/,
  );
});

test("F2: Given two equal trees, then their digests match, and any change to a file, link or entry shows", (t) => {
  const root = mkdtempSync(join(tmpdir(), "task-session-tree-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const make = (name) => {
    const dir = join(root, name);
    mkdirSync(join(dir, "pkg/lib"), { recursive: true });
    writeFileSync(join(dir, "pkg/package.json"), "{}");
    writeFileSync(join(dir, "pkg/lib/a.js"), "a");
    symlinkSync("../pkg/lib/a.js", join(dir, "pkg/bin"));
    return dir;
  };
  const [a, b] = [make("a"), make("b")];
  const digest = closure.treeDigest(a);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(closure.treeDigest(b), digest);
  writeFileSync(join(b, "pkg/lib/a.js"), "b");
  assert.notEqual(closure.treeDigest(b), digest);
  writeFileSync(join(b, "pkg/lib/a.js"), "a");
  unlinkSync(join(b, "pkg/bin"));
  symlinkSync("../pkg/package.json", join(b, "pkg/bin"));
  assert.notEqual(closure.treeDigest(b), digest);
  rmSync(join(b, "pkg"), { recursive: true });
  assert.notEqual(closure.treeDigest(b), digest);
});

test("F3: Given packed files, then only those neither tracked nor rebuilt output are reported", () => {
  const files = ["package.json", "src/a.js", "src/dist/injected.js", "dist/built.js", "notes.md"];
  const tracked = new Set(["package.json", "src/a.js"]);
  assert.deepEqual(closure.untrackedPackedFiles(files, tracked), [
    "src/dist/injected.js",
    "notes.md",
  ]);
});

test("Given npm other than the toolchain pin, then the environment check refuses", () => {
  const refusal = closure.nodeRefusal({
    pinned: "22.23.4",
    running: "22.23.4",
    onPath: "v22.23.4",
    pinnedNpm: "12.0.2",
    npm: "10.9.9",
  });
  assert.match(refusal ?? "", /^install_npm_not_pinned/);
});

test("Given a nested copy of an overridden package at another version, then the override check refuses", () => {
  const lock = lockFixture();
  lock.packages["node_modules/undici"] = entry("undici", "8.12.3");
  lock.packages["node_modules/@earendil-works/pi-ai/node_modules/undici"] = entry(
    "undici",
    "7.0.0",
  );
  assert.throws(
    () => closure.assertOverridesCurrent(lock, { overrides: { undici: "8.12.3" } }),
    /lock_override_not_applied/,
  );
});

test("F2: Given a file whose mode changed, then the tree digest changes", (t) => {
  const root = mkdtempSync(join(tmpdir(), "task-session-mode-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "run.js"), "x");
  chmodSync(join(root, "run.js"), 0o755);
  const before = closure.treeDigest(root);
  chmodSync(join(root, "run.js"), 0o644);
  assert.notEqual(closure.treeDigest(root), before);
});

test("F3: Given ignored paths in an own package, then all but installs, rebuilt output and scratch are inputs", () => {
  const ignored = [
    "node_modules/",
    "dist/",
    ".tmp/",
    ".tmp-self-tests/",
    "src/dist/injected.js",
    "tsconfig.tsbuildinfo",
    ".package.json.prepack.backup",
  ];
  assert.deepEqual(closure.ignoredInputs(ignored), [
    "src/dist/injected.js",
    "tsconfig.tsbuildinfo",
    ".package.json.prepack.backup",
  ]);
});

for (const field of ["optionalDependencies", "peerDependencies"]) {
  test(`Given a newer exact pin in ${field}, then the override counts as stale`, () => {
    const lock = lockFixture();
    lock.packages["node_modules/undici"] = entry("undici", "8.12.3");
    lock.packages["node_modules/@earendil-works/pi-ai"][field] = { undici: "9.0.0" };
    assert.throws(
      () => closure.assertOverridesCurrent(lock, { overrides: { undici: "8.12.3" } }),
      /lock_override_stale/,
    );
  });
}

// A throwaway repository: a link to output not built yet, an executable, and a newline in a name.
function headRepo(t) {
  const repo = mkdtempSync(join(tmpdir(), "task-session-head-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
      { cwd: repo, stdio: ["ignore", "pipe", "pipe"] },
    );
  git("init", "-q");
  git("config", "core.autocrlf", "input");
  git("config", "core.hooksPath", "/dev/null");
  mkdirSync(join(repo, "pkg"));
  writeFileSync(join(repo, "pkg/a.js"), "one\ntwo\n");
  writeFileSync(join(repo, "pkg/b.js"), "b\n", { mode: 0o644 });
  writeFileSync(join(repo, "pkg/odd\nname.js"), "odd\n");
  symlinkSync("gen/out.js", join(repo, "pkg/link"));
  git("add", "-A");
  git("commit", "-qm", "base");
  return repo;
}

test("Given a clean checkout with a dangling link and a newline in a name, then nothing differs from HEAD", (t) => {
  assert.deepEqual(closure.headMismatches(headRepo(t), ["pkg"]), []);
});

test("Given bytes git's hashing filters would normalise, then they still differ from HEAD", (t) => {
  const repo = headRepo(t);
  writeFileSync(join(repo, "pkg/a.js"), "one\r\ntwo\r\n");
  assert.deepEqual(closure.headMismatches(repo, ["pkg"]), ["pkg/a.js"]);
});

test("F5: Given a mode npm would pack other than 644 or 755, then it differs from HEAD", (t) => {
  const repo = headRepo(t);
  for (const mode of [0o654, 0o600, 0o744, 0o4644, 0o2644]) {
    chmodSync(join(repo, "pkg/b.js"), mode);
    assert.deepEqual(closure.headMismatches(repo, ["pkg"]), ["pkg/b.js"], mode.toString(8));
  }
  // tar's portable mode drops group and other write, so a umask 002 checkout packs the same.
  for (const mode of [0o664, 0o644]) {
    chmodSync(join(repo, "pkg/b.js"), mode);
    assert.deepEqual(closure.headMismatches(repo, ["pkg"]), [], mode.toString(8));
  }
});

test("Given a tracked link replaced by a file with the link's bytes, then it differs from HEAD", (t) => {
  const repo = headRepo(t);
  unlinkSync(join(repo, "pkg/link"));
  writeFileSync(join(repo, "pkg/link"), "gen/out.js");
  assert.deepEqual(closure.headMismatches(repo, ["pkg"]), ["pkg/link"]);
});

test("F2: Given a replacement ref for HEAD, then bytes still compare with the recorded commit", (t) => {
  const repo = headRepo(t);
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
      { cwd: repo, encoding: "utf8" },
    ).trim();
  const recorded = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "pkg/a.js"), "not at the recorded commit\n");
  git("commit", "-qam", "replacement");
  const replacement = git("rev-parse", "HEAD");
  git("update-ref", "HEAD", recorded);
  git("replace", recorded, replacement);
  assert.equal(git("status", "--porcelain"), "");
  assert.deepEqual(closure.headMismatches(repo, ["pkg"]), ["pkg/a.js"]);
});

test("Given a commit other than HEAD, then the comparison is against that commit", (t) => {
  const repo = headRepo(t);
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
      { cwd: repo, encoding: "utf8" },
    ).trim();
  const recorded = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "pkg/a.js"), "after the recorded commit\n");
  git("commit", "-qam", "later");
  assert.deepEqual(closure.headMismatches(repo, ["pkg"]), []);
  assert.deepEqual(closure.headMismatches(repo, ["pkg"], recorded), ["pkg/a.js"]);
});

test("Given an inherited GIT_DIR naming another repository, then HEAD is still this one", (t) => {
  const repo = headRepo(t);
  const other = headRepo(t);
  writeFileSync(join(other, "pkg/a.js"), "another repository\n");
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "other"], {
    cwd: other,
  });
  const module = new URL("../task-session-runtime/closure.mjs", import.meta.url).href;
  const run = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { headMismatches } from ${JSON.stringify(module)};
       process.stdout.write(JSON.stringify(headMismatches(${JSON.stringify(repo)}, ["pkg"])));`,
    ],
    { encoding: "utf8", env: { ...process.env, GIT_DIR: join(other, ".git") } },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), []);
});

test("Given an own package pinning an overridden package above the override, then the override is stale", () => {
  const lock = lockFixture();
  lock.packages["node_modules/undici"] = entry("undici", "8.12.3");
  const own = [["@tryinget/pi-little-helpers", { dependencies: { undici: "9.0.0" } }]];
  assert.throws(
    () => closure.assertOverridesCurrent(lock, { overrides: { undici: "8.12.3" } }, own),
    /lock_override_stale/,
  );
});

// F1: npm's registry-host substitution and an inherited config must not move the one locked fetch.
const unshareWorks = spawnSync("unshare", ["-rn", "true"]).status === 0;
test(
  "F1: Given an inherited npm registry, when fetching the locked closure, then npm still asks the public registry",
  { skip: !unshareWorks && "unshare -rn is unavailable" },
  (t) => {
    const root = mkdtempSync(join(tmpdir(), "task-session-fetch-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const [lockDir, directory, cache] = ["lock", "fetch", "cache"].map((name) => join(root, name));
    for (const dir of [lockDir, directory, cache]) mkdirSync(dir);
    const real = closure.readLock();
    const pin = real.packages["node_modules/balanced-match"];
    const manifest = {
      name: "fetch-probe",
      version: "1.0.0",
      dependencies: { "balanced-match": pin.version },
    };
    writeFileSync(join(lockDir, "runtime-package.json"), JSON.stringify(manifest));
    writeFileSync(
      join(lockDir, "runtime.lock"),
      JSON.stringify({
        name: manifest.name,
        version: "1.0.0",
        lockfileVersion: 3,
        packages: { "": manifest, "node_modules/balanced-match": pin },
      }),
    );
    // Record every request npm builds, then stop it before any connection; the network is unshared too.
    // The probe enters through an npm shim on PATH, which isolation keeps, not through NODE_OPTIONS.
    const requests = join(root, "requests.jsonl");
    const probe = join(root, "probe.cjs");
    writeFileSync(
      probe,
      `const fs = require("node:fs");
       for (const name of ["http", "https"]) {
         const mod = require("node:" + name);
         mod.request = (arg) => {
           const url = typeof arg === "string" || arg instanceof URL ? new URL(arg) : { host: arg.host ?? arg.hostname, pathname: arg.path };
           fs.appendFileSync(${JSON.stringify(requests)}, JSON.stringify({ host: url.host, path: url.pathname }) + "\\n");
           throw new Error("probe: no network");
         };
       }`,
    );
    const npmCli = realpathSync(
      execFileSync("sh", ["-c", "command -v npm"], { encoding: "utf8" }).trim(),
    );
    const shim = join(root, "bin");
    mkdirSync(shim);
    writeFileSync(
      join(shim, "npm"),
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} --require ${JSON.stringify(probe)} ${JSON.stringify(npmCli)} "$@"\n`,
      { mode: 0o755 },
    );
    // An inherited preload must not reach npm at all.
    const preloaded = join(root, "preloaded");
    const hostile = join(root, "hostile.cjs");
    writeFileSync(
      hostile,
      `require("node:fs").writeFileSync(${JSON.stringify(preloaded)}, "loaded");`,
    );
    const userconfig = join(root, "npmrc");
    writeFileSync(userconfig, "registry=https://user-config.invalid/\n");
    const module = new URL("../task-session-runtime/closure.mjs", import.meta.url).href;
    const run = spawnSync(
      "unshare",
      [
        "-rn",
        process.execPath,
        "--input-type=module",
        "-e",
        `process.env.NODE_OPTIONS = ${JSON.stringify(`--require ${hostile}`)};
         const { fetchLockedClosure } = await import(${JSON.stringify(module)});
         fetchLockedClosure(${JSON.stringify({ lockDir, directory, cache })});`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${shim}:${process.env.PATH}`,
          npm_config_registry: "https://inherited.invalid/",
          NPM_CONFIG_USERCONFIG: userconfig,
          npm_config_update_notifier: "true",
        },
      },
    );
    assert.notEqual(run.status, 0, "the probe stops every request");
    assert.ok(existsSync(requests), run.stderr);
    const seen = readFileSync(requests, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(seen.length > 0, run.stderr);
    for (const { host, path } of seen) {
      assert.equal(host, "registry.npmjs.org", path);
      assert.notEqual(path, "/npm", "no update-notifier request");
    }
    assert.equal(existsSync(preloaded), false, "inherited NODE_OPTIONS reached npm");
  },
);

// R2: npm follows a redirect to any host, so the online step may connect only to the registry. The probe
// answers the registry's request with a 302 and hands the redirected one to the real network code.
test(
  "R2: Given the registry redirects a locked tarball to another host, then npm is refused before it connects",
  { skip: !unshareWorks && "unshare -rn is unavailable" },
  (t) => {
    const root = mkdtempSync(join(tmpdir(), "task-session-egress-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const [lockDir, directory, cache] = ["lock", "fetch", "cache"].map((name) => join(root, name));
    for (const dir of [lockDir, directory, cache]) mkdirSync(dir);
    const pin = closure.readLock().packages["node_modules/balanced-match"];
    const manifest = {
      name: "egress-probe",
      version: "1.0.0",
      dependencies: { "balanced-match": pin.version },
    };
    writeFileSync(join(lockDir, "runtime-package.json"), JSON.stringify(manifest));
    writeFileSync(
      join(lockDir, "runtime.lock"),
      JSON.stringify({
        name: manifest.name,
        version: "1.0.0",
        lockfileVersion: 3,
        packages: { "": manifest, "node_modules/balanced-match": pin },
      }),
    );
    const requests = join(root, "requests.jsonl");
    const probe = join(root, "redirect.cjs");
    writeFileSync(
      probe,
      `const fs = require("node:fs");
       const { Writable, PassThrough } = require("node:stream");
       for (const name of ["http", "https"]) {
         const mod = require("node:" + name);
         const original = mod.request;
         mod.request = function (arg, ...rest) {
           const url = typeof arg === "string" || arg instanceof URL ? new URL(arg) : { hostname: arg.hostname || arg.host };
           fs.appendFileSync(${JSON.stringify(requests)}, JSON.stringify({ host: url.hostname }) + "\\n");
           if (url.hostname !== "registry.npmjs.org") return original.call(this, arg, ...rest);
           const request = new Writable({
             write(chunk, encoding, done) { done(); },
             final(done) {
               process.nextTick(() => {
                 const response = new PassThrough();
                 Object.assign(response, { statusCode: 302, statusMessage: "Found", trailers: {},
                   headers: { location: "https://redirect-outside.invalid/package.tgz" } });
                 request.emit("response", response);
                 response.end();
               });
               done();
             },
           });
           request.abort = () => {};
           return request;
         };
       }`,
    );
    const npmCli = realpathSync(
      execFileSync("sh", ["-c", "command -v npm"], { encoding: "utf8" }).trim(),
    );
    const shim = join(root, "bin");
    mkdirSync(shim);
    writeFileSync(
      join(shim, "npm"),
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} --require ${JSON.stringify(probe)} ${JSON.stringify(npmCli)} "$@" --fetch-retries=0\n`,
      { mode: 0o755 },
    );
    const module = new URL("../task-session-runtime/closure.mjs", import.meta.url).href;
    const run = spawnSync(
      "unshare",
      [
        "-rn",
        process.execPath,
        "--input-type=module",
        "-e",
        `const { fetchLockedClosure } = await import(${JSON.stringify(module)});
         try { fetchLockedClosure(${JSON.stringify({ lockDir, directory, cache })}); }
         catch (error) { process.stderr.write(String(error.stderr)); process.exit(3); }`,
      ],
      {
        encoding: "utf8",
        timeout: 120_000,
        env: { ...process.env, PATH: `${shim}:${process.env.PATH}` },
      },
    );
    assert.equal(run.status, 3, run.stderr);
    const hosts = readFileSync(requests, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).host);
    assert.deepEqual(hosts.slice(0, 2), ["registry.npmjs.org", "redirect-outside.invalid"]);
    const logs = join(cache, "_logs");
    const said = [
      run.stderr,
      ...(existsSync(logs) ? readdirSync(logs) : []).map((name) =>
        readFileSync(join(logs, name), "utf8"),
      ),
    ].join("\n");
    assert.match(said, /task_session_egress_refused: redirect-outside\.invalid/);
  },
);

test("V2: Given proxy or npm-read variables in any case, then npm sees none of them", () => {
  const names = ["Https_proxy", "proxy", "PROXY", "No_Proxy", "Node_Env", "prefix"];
  const saved = names.map((name) => [name, process.env[name]]);
  try {
    for (const name of names) process.env[name] = "http://proxy.invalid:3128";
    const { env } = closure.isolatedNpm([], { online: true });
    for (const name of names) assert.equal(env[name], undefined, name);
  } finally {
    for (const [name, value] of saved)
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});
