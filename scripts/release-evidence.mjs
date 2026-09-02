#!/usr/bin/env node
/**
 * Release-PR visual evidence chain for the pi-extensions monorepo.
 *
 * capture (VHS tapes under tapes/<package>/) -> publish (gh --attach) -> record (AK evidence).
 * Conventions: tapes/CONVENTIONS.md
 * Enforcement: .github/workflows/release-check.yml (require-release-evidence job).
 *
 * Usage:
 *   node scripts/release-evidence.mjs --pr 180 [--package pi-agent-registry]...
 *        [--base origin/main] [--task 5311] [--record] [--dry-run]
 *   node scripts/release-evidence.mjs --issue 42 [same flags]
 *
 * --pr and --issue are mutually exclusive; exactly one is required.
 * --record additionally writes an AK evidence receipt (requires --task).
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import process from "node:process";

export const EVIDENCE_MARKER = "<!-- release-evidence -->";
export const MIN_GH = { major: 2, minor: 99 };

/** Parse `gh --version` stdout into {major, minor, patch}; null when unparseable. */
export function parseGhVersion(text) {
  const match = /gh version (\d+)\.(\d+)\.(\d+)/.exec(String(text ?? ""));
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function ghMeetsMinimum(parsed) {
  if (!parsed) return false;
  if (parsed.major !== MIN_GH.major) return parsed.major > MIN_GH.major;
  return parsed.minor >= MIN_GH.minor;
}

/** Package names under tapesRoot that contain at least one *.tape file. */
export function discoverPackages(tapesRoot, { readdirSync: rd = readdirSync } = {}) {
  if (!existsSync(tapesRoot)) return [];
  return rd(tapesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "out")
    .map((entry) => entry.name)
    .filter((name) => rd(join(tapesRoot, name)).some((f) => f.endsWith(".tape")))
    .sort();
}

/** Expected gif path for a tape, per conventions: <tapeDir>/out/<stem>.gif */
export function expectedGifFor(tapePath) {
  const dir = tapePath.slice(0, tapePath.lastIndexOf("/"));
  const stem = basename(tapePath).replace(/\.tape$/, "");
  return join(dir, "out", `${stem}.gif`);
}

/**
 * Build the evidence comment body. Items carry repo-relative gif paths that are
 * also passed to --attach, so gh rewrites the inline refs to uploaded URLs and
 * keeps the alt text written here.
 */
export function buildEvidenceBody({ items, baseRef, headRef, headSha, generatedAt, command }) {
  const lines = [
    EVIDENCE_MARKER,
    "",
    "## Release evidence — VHS tapes",
    "",
    "| package | tape | shows |",
    "| --- | --- | --- |",
  ];
  for (const item of items) {
    lines.push(`| ${item.pkg} | ${basename(item.gif)} | ${item.alt.split(" — ")[1] ?? item.alt} |`);
  }
  lines.push("");
  for (const item of items) {
    lines.push(`![${item.alt}](${item.gif})`);
    lines.push("");
  }
  if (baseRef) lines.push(`- before half rendered from \`${baseRef}\` via temporary worktree`);
  lines.push(`- head: \`${headRef}${headSha ? ` (${headSha})` : ""}\``);
  lines.push(`- generated: ${generatedAt}`);
  lines.push(`- chain: \`${command}\` — conventions in \`tapes/CONVENTIONS.md\``);
  lines.push("");
  return lines.join("\n");
}

/** Flat gh argument vector for attachments: ["--attach", "<gif>#<alt>", ...] */
export function buildGhAttachArgs(items) {
  const args = [];
  for (const item of items) args.push("--attach", `${item.gif}#${item.alt}`);
  return args;
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (result.error) throw new Error(`${cmd}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (exit ${result.status}):\n${result.stderr ?? ""}`);
  }
  return result.stdout;
}

function renderPackageTapes(repoRoot, pkg, { baseLabel } = {}) {
  const pkgTapesDir = join(repoRoot, "tapes", pkg);
  const tapes = readdirSync(pkgTapesDir).filter((f) => f.endsWith(".tape")).sort();
  const items = [];
  for (const tape of tapes) {
    run("vhs", [tape], { cwd: pkgTapesDir });
    const gifAbs = expectedGifFor(join(pkgTapesDir, tape));
    if (!existsSync(gifAbs)) {
      throw new Error(`tape ${pkg}/${tape} produced no ${expectedGifFor("x/x.tape") ? "out/" : ""}gif — every tape needs an explicit 'Output out/<name>.gif' line (tapes/CONVENTIONS.md rule 1)`);
    }
    const stem = basename(gifAbs, ".gif");
    const finalAbs = baseLabel
      ? join(pkgTapesDir, "out", "before", `${stem}.gif`)
      : gifAbs;
    if (baseLabel) {
      mkdirSync(join(pkgTapesDir, "out", "before"), { recursive: true });
      copyFileSync(gifAbs, finalAbs);
    }
    const gifRel = relative(repoRoot, finalAbs);
    const altBase = `${pkg} ${stem} — ${baseLabel ? `behavior at ${baseLabel}` : "behavior at HEAD"}`;
    items.push({ pkg, gif: gifRel, alt: altBase });
  }
  return items;
}

