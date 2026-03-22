#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import MarkdownIt from "markdown-it";

const markdownParser = new MarkdownIt({ linkify: true });
const DEFAULT_SOURCE_ROOTS = [
  "README.md",
  "NEXT_SESSION_PROMPT.md",
  "docs",
  "diary",
  "prompts",
  "examples",
];

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

function collectLinksFromTokens(tokens, links) {
  for (const token of tokens) {
    if (token.type === "link_open") {
      const href = token.attrGet("href");
      if (typeof href === "string" && href.trim()) {
        links.push(href.trim());
      }
    }
    if (Array.isArray(token.children) && token.children.length > 0) {
      collectLinksFromTokens(token.children, links);
    }
  }
}

function collectSupplementalLinks(markdown, links) {
  for (const match of String(markdown || "").matchAll(/<(file:\/\/[^>\s]+)>/gi)) {
    const href = match[1]?.trim();
    if (href) links.push(href);
  }
}

function extractMarkdownLinks(markdown) {
  const links = [];
  const source = String(markdown || "");
  collectLinksFromTokens(markdownParser.parse(source, {}), links);
  collectSupplementalLinks(source, links);
  return [...new Set(links)];
}

function walkMarkdownFiles(rootDir, roots = DEFAULT_SOURCE_ROOTS) {
  const entries = [];

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

function normalizeMarkdownFileList(rootDir, markdownFiles) {
  return [...new Set(markdownFiles.map((filePath) => path.resolve(rootDir, filePath)))].sort();
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

function listPackedMarkdownFiles(rootDir, packedFiles) {
  return [...packedFiles]
    .filter((filePath) => /\.md$/i.test(filePath))
    .map((filePath) => path.join(rootDir, filePath))
    .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile())
    .sort();
}

function resolvePackedLinkTarget(rootDir, filePath, link) {
  const target = stripFragmentAndQuery(link);
  if (!target) return null;
  return normalizePath(path.relative(rootDir, path.resolve(path.dirname(filePath), target)));
}

function collectPackedLinkIssues({ rootDir, markdownFiles, packedFiles }) {
  const issues = [];

  for (const filePath of markdownFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    const relativePath = normalizePath(path.relative(rootDir, filePath));

    for (const link of extractMarkdownLinks(source)) {
      if (isExternalLink(link) || isAnchorLink(link) || isFilesystemAbsoluteLink(link)) {
        continue;
      }

      const resolved = resolvePackedLinkTarget(rootDir, filePath, link);
      if (!resolved) continue;
      if (packedFiles.has(resolved) || allowAlwaysIncludedPackFile(resolved)) {
        continue;
      }

      issues.push(`${relativePath}: local link is not present in the packed artifact: ${link}`);
    }
  }

  return issues;
}

export function validatePortableDocSurface({
  rootDir = process.cwd(),
  packJson = null,
  roots = DEFAULT_SOURCE_ROOTS,
  markdownFiles = null,
} = {}) {
  const packedFiles = packJson ? buildPackFileSet(packJson) : null;
  const effectiveMarkdownFiles = normalizeMarkdownFileList(
    rootDir,
    markdownFiles ||
      (packedFiles
        ? listPackedMarkdownFiles(rootDir, packedFiles)
        : walkMarkdownFiles(rootDir, roots)),
  );
  const issues = collectAbsoluteLinkIssues({ rootDir, markdownFiles: effectiveMarkdownFiles });

  if (packedFiles) {
    issues.push(
      ...collectPackedLinkIssues({
        rootDir,
        markdownFiles: effectiveMarkdownFiles,
        packedFiles,
      }),
    );
  }

  return {
    ok: issues.length === 0,
    issues,
    markdownFiles: effectiveMarkdownFiles.map((filePath) =>
      normalizePath(path.relative(rootDir, filePath)),
    ),
  };
}

function main() {
  const args = process.argv.slice(2);
  let packJsonPath = null;
  let rootDir = process.cwd();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--pack-json") {
      packJsonPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--root-dir") {
      rootDir = path.resolve(args[index + 1] ?? rootDir);
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: node ./scripts/validate-portable-doc-surface.mjs [--root-dir <path>] [--pack-json <path>]",
      );
      process.exit(0);
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }

  const packJson = packJsonPath ? JSON.parse(fs.readFileSync(packJsonPath, "utf8")) : null;
  const result = validatePortableDocSurface({ rootDir, packJson });

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
