#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function normalizePath(value) {
  return String(value).replace(/\\/g, "/").replace(/^\.\//, "");
}

function stripFragmentAndQuery(target) {
  return String(target).split("#", 1)[0].split("?", 1)[0];
}

function isExternalLink(target) {
  return /^(?:https?:|mailto:)/i.test(target);
}

function isAnchorLink(target) {
  return target.startsWith("#");
}

function isFilesystemAbsoluteLink(target) {
  return target.startsWith("file://") || target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target);
}

function extractMarkdownLinks(markdown) {
  const links = [];
  const pattern = /\[[^\]]*\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const rawTarget = match[1]?.trim() ?? "";
    const target = rawTarget.replace(/\s+"[^"]*"$/, "");
    if (target.length > 0) {
      links.push(target);
    }
  }
  return links;
}

function walkMarkdownFiles(rootDir) {
  const entries = [];
  const roots = ["README.md", "NEXT_SESSION_PROMPT.md", "docs", "diary"];

  for (const root of roots) {
    const fullRoot = path.join(rootDir, root);
    if (!fs.existsSync(fullRoot)) continue;
    const stat = fs.statSync(fullRoot);
    if (stat.isFile()) {
      entries.push(fullRoot);
      continue;
    }

    const stack = [fullRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (entry.isFile() && entry.name.endsWith(".md")) {
          entries.push(fullPath);
        }
      }
    }
  }

  return entries.sort();
}

function collectAbsoluteLinkIssues({ rootDir, markdownFiles }) {
  const issues = [];

  for (const filePath of markdownFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    const relativePath = normalizePath(path.relative(rootDir, filePath));
    for (const link of extractMarkdownLinks(source)) {
      if (isFilesystemAbsoluteLink(link)) {
        issues.push(`${relativePath}: absolute filesystem markdown link is not portable: ${link}`);
      }
    }
  }

  return issues;
}

function buildPackFileSet(packJson) {
  if (!Array.isArray(packJson) || !packJson[0] || !Array.isArray(packJson[0].files)) {
    throw new Error("Could not parse npm pack --dry-run --json output.");
  }

  return new Set(
    packJson[0].files.map((entry) => normalizePath(String(entry?.path ?? ""))).filter(Boolean),
  );
}

function allowAlwaysIncludedPackFile(targetPath) {
  return (
    /^README(?:\.[^/]+)?$/i.test(targetPath) ||
    /^LICENSE(?:\.[^/]+)?$/i.test(targetPath) ||
    /^NOTICE(?:\.[^/]+)?$/i.test(targetPath)
  );
}

function collectReadmePackIssues({ rootDir, readmePath, packedFiles }) {
  if (!fs.existsSync(readmePath)) {
    return [];
  }

  const issues = [];
  const source = fs.readFileSync(readmePath, "utf8");

  for (const link of extractMarkdownLinks(source)) {
    if (isExternalLink(link) || isAnchorLink(link)) {
      continue;
    }
    if (isFilesystemAbsoluteLink(link)) {
      continue;
    }

    const target = stripFragmentAndQuery(link);
    if (!target || target.startsWith(".")) {
      const resolved = normalizePath(
        path.relative(rootDir, path.resolve(path.dirname(readmePath), target)),
      );
      if (packedFiles.has(resolved) || allowAlwaysIncludedPackFile(resolved)) {
        continue;
      }
      issues.push(`README.md: local link is not present in the packed artifact: ${link}`);
      continue;
    }

    const normalizedTarget = normalizePath(target);
    if (packedFiles.has(normalizedTarget) || allowAlwaysIncludedPackFile(normalizedTarget)) {
      continue;
    }

    issues.push(`README.md: local link is not present in the packed artifact: ${link}`);
  }

  return issues;
}

export function validatePortableDocSurface({ rootDir = process.cwd(), packJson = null } = {}) {
  const markdownFiles = walkMarkdownFiles(rootDir);
  const issues = collectAbsoluteLinkIssues({ rootDir, markdownFiles });

  if (packJson) {
    const packedFiles = buildPackFileSet(packJson);
    issues.push(
      ...collectReadmePackIssues({
        rootDir,
        readmePath: path.join(rootDir, "README.md"),
        packedFiles,
      }),
    );
  }

  return {
    ok: issues.length === 0,
    issues,
    markdownFiles: markdownFiles.map((filePath) => normalizePath(path.relative(rootDir, filePath))),
  };
}

function main() {
  const args = process.argv.slice(2);
  let packJsonPath = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--pack-json") {
      packJsonPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log("Usage: node ./scripts/validate-portable-doc-surface.mjs [--pack-json <path>]");
      process.exit(0);
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }

  const packJson = packJsonPath ? JSON.parse(fs.readFileSync(packJsonPath, "utf8")) : null;
  const result = validatePortableDocSurface({ rootDir: process.cwd(), packJson });

  if (!result.ok) {
    for (const issue of result.issues) {
      console.error(issue);
    }
    console.error(`Portable doc surface validation failed with ${result.issues.length} issue(s).`);
    process.exit(1);
  }

  console.log(
    `Portable doc surface validation passed (${result.markdownFiles.length} markdown file(s) checked).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
