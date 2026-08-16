// ---
// summary: "Preflights canonical private roots and binds tool-created ownership markers before secondary effects."
// read_when:
//   - "Changing generation-state, private-agent, journal, probe, or lock directory ownership."
// ---
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  assertAbsolute,
  assertObject,
  ensurePrivateDirectory,
  fail,
  isWithin,
  lstatMaybe,
  stableJson,
  writeExclusive,
} from "./common.mjs";

async function canonicalPrivateParent(target, label) {
  const parent = path.dirname(target);
  await ensurePrivateDirectory(parent, `${label} parent`);
  const canonical = await realpath(parent);
  if (canonical !== parent) fail(`${label} parent must use its canonical path`);
  return parent;
}

export async function preflightCanonicalPath(target, label, { allowMissing = false } = {}) {
  assertAbsolute(target, label);
  const info = await lstatMaybe(target);
  if (!info) {
    if (!allowMissing) fail(`${label} does not exist`);
    await canonicalPrivateParent(target, label);
    return null;
  }
  if (info.isSymbolicLink()) fail(`${label} must not be a symlink`);
  const canonical = await realpath(target);
  if (canonical !== target) fail(`${label} must use its canonical path`);
  return info;
}

export async function createOwnedRoot({ root, markerName, schema, label, binding = {} }) {
  const existing = await preflightCanonicalPath(root, label, { allowMissing: true });
  let created = false;
  if (!existing) {
    await mkdir(root, { mode: 0o700 });
    created = true;
  }
  await ensurePrivateDirectory(root, label);
  const markerPath = path.join(root, markerName);
  const markerInfo = await lstatMaybe(markerPath);
  if (!markerInfo) {
    if (!created) fail(`${label} is not tool-created: ownership marker is missing`);
    const marker = {
      schema,
      instanceId: randomUUID(),
      root,
      uid: typeof process.getuid === "function" ? process.getuid() : null,
      binding,
      createdAt: new Date().toISOString(),
    };
    await writeExclusive(markerPath, stableJson(marker), 0o600);
    return marker;
  }
  if (!markerInfo.isFile() || markerInfo.isSymbolicLink() || (markerInfo.mode & 0o077) !== 0) {
    fail(`${label} ownership marker is unsafe`);
  }
  let marker;
  try { marker = assertObject(JSON.parse(await readFile(markerPath, "utf8")), `${label} ownership marker`); }
  catch { fail(`${label} ownership marker is invalid`); }
  if (marker.schema !== schema || marker.root !== root || marker.uid !== (typeof process.getuid === "function" ? process.getuid() : null)) {
    fail(`${label} ownership marker binding mismatch`);
  }
  if (JSON.stringify(marker.binding) !== JSON.stringify(binding)) fail(`${label} ownership marker declared binding mismatch`);
  return marker;
}

export async function ensureOwnedDirectory(root, relative, label) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
    fail(`${label} relative path is invalid`);
  }
  const target = path.join(root, relative);
  if (!isWithin(root, target) || target === root) fail(`${label} escapes its owned root`);
  const existing = await preflightCanonicalPath(target, label, { allowMissing: true });
  if (!existing) await mkdir(target, { mode: 0o700 });
  await ensurePrivateDirectory(target, label);
  return target;
}

export async function assertCanonicalFileWithin(root, target, label) {
  assertAbsolute(target, label);
  if (!isWithin(root, target) || target === root) fail(`${label} must be beneath its owned root`);
  const info = await preflightCanonicalPath(target, label);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
  return info;
}
