// ---
// summary: "Creates private Pi environments and journaled, conditional generation activation and rollback."
// read_when:
//   - "Changing isolated settings activation, crash recovery, quiescence, or rollback semantics."
// ---
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { readFile, readdir, realpath, stat, unlink } from "node:fs/promises";
import path from "node:path";
import {
  AGENT_SCHEMA,
  JOURNAL_SCHEMA,
  assertAbsolute,
  assertObject,
  assertRegularFile,
  assertWithin,
  isWithin,
  atomicReplace,
  ensurePrivateDirectory,
  fail,
  lstatMaybe,
  mkdirPrivate,
  sha256,
  stableJson,
  syncDirectory,
  writeExclusive,
} from "./common.mjs";
import { acquireOwnedLock } from "./lock.mjs";
import { ensureOwnedDirectory } from "./roots.mjs";
import { verifyGeneration } from "./verify.mjs";

const MARKER_NAME = ".pi-extension-generations-agent.json";
const JOURNAL_NAME = ".pi-extension-generations-activation.json";
const LOCK_NAME = ".pi-extension-generations-activation.lock";
const LOCK_SCHEMA = "pi-extension-generation-activation-lock.v2";
const ABSENT_DIGEST = sha256("pi-extension-generations:settings-absent");
const UNRESOLVED_PHASES = new Set(["prepared", "rollback-prepared"]);
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function canonicalTransactionId(value) {
  if (typeof value !== "string" || !CANONICAL_UUID.test(value)) fail("activation journal transactionId must be a canonical UUID");
  return value;
}

function rejectOperatorLike(agentDir) {
  const normalized = agentDir.split(path.sep).join("/");
  const configured = process.env.PI_CODING_AGENT_DIR ? path.resolve(process.env.PI_CODING_AGENT_DIR) : null;
  if (agentDir === path.join(homedir(), ".pi", "agent") || normalized.endsWith("/.pi/agent") || agentDir === configured) {
    fail("operator-like Pi agent directories are forbidden");
  }
}

async function assertPrivateDescendant(sandboxRoot, target, label) {
  assertAbsolute(target, label);
  assertWithin(sandboxRoot, target, label);
  const parent = path.dirname(target);
  await ensurePrivateDirectory(parent, `${label} parent`);
  const canonicalParent = await realpath(parent);
  if (!isWithin(sandboxRoot, canonicalParent)) fail(`${label} parent must remain beneath the sandbox root`);
}

export async function initPrivateEnvironment({ sandboxRoot, agentDir, projectDir }) {
  for (const [value, label] of [[sandboxRoot, "sandbox root"], [agentDir, "agent directory"], [projectDir, "project directory"]]) assertAbsolute(value, label);
  await ensurePrivateDirectory(sandboxRoot, "sandbox root");
  rejectOperatorLike(agentDir);
  if (agentDir === projectDir) fail("agent and project directories must be distinct");
  await assertPrivateDescendant(sandboxRoot, agentDir, "agent directory");
  await assertPrivateDescendant(sandboxRoot, projectDir, "project directory");
  if (await lstatMaybe(agentDir)) fail("agent directory must not already exist");
  if (await lstatMaybe(projectDir)) fail("project directory must not already exist");
  await mkdirPrivate(agentDir);
  await mkdirPrivate(projectDir);
  const marker = {
    schema: AGENT_SCHEMA,
    instanceId: randomUUID(),
    sandboxRoot,
    agentDir,
    projectDir,
    ownership: {
      kind: "tool-created-private-agent",
      uid: typeof process.getuid === "function" ? process.getuid() : null,
      canonicalSandboxRoot: await realpath(sandboxRoot),
      canonicalAgentDir: await realpath(agentDir),
      canonicalProjectDir: await realpath(projectDir),
    },
    createdAt: new Date().toISOString(),
  };
  await writeExclusive(path.join(agentDir, MARKER_NAME), stableJson(marker), 0o600);
  return marker;
}

