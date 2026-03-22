#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const README_PATH = path.join(ROOT_DIR, "README.md");
const TMP_DIR = path.join(ROOT_DIR, ".tmp");
const README_BACKUP_PATH = path.join(TMP_DIR, "README.prepack.backup.md");

function normalizeRepoUrl(url) {
  return String(url || "")
    .trim()
    .replace(/^git\+/, "")
    .replace(/\.git$/, "");
}

function getRepoMetadata() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const repoUrl =
    typeof pkg.repository === "string"
      ? pkg.repository
      : typeof pkg.repository?.url === "string"
        ? pkg.repository.url
        : "";
  const repoDirectory =
    typeof pkg.repository?.directory === "string" ? pkg.repository.directory : "";
  if (!repoUrl || !repoDirectory) {
    throw new Error(
      "package.json repository.url and repository.directory are required for README pinning.",
    );
  }
  return {
    repoUrl: normalizeRepoUrl(repoUrl),
    repoDirectory: repoDirectory.replace(/^\/+|\/+$/g, ""),
  };
}

function getHeadCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT_DIR, encoding: "utf8" }).trim();
}

export function rewriteReadmeGithubLinks(source, { repoUrl, repoDirectory, ref }) {
  const escapedRepoUrl = repoUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedRepoDirectory = repoDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedRepoUrl}/blob/main/${escapedRepoDirectory}/`, "g");
  return String(source || "").replace(pattern, `${repoUrl}/blob/${ref}/${repoDirectory}/`);
}

function prepack() {
  const metadata = getRepoMetadata();
  const headCommit = getHeadCommit();
  const source = fs.readFileSync(README_PATH, "utf8");
  const rewritten = rewriteReadmeGithubLinks(source, {
    ...metadata,
    ref: headCommit,
  });

  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(README_BACKUP_PATH, source, "utf8");
  fs.writeFileSync(README_PATH, rewritten, "utf8");

  console.error(`Pinned README GitHub blob links to commit ${headCommit}.`);
}

function postpack() {
  if (!fs.existsSync(README_BACKUP_PATH)) {
    console.error("No README prepack backup found; nothing to restore.");
    return;
  }
  const original = fs.readFileSync(README_BACKUP_PATH, "utf8");
  fs.writeFileSync(README_PATH, original, "utf8");
  fs.rmSync(README_BACKUP_PATH, { force: true });
  console.error("Restored README after prepack pinning.");
}

function main() {
  const mode = process.argv[2];
  if (mode === "prepack") {
    prepack();
    return;
  }
  if (mode === "postpack") {
    postpack();
    return;
  }
  console.error("Usage: node ./scripts/prepare-portable-readme.mjs <prepack|postpack>");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
