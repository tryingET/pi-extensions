// Real task-session installs into scratch --root and --bin-dir: one locked fetch, offline packing and
// installing under `unshare -rn`, then the host's own identity checks (AK7845, AK7824).
// Never touches the default host: every run passes both directories. Needs a clean linked worktree.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LOCK_DIR, SDK_VERSION } from "../../task-session-runtime/closure.mjs";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const installer = join(packageRoot, "scripts/task-session-install.mjs");
const liveSurfaces = [
  join(homedir(), ".local/libexec/pi-task-sessions/host-v1"),
  join(homedir(), ".local/libexec/pi-task-sessions/view-v1"),
  join(homedir(), ".local/bin/pi-task-session"),
];
const git = (...args) => execFileSync("git", args, { cwd: packageRoot, encoding: "utf8" }).trim();
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

function environmentRefusal() {
  if (spawnSync("unshare", ["-rn", "true"]).status !== 0) return "unshare -rn is unavailable";
  if (
    git("rev-parse", "--absolute-git-dir") ===
    git("rev-parse", "--path-format=absolute", "--git-common-dir")
  )
    return "needs a linked worktree";
  if (git("status", "--porcelain", "--", "../..")) return "needs a clean worktree";
  return false;
}
const skip = environmentRefusal();
const scratch = skip
  ? ""
  : mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "task-session-install-"));
const cache = join(scratch, "cache");
const fingerprint = () => liveSurfaces.map((path) => (existsSync(path) ? sha256(path) : null));
const liveBefore = skip ? [] : fingerprint();

function install(label, ...extra) {
  // The actual launcher must preserve a literal path, not split it or parse its apostrophe.
  const root = join(scratch, label, "root with space and ' quote");
  const bin = join(scratch, label, "bin with space and ' quote");
  mkdirSync(root, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [installer, "--root", root, "--bin-dir", bin, "--cache", cache, ...extra],
    { cwd: packageRoot, encoding: "utf8", timeout: 240_000 },
  );
  return {
    ...result,
    root,
    bin,
    receipt: result.status === 0 ? JSON.parse(result.stdout) : undefined,
  };
}
const runtimes = (root) =>
  readdirSync(join(root, "runtime")).filter((entry) => !entry.startsWith("."));
const contentPath = (integrity) => {
  const hex = Buffer.from(integrity.slice("sha512-".length), "base64").toString("hex");
  return join(cache, "_cacache/content-v2/sha512", hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
};
function lockFixture(label, change) {
  const dir = join(scratch, label, "lock");
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(LOCK_DIR, "runtime-package.json"), join(dir, "runtime-package.json"));
  const lock = JSON.parse(readFileSync(join(LOCK_DIR, "runtime.lock"), "utf8"));
  change(lock);
  writeFileSync(join(dir, "runtime.lock"), JSON.stringify(lock));
  return dir;
}