export async function assertPrivateEnvironment({ sandboxRoot, agentDir, projectDir }) {
  for (const [value, label] of [[sandboxRoot, "sandbox root"], [agentDir, "agent directory"], [projectDir, "project directory"]]) assertAbsolute(value, label);
  rejectOperatorLike(agentDir);
  await ensurePrivateDirectory(sandboxRoot, "sandbox root");
  await ensurePrivateDirectory(agentDir, "agent directory");
  await ensurePrivateDirectory(projectDir, "project directory");
  assertWithin(sandboxRoot, agentDir, "agent directory");
  assertWithin(sandboxRoot, projectDir, "project directory");
  const markerPath = path.join(agentDir, MARKER_NAME);
  const markerInfo = await assertRegularFile(markerPath, "private agent marker");
  if ((markerInfo.mode & 0o077) !== 0) fail("private agent marker permissions are not private");
  const marker = assertObject(JSON.parse(await readFile(markerPath, "utf8")), "private agent marker");
  const ownership = marker.ownership;
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (marker.schema !== AGENT_SCHEMA || marker.sandboxRoot !== sandboxRoot || marker.agentDir !== agentDir || marker.projectDir !== projectDir ||
      ownership?.kind !== "tool-created-private-agent" || ownership.uid !== uid || ownership.canonicalSandboxRoot !== sandboxRoot ||
      ownership.canonicalAgentDir !== agentDir || ownership.canonicalProjectDir !== projectDir) {
    fail("agent directory was not created by this tool for the supplied canonical sandbox/project paths");
  }
  return marker;
}

