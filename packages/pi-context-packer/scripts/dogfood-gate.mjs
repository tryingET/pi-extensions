#!/usr/bin/env node
/** Verify an exact candidate and retain a SHA-bound receipt outside the repository. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i],
    value = process.argv[i + 1];
  if (!["--gate", "--candidate-sha", "--output-dir"].includes(key) || !value || flags.has(key))
    throw new Error("Invalid gate arguments");
  flags.set(key, value);
}
if (
  flags.size !== 3 ||
  ![
    "RW-01",
    "RW-02",
    "RW-03",
    "RW-04",
    "RW-05",
    "RW-06",
    "RW-07",
    "RW-08",
    "RW-09",
    "RW-10",
  ].includes(flags.get("--gate")) ||
  !/^[a-f0-9]{40}$/u.test(flags.get("--candidate-sha"))
)
  throw new Error(
    "Expected --gate RW-01 through RW-10 --candidate-sha SHA --output-dir EXTERNAL_DIR",
  );
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const head = git("rev-parse", "HEAD");
if (head !== flags.get("--candidate-sha") || git("status", "--porcelain"))
  throw new Error("Exact clean candidate required");
const repo = realpathSync(git("rev-parse", "--show-toplevel"));
const output = resolve(flags.get("--output-dir"));
let parent = output;
while (!existsSync(parent)) parent = dirname(parent);
if (realpathSync(parent) !== parent) throw new Error("Evidence path contains a symlink");
const rel = relative(repo, output);
if (!rel || (!rel.startsWith("../") && !isAbsolute(rel)))
  throw new Error("Evidence must be outside the repository");
mkdirSync(output, { recursive: true, mode: 0o700 });
const scratch = mkdtempSync(join(tmpdir(), "context-gate-"));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const receipt = {
  schema: "pi.context-packer.gate-receipt.v1",
  gate: flags.get("--gate"),
  candidate: {
    headSha: head,
    baseSha: git("rev-parse", "HEAD^"),
    treeSha: git("rev-parse", "HEAD^{tree}"),
  },
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  verifier: {
    type: "isolated-reexecution",
    independentAuthorship: false,
    modelTaskBenchmark: false,
  },
  startedAt: new Date().toISOString(),
  checks: [],
  verdict: "BLOCKED",
};
const run = (name, command, args, options = {}) => {
  const start = Date.now();
  const child = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  const text = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  const status =
    child.error?.code === "ENOENT"
      ? "BLOCKED"
      : child.status === 0 && !child.error
        ? "PASS"
        : "FAIL";
  receipt.checks.push({ name, status, durationMs: Date.now() - start, outputSha256: sha256(text) });
  if (status !== "PASS") throw new Error(`${name} ${status}`);
  return name === "registered-pi-runtime" ? text : child.stdout;
};
try {
  run(
    "canonical-pre-push",
    "bash",
    [join(repo, "scripts/package-quality-gate.sh"), "pre-push", "packages/pi-context-packer"],
    { cwd: repo },
  );
  if (Number(flags.get("--gate").slice(3)) >= 3 && !process.env.PI_CONTEXT_PACKER_RIPWIRE_BIN) {
    receipt.checks.push({
      name: "ripwire-prerequisite",
      status: "BLOCKED",
      reason: "binary_not_configured",
    });
    throw new Error("Ripwire binary required");
  }
  const packOutput = run("pack", "npm", [
    "pack",
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    scratch,
  ]);
  // The source-checkout gate already depends on canonical root tooling. Reuse its
  // strict npm 10/11 array and npm 12 package-keyed object parser, not a second dialect.
  const packed = JSON.parse(
    run("normalize-pack", process.execPath, [join(repo, "scripts/npm-pack-json.mjs")], {
      input: packOutput,
    }),
  );
  const archive = join(scratch, packed[0].filename);
  receipt.candidate.artifactSha256 = sha256(readFileSync(archive));
  run("extract", "tar", ["-xzf", archive, "-C", scratch]);
  const installed = join(scratch, "package");
  const modules = realpathSync(join(root, "node_modules"));
  symlinkSync(modules, join(installed, "node_modules"), "dir");
  receipt.environment.dependencyMode = "provisioned-package-dependencies-reused";
  receipt.scenario = JSON.parse(
    run(
      "packed-api-scenario",
      process.execPath,
      [join(installed, "scripts/dogfood-scenarios.mjs"), flags.get("--gate")],
      { cwd: scratch },
    ),
  );
  const agent = join(scratch, "agent");
  mkdirSync(agent, { mode: 0o700 });
  writeFileSync(join(agent, "settings.json"), JSON.stringify({ packages: [installed] }), {
    mode: 0o600,
  });
  const pi = join(modules, "@earendil-works/pi-coding-agent/dist/cli.js");
  if (!existsSync(pi)) {
    receipt.checks.push({ name: "registered-pi-runtime", status: "BLOCKED", reason: "missing_pi" });
  } else {
    const text = run(
      "registered-pi-runtime",
      process.execPath,
      [
        pi,
        "--offline",
        "--no-session",
        "--no-builtin-tools",
        "--no-skills",
        "--no-prompt-templates",
        "--no-context-files",
        "--no-themes",
        "-p",
        "/context-packer-release-smoke",
      ],
      {
        cwd: scratch,
        env: {
          PATH: process.env.PATH,
          HOME: scratch,
          TMPDIR: scratch,
          PI_CODING_AGENT_DIR: agent,
          NPM_CONFIG_PREFIX: join(scratch, "npm"),
          INSTALLED_PACKAGE_ROOT: installed,
          NO_COLOR: "1",
          PI_CONTEXT_PACKER_DOGFOOD_GATE: flags.get("--gate"),
          PI_CONTEXT_PACKER_RIPWIRE_BIN: process.env.PI_CONTEXT_PACKER_RIPWIRE_BIN,
          PI_CONTEXT_PACKER_RIPWIRE_SHA256: process.env.PI_CONTEXT_PACKER_RIPWIRE_SHA256,
        },
      },
    );
    if (
      !text.includes("context-packer runtime registration and registered tool closure execution OK")
    )
      throw new Error("Runtime marker absent");
    if (
      Number(flags.get("--gate").slice(3)) >= 4 &&
      !text.includes("ripwire registered discovery PASS")
    )
      throw new Error("Ripwire registered execution marker absent");
    if (
      Number(flags.get("--gate").slice(3)) >= 5 &&
      !text.includes("ripwire registered expansion PASS")
    )
      throw new Error("Ripwire expansion marker absent");
    if (
      Number(flags.get("--gate").slice(3)) >= 6 &&
      !text.includes("ripwire registered cache PASS")
    )
      throw new Error("Cache runtime marker absent");
    if (
      Number(flags.get("--gate").slice(3)) >= 7 &&
      !text.includes("ripwire registered working set PASS")
    )
      throw new Error("Working set runtime marker absent");
    if (
      Number(flags.get("--gate").slice(3)) >= 9 &&
      !text.includes("ripwire registered rollout gate PASS")
    )
      throw new Error("Rollout runtime marker absent");
    if (
      Number(flags.get("--gate").slice(3)) >= 10 &&
      !text.includes("ripwire registered landing regressions PASS")
    )
      throw new Error("Landing runtime marker absent");
  }
} catch (error) {
  if (!receipt.checks.some((check) => check.status !== "PASS"))
    receipt.checks.push({ name: "runner", status: "FAIL", reason: "contract_assertion_failed" });
  console.error(error.message);
} finally {
  receipt.verdict = receipt.checks.some((check) => check.status === "FAIL")
    ? "FAIL"
    : receipt.checks.some((check) => check.status === "BLOCKED")
      ? "BLOCKED"
      : "PASS";
  receipt.finishedAt = new Date().toISOString();
  const name = `${receipt.gate}-${head}-${Date.now()}.json`;
  writeFileSync(join(output, name), `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  rmSync(scratch, { recursive: true, force: true });
  console.log(JSON.stringify({ verdict: receipt.verdict, receipt: name }));
  process.exitCode = receipt.verdict === "PASS" ? 0 : receipt.verdict === "BLOCKED" ? 2 : 1;
}