test("task-session installer, real installs in scratch", { skip }, async (t) => {
  t.after(() => {
    if (process.env.AK7845_KEEP_SCRATCH === "1") return;
    rmSync(scratch, { recursive: true, force: true });
  });

  const first = install("first");
  await t.test(
    "Given the committed lock, when installing, then the runtime is on the SDK and own tarballs",
    () => {
      assert.equal(first.status, 0, first.stderr);
      assert.equal(first.receipt.sdk, SDK_VERSION);
      const runtime = first.receipt.runtime;
      const hidden = JSON.parse(
        readFileSync(join(runtime, "node_modules/.package-lock.json"), "utf8"),
      );
      const entries = Object.entries(hidden.packages).filter(([path]) => path);
      // By the installed name: third-party packages also nest under pi-coding-agent/node_modules.
      const scoped = (scope) =>
        entries.filter(([path]) => path.split("node_modules/").at(-1).startsWith(`${scope}/`));
      // (a) No companion can sit beside the SDK at another version.
      assert.ok(scoped("@earendil-works").length >= 7);
      for (const [path, entry] of scoped("@earendil-works"))
        assert.equal(entry.version, SDK_VERSION, path);
      // The override reached the runtime, not only the lock (AK8113).
      const { overrides } = JSON.parse(
        readFileSync(join(LOCK_DIR, "runtime-package.json"), "utf8"),
      );
      for (const [name, version] of Object.entries(overrides))
        assert.equal(hidden.packages[`node_modules/${name}`].version, version, name);
      // (c) Own code comes from the tarballs packed here, never the registry.
      assert.ok(scoped("@tryinget").length >= 11);
      for (const [path, entry] of scoped("@tryinget")) assert.match(entry.resolved, /^file:/, path);
      assert.equal(
        JSON.parse(readFileSync(join(runtime, "closure.json"), "utf8")).closure_digest,
        first.receipt.closure_digest,
      );
    },
  );

  await t.test("Given the installed launchers, then the CLI answers from the new runtime", () => {
    const launcher = readFileSync(join(first.bin, "pi-task-session"), "utf8");
    const identity = spawnSync(join(first.bin, "pi-task-session"), ["identity"], {
      encoding: "utf8",
    });
    // Actual launcher execution is the failure oracle, before any source-format assertion.
    assert.equal(identity.status, 0, identity.stderr);
    // The launcher contains a shell-encoded path, not the raw apostrophe from the receipt.
    assert.ok(launcher.includes(first.receipt.runtime.replaceAll("'", "'\\''")));
  });

  await t.test(
    "(e) Given the installed SDK, then the Codex model still fits the native boundary",
    () => {
      const dist = join(
        first.receipt.runtime,
        "node_modules/@tryinget/pi-little-helpers/dist/task-session",
      );
      const script = `
      import { assertSdkIdentity } from ${JSON.stringify(join(dist, "identity.js"))};
      import { nativeModelBoundary, modelResolution } from ${JSON.stringify(join(dist, "model-source.js"))};
      assertSdkIdentity();
      const { getModel } = await import(${JSON.stringify(join(first.receipt.runtime, "node_modules/@earendil-works/pi-ai/dist/compat.js"))});
      const model = getModel("openai-codex", "gpt-6.1-sol");
      nativeModelBoundary(model);
      const resolved = modelResolution(model, { provider: "openai-codex", model: model.id, account: "synthetic" }, null);
      process.stdout.write(resolved.implementation);`;
      const probe = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: first.receipt.runtime,
        encoding: "utf8",
      });
      assert.equal(probe.status, 0, probe.stderr);
      assert.equal(probe.stdout, "pinned-native-codex-sse-v1");
    },
  );

  await t.test(
    "(b) Given a complete private cache, when installing with no fetch, then it succeeds offline",
    () => {
      const offline = install("offline", "--no-fetch");
      assert.equal(offline.status, 0, offline.stderr);
      assert.equal(offline.receipt.closure_digest, first.receipt.closure_digest);
    },
  );

  await t.test(
    "(d) Given the same closure again, when installing, then the runtime is reused",
    () => {
      const again = install("first", "--no-fetch");
      assert.equal(again.status, 0, again.stderr);
      assert.equal(again.receipt.runtime, first.receipt.runtime);
      assert.equal(again.receipt.reused, true);
      assert.equal(runtimes(first.root).length, 1);
    },
  );

  await t.test(
    "(d) Given only an own dependency changed, when installing, then it is not dropped",
    (s) => {
      const readme = join(packageRoot, "../pi-society-orchestrator/README.md");
      const original = readFileSync(readme);
      s.after(() => writeFileSync(readme, original));
      appendFileSync(readme, "\n<!-- AK7824 closure-only change -->\n");
      const changed = install("first", "--no-fetch", "--allow-dirty");
      assert.equal(changed.status, 0, changed.stderr);
      assert.equal(changed.receipt.host_build_digest, first.receipt.host_build_digest);
      assert.notEqual(changed.receipt.closure_digest, first.receipt.closure_digest);
      assert.notEqual(changed.receipt.runtime, first.receipt.runtime);
      assert.equal(changed.receipt.reused, false);
      assert.equal(runtimes(first.root).length, 2);
      const installed = join(
        changed.receipt.runtime,
        "node_modules/@tryinget/pi-society-orchestrator/README.md",
      );
      assert.match(readFileSync(installed, "utf8"), /AK7824 closure-only change/);
    },
  );

  await t.test(
    "(c) Given a @tryinget entry from the registry, then the install refuses before fetching",
    () => {
      const lockDir = lockFixture("registry-own", (lock) => {
        lock.packages["node_modules/@tryinget/pi-telemetry"] = {
          version: "0.4.2",
          resolved: "https://registry.npmjs.org/@tryinget/pi-telemetry/-/pi-telemetry-0.4.2.tgz",
          integrity: "sha512-AAAA",
        };
      });
      const refused = install("registry-own", "--lock-dir", lockDir);
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /lock_own_package_forbidden/);
      assert.equal(existsSync(join(refused.root, "host-v1")), false);
    },
  );

  await t.test("(a) Given a drifted companion in the lock, then the install refuses", () => {
    const lockDir = lockFixture("drift", (lock) => {
      lock.packages["node_modules/@earendil-works/pi-mcp"].version = "1.2.0";
    });
    const refused = install("drift", "--lock-dir", lockDir);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /lock_companion_drift/);
  });

  await t.test("Given a lock outside the commit, then the install counts it as dirty", () => {
    const lockDir = lockFixture("outside-lock", () => {});
    const refused = install("outside-lock", "--lock-dir", lockDir, "--no-fetch");
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /source not clean/);
    assert.equal(existsSync(join(refused.root, "host-v1")), false);
  });

  await t.test(
    "Given a damaged runtime, when it would be reused, then launchers do not move",
    () => {
      const before = sha256(join(first.root, "host-v1"));
      const manifest = join(
        first.receipt.runtime,
        "node_modules/@earendil-works/pi-ai/package.json",
      );
      appendFileSync(manifest, "\n");
      const refused = install("first", "--no-fetch");
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /sdk_resolution_metadata_unsupported/);
      assert.equal(sha256(join(first.root, "host-v1")), before);
    },
  );

  // Last, because it damages the shared private cache.
  await t.test(
    "(b) Given a tarball missing from the cache, when offline, then the install fails closed",
    () => {
      const lock = JSON.parse(readFileSync(join(LOCK_DIR, "runtime.lock"), "utf8"));
      const target = contentPath(lock.packages["node_modules/@earendil-works/pi-mcp"].integrity);
      assert.ok(existsSync(target), target);
      rmSync(target);
      const broken = install("missing", "--no-fetch");
      assert.notEqual(broken.status, 0);
      assert.match(broken.stderr, /ENOTCACHED|ENOENT|EINTEGRITY|offline/i);
      assert.equal(existsSync(join(broken.root, "host-v1")), false);
      assert.deepEqual(runtimes(broken.root), []);
    },
  );

  await t.test("Given every run above, then no default host path was touched", () => {
    assert.deepEqual(fingerprint(), liveBefore);
  });
});
