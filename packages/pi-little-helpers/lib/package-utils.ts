/**
 * Package utilities for package-update-notify extension.
 * Extracted to keep main extension under 500 lines.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type SettingsPackage = string | { source?: string };

export interface SettingsFile {
  packages?: SettingsPackage[];
}

export interface NpmPackageSpec {
  type: "npm";
  name: string;
  version?: string;
  source: string;
}

export interface GitPackageSpec {
  type: "git";
  url: string;
  ref?: string;
  source: string;
  displayName: string;
  refType?: "sha" | "tag" | "branch";
}

export type PackageSpec = NpmPackageSpec | GitPackageSpec;

export interface PackageUpdate {
  name: string;
  current: string;
  latest: string;
  source: string;
  compareUrl?: string;
}

export interface AutoCheckCache {
  lastCheckedAt?: number;
}

export interface CheckResult {
  updates: PackageUpdate[];
  skippedUnpinned: string[];
  errors: string[];
}

export const GLOBAL_SETTINGS = join(homedir(), ".pi", "agent", "settings.json");
export const CACHE_FILE = join(homedir(), ".pi", "agent", ".cache", "package-update-notify.json");
export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function parseNpmSource(source: string): NpmPackageSpec | undefined {
  if (!source.startsWith("npm:")) return undefined;
  const spec = source.slice(4).trim();
  const match = spec.match(/^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/);
  if (!match) return undefined;
  return { type: "npm", name: match[1], version: match[2], source };
}

export function parseGitSource(source: string): GitPackageSpec | undefined {
  if (source.startsWith("git:")) {
    const rest = source.slice(4).trim();
    const match = rest.match(/^(.+?)(?:@([^@]+))?$/);
    if (!match) return undefined;
    return {
      type: "git",
      url: normalizeGitUrl(match[1]),
      ref: match[2],
      source,
      displayName: extractDisplayName(match[1]),
    };
  }

  if (/^https?:\/\//.test(source) || /^ssh:\/\//.test(source) || /^git:\/\//.test(source)) {
    const match = source.match(/^(.+?)(?:@([^@]+))?$/);
    if (!match) return undefined;
    return {
      type: "git",
      url: match[1],
      ref: match[2],
      source,
      displayName: extractDisplayName(match[1]),
    };
  }

  return undefined;
}

export function normalizeGitUrl(url: string): string {
  if (/^https?:\/\//.test(url) || /^ssh:\/\//.test(url) || /^git:\/\//.test(url)) return url;

  const sshMatch = url.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;

  if (/^[^/:]+\/[^/]+\/[^/]+$/.test(url)) return `https://${url}`;
  if (/^[^/:]+\/[^/]+$/.test(url)) return `https://github.com/${url}`;

  return url;
}

export function extractDisplayName(url: string): string {
  const sshMatch = url.match(/^git@[^:]+:(.+)$/);
  if (sshMatch) return sshMatch[1];

  const httpsMatch = url.match(/:\/\/([^/]+\/[^/]+)/);
  if (httpsMatch) return httpsMatch[1];

  const shortMatch = url.match(/^([^/]+\/[^/]+)$/);
  if (shortMatch) return shortMatch[1];

  return url;
}

export function buildCompareUrl(url: string, current: string, latest: string): string | undefined {
  let match = url.match(/github\.com[/:]([^/]+\/[^/]+)/);
  if (!match) match = url.match(/:\/\/github\.com\/([^/]+\/[^/]+)/);
  if (!match) return undefined;

  const repo = match[1].replace(/\.git$/, "");
  return `https://github.com/${repo}/compare/${current}...${latest}`;
}

export async function readSettings(path: string): Promise<SettingsFile> {
  if (!existsSync(path)) return {};
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as SettingsFile;
  } catch {
    return {};
  }
}

export function extractPackages(settings: SettingsFile): PackageSpec[] {
  const pkgs = settings.packages ?? [];
  const out: PackageSpec[] = [];
  for (const pkg of pkgs) {
    const source = typeof pkg === "string" ? pkg : pkg?.source;
    if (!source) continue;

    if (source.startsWith("/") || source.startsWith("./") || source.startsWith("..")) continue;

    const npm = parseNpmSource(source);
    if (npm) {
      out.push(npm);
      continue;
    }

    const git = parseGitSource(source);
    if (git) out.push(git);
  }
  return out;
}

export function mergePackages(
  globalPkgs: PackageSpec[],
  projectPkgs: PackageSpec[],
): PackageSpec[] {
  const merged = new Map<string, PackageSpec>();
  for (const pkg of globalPkgs) {
    const key = pkg.type === "npm" ? `npm:${pkg.name}` : `git:${pkg.url}`;
    merged.set(key, pkg);
  }
  for (const pkg of projectPkgs) {
    const key = pkg.type === "npm" ? `npm:${pkg.name}` : `git:${pkg.url}`;
    merged.set(key, pkg);
  }
  return Array.from(merged.values());
}

export function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/, "");
}

export function compareVersion(a: string, b: string): number {
  const na = normalizeVersion(a).split("-")[0];
  const nb = normalizeVersion(b).split("-")[0];
  const pa = na.split(".").map((n) => Number(n));
  const pb = nb.split(".").map((n) => Number(n));
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) {
    if (na === nb) return 0;
    return na > nb ? 1 : -1;
  }
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export function isPinnedSha(ref: string | undefined): boolean {
  if (!ref) return false;
  return /^[0-9a-f]{40}$/i.test(ref);
}

export async function fetchLatestNpmVersion(
  pkgName: string,
  timeoutMs = 4500,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(pkgName)}/latest`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return undefined;
    const json = (await response.json()) as { version?: string };
    return json.version;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function gitLsRemote(
  url: string,
  ref: string,
  timeoutMs = 10000,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill();
      resolve(undefined);
    }, timeoutMs);

    const child = spawn("git", ["ls-remote", url, ref], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0 && stdout) {
        const match = stdout.match(/^([0-9a-f]{40})/i);
        resolve(match ? match[1] : undefined);
      } else {
        resolve(undefined);
      }
    });
    child.on("error", () => {
      clearTimeout(timeout);
      resolve(undefined);
    });
  });
}

export async function fetchLatestGitSha(
  url: string,
  timeoutMs = 10000,
): Promise<string | undefined> {
  return gitLsRemote(url, "HEAD", timeoutMs);
}

export async function resolveGitRef(
  url: string,
  ref: string,
  timeoutMs = 10000,
): Promise<{ sha: string; type: "tag" | "branch" } | undefined> {
  const tagSha = await gitLsRemote(url, `refs/tags/${ref}`, timeoutMs);
  if (tagSha) return { sha: tagSha, type: "tag" };

  const branchSha = await gitLsRemote(url, `refs/heads/${ref}`, timeoutMs);
  if (branchSha) return { sha: branchSha, type: "branch" };

  return undefined;
}

export async function readAutoCheckCache(): Promise<AutoCheckCache> {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    const content = await readFile(CACHE_FILE, "utf-8");
    return JSON.parse(content) as AutoCheckCache;
  } catch {
    return {};
  }
}

export async function writeAutoCheckCache(cache: AutoCheckCache): Promise<void> {
  try {
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(cache), "utf-8");
  } catch {
    /* ignore */
  }
}

export async function shouldRunAutoCheck(now = Date.now()): Promise<boolean> {
  const cache = await readAutoCheckCache();
  const lastCheckedAt = cache.lastCheckedAt ?? 0;
  return now - lastCheckedAt >= AUTO_CHECK_INTERVAL_MS;
}

export async function markAutoCheck(now = Date.now()): Promise<void> {
  await writeAutoCheckCache({ lastCheckedAt: now });
}

export function formatUpdateSummary(updates: PackageUpdate[]): string {
  const short = updates
    .slice(0, 3)
    .map((u) => `${u.name} ${u.current}→${u.latest}`)
    .join(", ");
  const more = updates.length > 3 ? ` (+${updates.length - 3} more)` : "";
  return `${short}${more}`;
}

export function formatDetailedUpdates(updates: PackageUpdate[]): string {
  return updates
    .map((u) => {
      let line = `  ${u.name}: ${u.current} → ${u.latest}`;
      if (u.compareUrl) line += `\n    ${u.compareUrl}`;
      return line;
    })
    .join("\n");
}