function parseArgs(argv) {
  const opts = { packages: [], dryRun: false, record: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--pr": opts.pr = argv[++i]; break;
      case "--issue": opts.issue = argv[++i]; break;
      case "--package": opts.packages.push(argv[++i]); break;
      case "--base": opts.base = argv[++i]; break;
      case "--task": opts.task = argv[++i]; break;
      case "--record": opts.record = true; break;
      case "--dry-run": opts.dryRun = true; break;
      default: throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (Boolean(opts.pr) === Boolean(opts.issue)) {
    throw new Error("exactly one of --pr <n> or --issue <n> is required");
  }
  if (opts.record && !opts.task) {
    throw new Error("--record requires --task <AK task id>");
  }
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  const repoRoot = resolve(process.cwd());
  const opts = parseArgs(argv);

  const ghVersion = parseGhVersion(run("gh", ["--version"]));
  if (!ghMeetsMinimum(ghVersion)) {
    throw new Error(`gh >= ${MIN_GH.major}.${MIN_GH.minor}.0 required for --attach (found ${ghVersion ? `${ghVersion.major}.${ghVersion.minor}.${ghVersion.patch}` : "unparseable"})`);
  }
  run("vhs", ["--version"]);

  const packages = opts.packages.length
    ? [...new Set(opts.packages)].sort()
    : discoverPackages(join(repoRoot, "tapes"));
  if (packages.length === 0) throw new Error("no tapes found under tapes/ — see tapes/CONVENTIONS.md");

  const headSha = run("git", ["rev-parse", "--short", "HEAD"]).trim();
  const headRef = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();

  let items = [];
  for (const pkg of packages) {
    items = items.concat(renderPackageTapes(repoRoot, pkg));
  }

  if (opts.base) {
    const scratch = mkdtempSync(join(tmpdir(), "pi-ext-evidence-"));
    const worktree = join(scratch, "base");
    try {
      run("git", ["worktree", "add", "--detach", worktree, opts.base]);
      const baseSha = run("git", ["rev-parse", "--short", opts.base]).trim();
      for (const pkg of packages) {
        if (!existsSync(join(worktree, "tapes", pkg))) {
          console.warn(`warn: tapes/${pkg} absent at ${opts.base}; skipping before half`);
          continue;
        }
        items = items.concat(renderPackageTapes(worktree, pkg, { baseLabel: `${opts.base} (${baseSha})` }));
      }
    } finally {
      run("git", ["worktree", "remove", "--force", worktree]);
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  const target = opts.pr ? { kind: "pr", id: opts.pr } : { kind: "issue", id: opts.issue };
  const command = `just evidence ${target.kind === "pr" ? "PR" : "ISSUE"}=${target.id}`;
  const body = buildEvidenceBody({
    items,
    baseRef: opts.base,
    headRef,
    headSha,
    generatedAt: new Date().toISOString(),
    command,
  });

  if (opts.dryRun) {
    console.log(`dry-run: would post to ${target.kind} ${target.id} with ${items.length} attachment(s):\n`);
    console.log(body);
    console.log("\ngh args:", buildGhAttachArgs(items).join(" "));
    return { url: null, items };
  }

  const bodyFile = join(tmpdir(), `release-evidence-${Date.now()}.md`);
  writeFileSync(bodyFile, body);
  const ghArgs = [target.kind === "pr" ? "pr" : "issue", "comment", String(target.id), "--body-file", bodyFile, ...buildGhAttachArgs(items)];
  const url = run("gh", ghArgs, { cwd: repoRoot }).trim();
  console.log(`posted: ${url}`);

  if (opts.record) {
    const details = JSON.stringify({ url, target, packages, tapes: items.map((i) => i.gif), base: opts.base ?? null, head: `${headRef} (${headSha})`, generatedAt: new Date().toISOString() });
    run("ak", ["evidence", "record", "-t", String(opts.task), "-c", "gh-attachment", "--result", "pass", "--details", details]);
    console.log(`recorded AK evidence for task ${opts.task}`);
  }
  return { url, items };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`error: ${error.message}`);
    process.exit(1);
  });
}
