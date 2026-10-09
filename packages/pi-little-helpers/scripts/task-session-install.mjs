#!/usr/bin/env node
// Install the Decision 151 Pi task-session host from this checkout (AK5480).
//
//   node scripts/task-session-install.mjs [--root DIR] [--bin-dir DIR] [--allow-dirty]
//
// Lays out <root>/runtime/<host build digest>/ as a packed consumer install (the audited
// pack-proof recipe: this package and pi-society-orchestrator packed, SDK 1.1.0, --omit=dev,
// --ignore-scripts), then replaces the fixed launchers <root>/host-v1 and <root>/view-v1 and
// <bin-dir>/pi-task-session. Defaults: ~/.local/libexec/pi-task-sessions and ~/.local/bin.
//
// Installation is not enrollment: nothing runs the host until AK publishes a task_session
// policy section and the owner publishes producer.json (AK6744). Earlier runtimes are kept;
// roll back by installing again from the earlier commit. Prints one JSON receipt.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SDK_VERSION = "1.1.0";
const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function option(name, fallback) {
  const at = args.indexOf(name);
  if (at === -1) return fallback;
  const value = args[at + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  args.splice(at, 2);
  return resolve(value);
}
const root = option("--root", join(homedir(), ".local/libexec/pi-task-sessions"));
const binDir = option("--bin-dir", join(homedir(), ".local/bin"));
const allowDirty = args.includes("--allow-dirty");
if (args.filter((a) => a !== "--allow-dirty").length) throw new Error(`unknown arguments: ${args}`);

const run = (cmd, argv, cwd) =>
  execFileSync(cmd, argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

// Installed artifacts come from committed source, never from a dirty tree (D151 rollout G1).
const repo = run("git", ["rev-parse", "--show-toplevel"], pkg).trim();
const commit = run("git", ["rev-parse", "HEAD"], repo).trim();
const dirty = run(
  "git",
  ["status", "--porcelain", "--", "packages/pi-little-helpers", "packages/pi-society-orchestrator"],
  repo,
).trim();
if (dirty && !allowDirty) throw new Error(`source not clean; commit first:\n${dirty}`);

mkdirSync(join(root, "runtime"), { recursive: true, mode: 0o755 });
const staging = mkdtempSync(join(root, "runtime", ".staging-"));
try {
  const packed = [pkg, join(pkg, "../pi-society-orchestrator")].map((dir) => {
    // npm 11 keys `pack --json` by package; older npm returned an array. Accept both.
    const [result] = Object.values(
      JSON.parse(run("npm", ["pack", "--json", "--pack-destination", staging], dir)),
    );
    return join(staging, result.filename);
  });
  writeFileSync(
    join(staging, "package.json"),
    `${JSON.stringify({ name: "pi-task-session-runtime", private: true, type: "module" })}\n`,
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      ...packed,
      // All four SDK packages the host identity pins; pi 1.x declares its companions as ^ ranges.
      ...["pi-coding-agent", "pi-ai", "pi-agent-core", "pi-tui"].map(
        (n) => `@earendil-works/${n}@${SDK_VERSION}`,
      ),
    ],
    staging,
  );
  const closure = join(staging, "node_modules/@tryinget/pi-little-helpers/dist/task-session");
  // The host checks both itself at every start; check them before anything points here.
  const buildDigest = run(
    "/usr/bin/node",
    [
      "--input-type=module",
      "-e",
      `import { installedHostBuild } from ${JSON.stringify(join(closure, "build-identity.js"))};
       import { assertSdkIdentity } from ${JSON.stringify(join(closure, "identity.js"))};
       assertSdkIdentity(); process.stdout.write(installedHostBuild());`,
    ],
    staging,
  ).trim();
  if (!/^[0-9a-f]{64}$/.test(buildDigest)) throw new Error("host build digest unavailable");
  const runtime = join(root, "runtime", buildDigest);
  if (existsSync(runtime)) rmSync(staging, { recursive: true, force: true });
  else renameSync(staging, runtime);
  const entry = join(runtime, "node_modules/@tryinget/pi-little-helpers/dist/task-session");

  const launcher = (path, script, passArgs) => {
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(
      temporary,
      `#!/bin/sh\n# Decision 151 Pi task-session ${script}, build ${buildDigest}, ${commit}\n` +
        `exec /usr/bin/node ${join(entry, script)}${passArgs ? ' "$@"' : ""}\n`,
      { mode: 0o755 },
    );
    chmodSync(temporary, 0o755);
    renameSync(temporary, path);
    return sha256(path);
  };
  mkdirSync(binDir, { recursive: true });
  const receipt = {
    schema: "pi.task-session.install.v1",
    commit,
    dirty: Boolean(dirty),
    sdk: SDK_VERSION,
    runtime,
    host_build_digest: buildDigest,
    host: {
      path: join(root, "host-v1"),
      sha256: launcher(join(root, "host-v1"), "host-v1", false),
    },
    view: { path: join(root, "view-v1"), sha256: launcher(join(root, "view-v1"), "view-v1", true) },
    cli: {
      path: join(binDir, "pi-task-session"),
      sha256: launcher(join(binDir, "pi-task-session"), "bin.js", true),
    },
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
