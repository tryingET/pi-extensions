#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export function listConfiguredPackageSources(settings) {
  const entries = Array.isArray(settings?.packages) ? settings.packages : [];
  return entries
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (entry && typeof entry === "object" && typeof entry.source === "string") {
        return entry.source;
      }
      return null;
    })
    .filter((entry) => typeof entry === "string" && entry.length > 0);
}

export function settingsPackagesContainSpec(settings, packageSpec) {
  return listConfiguredPackageSources(settings).includes(packageSpec);
}

export function listRelativeFiles(rootDir, options = {}) {
  const files = [];
  const queue = [""];
  const ignoredPathSegments = new Set(options.ignoredPathSegments || []);

  while (queue.length > 0) {
    const relativeDir = queue.shift();
    const absoluteDir = path.join(rootDir, relativeDir || ".");
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      const pathSegments = relativePath.split(path.sep);
      if (pathSegments.some((segment) => ignoredPathSegments.has(segment))) {
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(relativePath);
        continue;
      }
      if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  return files.sort();
}

export function assertDirectoriesMatchExactly(params) {
  const expectedFiles = listRelativeFiles(params.expectedDir, params);
  const actualFiles = listRelativeFiles(params.actualDir, params);

  assert.ok(expectedFiles.length > 0, `Expected files in ${params.expectedDir}`);

  const expectedSet = new Set(expectedFiles);
  const actualSet = new Set(actualFiles);
  const missing = expectedFiles.filter((filePath) => !actualSet.has(filePath));
  const extra = actualFiles.filter((filePath) => !expectedSet.has(filePath));

  assert.equal(
    missing.length,
    0,
    `${params.actualLabel || "actual directory"} is missing expected file(s): ${missing.join(", ")}`,
  );
  assert.equal(
    extra.length,
    0,
    `${params.actualLabel || "actual directory"} has unexpected extra file(s): ${extra.join(", ")}`,
  );

  for (const relativePath of expectedFiles) {
    const expectedFilePath = path.join(params.expectedDir, relativePath);
    const actualFilePath = path.join(params.actualDir, relativePath);
    const expectedContent = fs.readFileSync(expectedFilePath);
    const actualContent = fs.readFileSync(actualFilePath);

    assert.equal(
      Buffer.compare(expectedContent, actualContent),
      0,
      `${params.actualLabel || "actual directory"} content drifted for ${relativePath}`,
    );
  }
}