async function readSettingsState(settingsPath) {
  const info = await lstatMaybe(settingsPath);
  if (!info) return { exists: false, bytes: Buffer.alloc(0), mode: null, digest: ABSENT_DIGEST, value: {} };
  if (!info.isFile() || info.isSymbolicLink()) fail("settings state must be a regular non-symlink file");
  if (await realpath(settingsPath) !== settingsPath) fail("settings state path must be canonical");
  if ((info.mode & 0o077) !== 0) fail("settings state permissions are not private");
  const bytes = await readFile(settingsPath);
  if (bytes.length > 1024 * 1024) fail("settings state exceeds the bounded size limit");
  let value;
  try { value = assertObject(JSON.parse(bytes.toString("utf8")), "settings state"); }
  catch (error) { fail(`settings state is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  return { exists: true, bytes, mode: info.mode & 0o777, digest: sha256(bytes), value };
}

async function readProjectSettings(projectDir) {
  const configDir = path.join(projectDir, ".pi");
  const configInfo = await lstatMaybe(configDir);
  if (!configInfo) return { value: {}, settingsDir: configDir };
  if (!configInfo.isDirectory() || configInfo.isSymbolicLink()) fail("project .pi state must be a non-symlink directory");
  if (await realpath(configDir) !== configDir) fail("project .pi state path must be canonical");
  if ((configInfo.mode & 0o077) !== 0) fail("project .pi state permissions are not private");
  const state = await readSettingsState(path.join(configDir, "settings.json"));
  return { value: state.value, settingsDir: configDir };
}

function packageEntries(settings, label) {
  if (settings.packages === undefined) return [];
  if (!Array.isArray(settings.packages)) fail(`${label} packages must be an array`);
  return settings.packages.map((entry, index) => {
    if (typeof entry === "string") return { entry, source: entry, index };
    const object = assertObject(entry, `${label} package entry ${index}`);
    if (typeof object.source !== "string" || !object.source) fail(`${label} package entry ${index} has no source`);
    return { entry, source: object.source, index };
  });
}

function npmPackageIdentity(source) {
  const spec = source.startsWith("npm:") ? source.slice(4) : source;
  if (spec.startsWith("@")) {
    const slash = spec.indexOf("/");
    if (slash < 2) return null;
    const version = spec.indexOf("@", slash);
    return version < 0 ? spec : spec.slice(0, version);
  }
  const version = spec.indexOf("@");
  const name = version < 0 ? spec : spec.slice(0, version);
  return /^[A-Za-z0-9_.-]+$/u.test(name) ? name : null;
}

async function sourceFamily(source, settingsDir, familyName) {
  if (source.startsWith("git:") || /^[a-z]+:\/\//iu.test(source)) {
    fail(`opaque git/URL package source prevents cross-scope family proof: ${source}`);
  }
  const looksLocal = path.isAbsolute(source) || source.startsWith("./") || source.startsWith("../");
  if (!looksLocal) {
    if (source.startsWith("~")) fail(`cannot safely identify tilde package source during activation: ${source}`);
    const identity = npmPackageIdentity(source);
    if (!identity) fail(`opaque npm package source prevents cross-scope family proof: ${source}`);
    return identity === familyName ? familyName : null;
  }
  const absolute = path.isAbsolute(source) ? path.resolve(source) : path.resolve(settingsDir, source);
  const packageInfo = await lstatMaybe(absolute);
  if (!packageInfo) fail(`cannot preflight missing local package source: ${source}`);
  if (!packageInfo.isDirectory() || packageInfo.isSymbolicLink()) fail(`local package source is not a non-symlink directory: ${source}`);
  const manifestPath = path.join(absolute, "package.json");
  await assertRegularFile(manifestPath, `local package manifest for ${source}`);
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch { fail(`local package manifest is invalid: ${source}`); }
  return manifest?.name === familyName ? familyName : null;
}

async function matchingFamilyEntries(settings, settingsDir, familyName, label) {
  const matches = [];
  for (const item of packageEntries(settings, label)) {
    if (await sourceFamily(item.source, settingsDir, familyName)) matches.push(item);
  }
  return matches;
}

async function buildActivatedSettings(userState, projectState, generation) {
  const userSettingsDir = path.dirname(userState.settingsPath);
  const userMatches = await matchingFamilyEntries(userState.value, userSettingsDir, generation.packageName, "user settings");
  const projectMatches = await matchingFamilyEntries(projectState.value, projectState.settingsDir, generation.packageName, "project settings");
  if (userMatches.length > 1) fail("duplicate logical package identity in user settings");
  if (projectMatches.length > 0) fail("cross-scope logical package identity conflict in project settings");
  const packages = packageEntries(userState.value, "user settings").map((item) => item.entry);
  if (userMatches.length === 1) {
    const match = userMatches[0];
    packages[match.index] = typeof match.entry === "string" ? generation.packageDir : { ...match.entry, source: generation.packageDir };
  } else packages.push(generation.packageDir);
  return { ...userState.value, packages };
}

async function runningAgentPids(agentDir) {
  const proc = await lstatMaybe("/proc");
  if (!proc?.isDirectory()) fail("cannot establish Pi process quiescence without /proc");
  const pids = [];
  for (const name of await readdir("/proc")) {
    if (!/^\d+$/u.test(name) || Number(name) === process.pid) continue;
    const processRoot = path.join("/proc", name);
    let processInfo;
    try { processInfo = await stat(processRoot); } catch { continue; }
    if (typeof process.getuid === "function" && processInfo.uid !== process.getuid()) continue;
    const environmentPath = path.join(processRoot, "environ");
    let environmentInfo;
    try { environmentInfo = await stat(environmentPath); } catch { continue; }
    if (typeof process.getuid === "function" && environmentInfo.uid !== process.getuid()) continue;
    let environment;
    try { environment = await readFile(environmentPath); }
    catch (error) {
      if (error?.code === "ENOENT") continue;
      const commandLine = await readFile(path.join(processRoot, "cmdline"), "utf8").catch(() => "");
      if (/(?:^|\/)pi(?:\u0000|$)|pi-coding-agent/iu.test(commandLine)) fail(`cannot inspect possible Pi process ${name} for quiescence`);
      continue;
    }
    const entries = environment.toString("utf8").split("\0");
    if (entries.includes(`PI_CODING_AGENT_DIR=${agentDir}`)) pids.push(Number(name));
  }
  return pids.sort((left, right) => left - right);
}

async function assertPrivateAgentQuiescence(agentDir, experimentalHostPid) {
  const pids = await runningAgentPids(agentDir);
  const observation = {
    scope: "tool-created-private-agent-directory-only",
    method: "same-user-/proc-environment-observation",
    raceFreeGeneralProcessExclusion: false,
    observedPids: pids,
    mode: "fresh-process-primary",
  };
  if (pids.length === 0) return observation;
  if (experimentalHostPid && pids.length === 1 && pids[0] === Number(experimentalHostPid)) {
    return { ...observation, mode: "experimental-running-host" };
  }
  fail(`private Pi agent directory is observed in use by process(es): ${pids.join(", ")}`);
}

async function acquireActivationLock(options, marker) {
  const historyDir = await ensureOwnedDirectory(options.agentDir, ".pi-extension-generations-lock-history", "activation lock history");
  return acquireOwnedLock({
    lockPath: path.join(options.agentDir, LOCK_NAME),
    historyDir,
    schema: LOCK_SCHEMA,
    binding: {
      agentInstanceId: marker.instanceId,
      sandboxRoot: options.sandboxRoot,
      agentDir: options.agentDir,
      projectDir: options.projectDir,
    },
  });
}

async function readJournal(agentDir) {
  const journalPath = path.join(agentDir, JOURNAL_NAME);
  const info = await lstatMaybe(journalPath);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) fail("activation journal state is unsafe");
  if (await realpath(journalPath) !== journalPath) fail("activation journal path must be canonical");
  const bytes = await readFile(journalPath);
  let value;
  try { value = assertObject(JSON.parse(bytes.toString("utf8")), "activation journal"); }
  catch { fail("activation journal is invalid"); }
  if (value.schema !== JOURNAL_SCHEMA) fail("activation journal schema is unsupported");
  canonicalTransactionId(value.transactionId);
  return { path: journalPath, bytes, value };
}

async function retainJournal(agentDir, journal) {
  if (!journal) return;
  const historyDir = await ensureOwnedDirectory(agentDir, ".pi-extension-generations-journals", "activation journal history");
  const transactionId = canonicalTransactionId(journal.value.transactionId);
  const target = path.join(historyDir, `${transactionId}.json`);
  assertWithin(historyDir, target, "retained activation journal target");
  try { await writeExclusive(target, journal.bytes, 0o600); }
  catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (!Buffer.from(await readFile(target)).equals(journal.bytes)) fail("retained journal transaction collision");
  }
}

function serializedState(state) {
  return { exists: state.exists, bytesBase64: state.bytes.toString("base64"), mode: state.mode, digest: state.digest };
}

async function restoreSerializedState(settingsPath, prior) {
  if (prior.exists) await atomicReplace(settingsPath, Buffer.from(prior.bytesBase64, "base64"), prior.mode);
  else {
    await unlink(settingsPath);
    await syncDirectory(path.dirname(settingsPath));
  }
}

export async function activateGeneration(options, hooks = {}) {
  const marker = await assertPrivateEnvironment(options);
  const generation = await verifyGeneration(options.generationDir);
  const lock = await acquireActivationLock(options, marker);
  try {
    await hooks.afterLock?.({ lock: lock.record, generation });
    const quiescence = await assertPrivateAgentQuiescence(options.agentDir, options.experimentalHostPid);
    const existingJournal = await readJournal(options.agentDir);
    if (existingJournal && UNRESOLVED_PHASES.has(existingJournal.value.phase)) fail("activation journal is unresolved; run recover first");
    await retainJournal(options.agentDir, existingJournal);
    const settingsPath = path.join(options.agentDir, "settings.json");
    const prior = await readSettingsState(settingsPath);
    prior.settingsPath = settingsPath;
    const project = await readProjectSettings(options.projectDir);
    const nextSettings = await buildActivatedSettings(prior, project, generation);
    const intendedBytes = Buffer.from(stableJson(nextSettings));
    const transactionId = randomUUID();
    const journal = {
      schema: JOURNAL_SCHEMA,
      transactionId,
      phase: "prepared",
      quiescence,
      generationId: generation.generationId,
      packageName: generation.packageName,
      packageDir: generation.packageDir,
      prior: serializedState(prior),
      intended: { exists: true, bytesBase64: intendedBytes.toString("base64"), mode: 0o600, digest: sha256(intendedBytes) },
      preparedAt: new Date().toISOString(),
    };
    const journalPath = path.join(options.agentDir, JOURNAL_NAME);
    await atomicReplace(journalPath, stableJson(journal), 0o600);
    await hooks.afterPrepared?.({ journal, settingsPath });
    const current = await readSettingsState(settingsPath);
    if (current.digest !== prior.digest) fail("settings changed after activation prepare");
    await atomicReplace(settingsPath, intendedBytes, 0o600);
    journal.phase = "completed";
    journal.activatedDigest = journal.intended.digest;
    journal.completedAt = new Date().toISOString();
    await atomicReplace(journalPath, stableJson(journal), 0o600);
    return { transactionId, quiescence, generationId: generation.generationId, packageDir: generation.packageDir, activatedDigest: journal.activatedDigest };
  } finally { await lock.release(); }
}

export async function recoverActivation(options) {
  const marker = await assertPrivateEnvironment(options);
  const lock = await acquireActivationLock(options, marker);
  try {
    await assertPrivateAgentQuiescence(options.agentDir);
    const journal = await readJournal(options.agentDir);
    if (!journal || !UNRESOLVED_PHASES.has(journal.value.phase)) fail("no unresolved activation journal exists");
    const settingsPath = path.join(options.agentDir, "settings.json");
    const current = await readSettingsState(settingsPath);
    const value = journal.value;
    if (value.phase === "prepared") {
      if (current.digest === value.prior.digest) value.phase = "aborted-before-effect";
      else if (current.digest === value.intended.digest) { value.phase = "completed"; value.activatedDigest = value.intended.digest; }
      else fail("unresolved activation journal does not match prior or intended settings");
    } else {
      if (current.digest === value.intended.digest) await restoreSerializedState(settingsPath, value.prior);
      else if (current.digest !== value.prior.digest) fail("unresolved rollback journal does not match activated or prior settings");
      value.phase = "rolled-back";
    }
    value.recoveredAt = new Date().toISOString();
    await atomicReplace(journal.path, stableJson(value), 0o600);
    const updated = await readJournal(options.agentDir);
    await retainJournal(options.agentDir, updated);
    return { transactionId: value.transactionId, phase: value.phase };
  } finally { await lock.release(); }
}

export async function rollbackActivation(options) {
  const marker = await assertPrivateEnvironment(options);
  const lock = await acquireActivationLock(options, marker);
  try {
    await assertPrivateAgentQuiescence(options.agentDir);
    const journal = await readJournal(options.agentDir);
    if (!journal || journal.value.phase !== "completed") fail("no completed activation journal is available for rollback");
    const settingsPath = path.join(options.agentDir, "settings.json");
    const current = await readSettingsState(settingsPath);
    if (current.digest !== journal.value.activatedDigest) fail("settings digest differs from the activated digest; rollback refused");
    const value = journal.value;
    value.phase = "rollback-prepared";
    value.rollbackPreparedAt = new Date().toISOString();
    await atomicReplace(journal.path, stableJson(value), 0o600);
    await restoreSerializedState(settingsPath, value.prior);
    value.phase = "rolled-back";
    value.rolledBackAt = new Date().toISOString();
    await atomicReplace(journal.path, stableJson(value), 0o600);
    const updated = await readJournal(options.agentDir);
    await retainJournal(options.agentDir, updated);
    return { transactionId: value.transactionId, restoredDigest: value.prior.digest, restoredExists: value.prior.exists };
  } finally { await lock.release(); }
}

export async function assertActivatedGeneration(options) {
  await assertPrivateEnvironment(options);
  const generation = await verifyGeneration(options.generationDir);
  const settingsPath = path.join(options.agentDir, "settings.json");
  const user = await readSettingsState(settingsPath);
  user.settingsPath = settingsPath;
  const project = await readProjectSettings(options.projectDir);
  const userMatches = await matchingFamilyEntries(user.value, path.dirname(settingsPath), generation.packageName, "user settings");
  const projectMatches = await matchingFamilyEntries(project.value, project.settingsDir, generation.packageName, "project settings");
  if (userMatches.length !== 1 || userMatches[0].source !== generation.packageDir || projectMatches.length !== 0) fail("settings do not select only the expected generation");
  return generation;
}
