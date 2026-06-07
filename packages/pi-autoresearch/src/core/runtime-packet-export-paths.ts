import path from "node:path";

import { assertPathInsideDirectory } from "./runtime-path-safety.ts";

export function resolveAutoresearchPacketExportPath(input: {
  cwd: string;
  outPath?: string;
  defaultPath: string;
  label: string;
}): string {
  const resolvedCwd = path.resolve(input.cwd);
  const exportRoot = path.resolve(resolvedCwd, ".autoresearch");
  const requestedPath = input.outPath?.trim() || input.defaultPath;
  if (path.isAbsolute(requestedPath)) {
    throw new Error(`${input.label} outPath must be relative to cwd/.autoresearch, not absolute`);
  }
  const relativePath = requestedPath.startsWith(".autoresearch/")
    ? requestedPath.slice(".autoresearch/".length)
    : requestedPath;
  const outputPath = path.resolve(exportRoot, relativePath);
  assertPathInsideDirectory({
    candidate: outputPath,
    root: exportRoot,
    label: `${input.label} path`,
  });
  return outputPath;
}
