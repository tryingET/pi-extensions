#!/usr/bin/env node
// Provision the Decision 151 Pi task-session account namespace (AK5480). Owner operations only:
//
//   node scripts/task-session-provision.mjs init [--namespace ID]
//   node scripts/task-session-provision.mjs enroll --task ID --checkout DIR [--ak-instance ID]
//   node scripts/task-session-provision.mjs withdraw
//   node scripts/task-session-provision.mjs producer
//   node scripts/task-session-provision.mjs profile --task ID --model ID --reasoning LEVEL
//        [--run-seconds N] [--agent-dir DIR]
//   node scripts/task-session-provision.mjs show
//
// init creates the OS account's namespace (~/.local/state/pi-task-sessions, its lock, private
// profiles/credentials/attempts/model-sources and an empty state) and the locator
// ~/.config/pi-task-sessions/host.json. An empty inventory admits nothing and classifies every
// legacy request "unknown", which is the refusal the lane already applies.
//
// enroll adds one AK task's domain (checkout, common Git directory, physical identities) to the
// inventory and to `enrolled`, after `ak task show` confirms the task belongs to that checkout.
// One enrolled domain also protects its whole checkout and Git family from legacy launches.
// Enrolling is the owner's positive custody statement for that checkout: see softwareco/owned
// docs/project/2026-09-07-visible-task-session-lane-custody.md. withdraw stops new admissions and
// keeps every attempt, enrollment and history. producer copies the bindings AK publishes
// (`ak task-session describe`, enabled) into producer.json and has the installed producer check
// every pinned artifact; run it again after each AK rotation (AK6744). profile pins one
// openai-codex model from the pinned SDK catalog, the account's current OAuth credential from
// Pi's auth store (copied, content-addressed, never refreshed), the producer bindings and the
// database identity AK's plan reports for an enrolled task; the host's own preflight then checks
// it. The credential's lifetime bounds the profile: provision again before it runs out. No
// command deletes anything.
import { execFileSync } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
} from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { commonGit } from "../dist/task-session/git.js";
import { bytesDigest, digest, id, refuse } from "../dist/task-session/json.js";
import { native } from "../dist/task-session/native.js";
import { installedProducerPins } from "../dist/task-session/producer.js";
import {
  interpretTaskSessionDescriptor,
  interpretTaskSessionOwnerPlan,
} from "../dist/task-session/producer-adapter.js";
import { preflightProfile } from "../dist/task-session/profile.js";
import {
  accountLocator,
  durableWrite,
  physicalIdentity,
  readSnapshot,
  validateSnapshot,
} from "../dist/task-session/state.js";

const [command, ...rest] = process.argv.slice(2);
function option(name, fallback) {
  const at = rest.indexOf(name);
  if (at === -1) return fallback;
  const value = rest[at + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  rest.splice(at, 2);
  return value;
}
/** Refuse unknown arguments before any effect. */
function noMoreArguments() {
  if (rest.length) throw new Error(`unknown arguments: ${rest.join(" ")}`);
}
const home = userInfo().homedir;
const root = join(home, ".local/state/pi-task-sessions");
const locatorDir = join(home, ".config/pi-task-sessions");
const privateDir = (path) => {
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
};

/** Mutate the snapshot under the same namespace mutex reservations take. */
function update(change) {
  const locator = accountLocator();
  const n = native();
  const handle = n.openMutex(join(locator.root, "namespace.lock"));
  try {
    const identity = n.mutexIdentity(handle);
    if (identity.dev !== locator.lockDev || identity.ino !== locator.lockIno)
      refuse("namespace_lock_replaced");
    if (!n.tryLock(handle)) refuse("namespace_busy");
    try {
      const s = readSnapshot(locator);
      change(s);
      s.generation++;
      validateSnapshot(s);
      durableWrite(join(locator.root, "state.json"), s);
      return s;
    } finally {
      n.unlockMutex(handle);
    }
  } finally {
    n.closeMutex(handle);
  }
}

function summary(s) {
  return {
    namespace: s.namespace,
    generation: s.generation,
    withdrawn: s.withdrawn,
    inventoryComplete: s.inventoryComplete,
    domains: s.domains.map((d) => ({
      akInstance: d.akInstance,
      taskId: d.taskId,
      checkout: d.checkout,
    })),
    enrolled: s.enrolled.map((d) => ({ taskId: d.taskId, checkout: d.checkout })),
    attempts: s.attempts.length,
    snapshotDigest: digest(s),
  };
}

function init() {
  const namespace = option("--namespace", "pi-task-sessions");
  noMoreArguments();
  id(namespace);
  if (existsSync(join(locatorDir, "host.json"))) {
    const s = readSnapshot(accountLocator());
    return { initialized: false, reason: "already_initialized", ...summary(s) };
  }
  if (existsSync(root)) refuse("namespace_root_without_locator");
  mkdirSync(join(home, ".local/state"), { recursive: true });
  privateDir(root);
  for (const name of ["profiles", "credentials", "attempts", "model-sources"])
    privateDir(join(root, name));
  closeSync(
    openSync(
      join(root, "namespace.lock"),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    ),
  );
  chmodSync(join(root, "namespace.lock"), 0o600);
  const state = validateSnapshot({
    schema: "pi.task-session.state.v1",
    namespace,
    generation: 1,
    withdrawn: false,
    inventoryComplete: true,
    domains: [],
    enrolled: [],
    attempts: [],
  });
  durableWrite(join(root, "state.json"), state);
  mkdirSync(join(home, ".config"), { recursive: true });
  privateDir(locatorDir);
  const [rootDev, rootIno] = physicalIdentity(root).split(":").map(Number);
  const { dev: lockDev, ino: lockIno } = lstatSync(join(root, "namespace.lock"));
  durableWrite(join(locatorDir, "host.json"), {
    schema: "pi.task-session.locator.v1",
    namespace,
    root,
    uid: userInfo().uid,
    rootDev,
    rootIno,
    lockDev,
    lockIno,
  });
  return { initialized: true, ...summary(readSnapshot(accountLocator())) };
}

function enroll() {
  const taskId = Number(option("--task"));
  const akInstance = option("--ak-instance", "society-v2");
  const checkout = realpathSync(option("--checkout"));
  noMoreArguments();
  if (!Number.isSafeInteger(taskId) || taskId < 1) refuse("invalid_task");
  id(akInstance);
  // The task must belong to exactly this checkout: AK owns the task-to-repo fact.
  const task = JSON.parse(
    execFileSync("ak", ["task", "show", String(taskId), "-F", "json"], { encoding: "utf8" }),
  );
  if (task.id !== taskId || realpathSync(task.repo) !== checkout) refuse("task_checkout_mismatch");
  const git = commonGit(checkout);
  const domain = {
    akInstance,
    taskId,
    checkout,
    commonGit: git,
    sharedEffects: [],
    physical: { checkout: physicalIdentity(checkout), commonGit: physicalIdentity(git) },
  };
  return summary(
    update((s) => {
      if (s.domains.some((d) => d.akInstance === akInstance && d.taskId === taskId))
        refuse("task_already_inventoried");
      if (s.domains.some((d) => d.akInstance !== akInstance)) refuse("mixed_ak_instances");
      s.domains.push(domain);
      s.enrolled.push(structuredClone(domain));
    }),
  );
}

function producer() {
  noMoreArguments();
  const descriptor = interpretTaskSessionDescriptor(
    JSON.parse(execFileSync("ak", ["task-session", "describe"], { encoding: "utf8", input: "{}" })),
  );
  if (descriptor.state !== "enabled" || !descriptor.bindings) refuse("producer_not_published");
  const locator = accountLocator();
  const published = join(locator.root, "producer.json");
  durableWrite(published, {
    schema: "pi.task-session.producer-binding.v1",
    publication: "owner-approved",
    bindings: descriptor.bindings,
  });
  // The same identity check the host runs before any owner entrypoint: closure, worker, host.
  // A publication that fails it is set aside, never left in place and never deleted.
  let bindings;
  try {
    ({ bindings } = installedProducerPins(locator));
  } catch (error) {
    renameSync(published, `${published}.rejected-${Date.now()}`);
    throw error;
  }
  return {
    published: true,
    policy_generation: bindings.policy_generation,
    policy_sha256: bindings.policy_sha256,
    gate_path: bindings.gate_path,
    worker_sha256: bindings.worker.sha256,
    host_build_digest: bindings.host_build_digest,
  };
}

async function profile() {
  const taskId = Number(option("--task"));
  const model = option("--model");
  const reasoning = option("--reasoning");
  const runSeconds = Number(option("--run-seconds", "3600"));
  const agentDir = realpathSync(option("--agent-dir", join(home, ".pi/agent")));
  noMoreArguments();
  if (!Number.isSafeInteger(taskId) || taskId < 1) refuse("invalid_task");
  const locator = accountLocator();
  const { bindings } = installedProducerPins(locator);
  // The database identity the owner's plan reports, exactly as the host will compare it.
  const plan = JSON.parse(
    execFileSync(bindings.gate_path, ["--", "task-session", "plan"], {
      encoding: "utf8",
      input: JSON.stringify({ task_id: taskId }),
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
    }),
  );
  const { databaseIdentity } = interpretTaskSessionOwnerPlan(plan, bindings);
  // The account's current openai-codex OAuth credential, exactly the four fields the host reads.
  const store = JSON.parse(readFileSync(join(home, ".pi/agent/auth.json"), "utf8"))["openai-codex"];
  if (!store || store.type !== "oauth") refuse("codex_oauth_missing");
  const credential = {
    type: "oauth",
    access: store.access,
    refresh: store.refresh,
    expires: store.expires,
  };
  const account = JSON.parse(
    Buffer.from(credential.access.split(".")[1], "base64url").toString("utf8"),
  )["https://api.openai.com/auth"].chatgpt_account_id;
  // Account ids are identifiers, not secrets; compared in constant time anyway.
  const stored = Buffer.from(String(store.accountId ?? account));
  const claimed = Buffer.from(String(account));
  if (stored.length !== claimed.length || !timingSafeEqual(stored, claimed))
    refuse("credential_account_mismatch");
  const { getModel } = await import("@earendil-works/pi-ai/compat");
  const sdkModel = getModel("openai-codex", model);
  if (!sdkModel) refuse("model_not_in_pinned_catalog");
  const credentialDigest = digest(credential);
  const credentialPath = join(locator.root, "credentials", `${credentialDigest}.json`);
  if (!existsSync(credentialPath)) durableWrite(credentialPath, credential, true);
  const pin = {
    schema: "pi.task-session.profile.v1",
    provider: "openai-codex",
    model,
    reasoning,
    account,
    modelDigest: bytesDigest(JSON.stringify(sdkModel)),
    credentialDigest,
    agentDir,
    runSeconds,
    producer: {
      executable: bindings.gate_path,
      entrypointDigest: bindings.gate_sha256,
      akBinaryDigest: bindings.worker.sha256,
      policyDigest: bindings.policy_sha256,
      databaseIdentity,
      hostBuildDigest: bindings.host_build_digest,
    },
  };
  const reference = digest(pin);
  const profilePath = join(locator.root, "profiles", `${reference}.json`);
  if (!existsSync(profilePath)) durableWrite(profilePath, pin, true);
  await preflightProfile(locator, reference);
  return {
    profile: reference,
    provider: pin.provider,
    model,
    reasoning,
    runSeconds,
    credentialExpires: new Date(credential.expires).toISOString(),
    policyGeneration: bindings.policy_generation,
  };
}

let result;
if (command === "withdraw" || command === "show" || command === "producer") noMoreArguments();
if (command === "init") result = init();
else if (command === "enroll") result = enroll();
else if (command === "withdraw")
  result = summary(
    update((s) => {
      s.withdrawn = true;
    }),
  );
else if (command === "show") result = summary(readSnapshot(accountLocator()));
else if (command === "producer") result = producer();
else if (command === "profile") result = await profile();
else
  throw new Error("usage: task-session-provision.mjs init|enroll|withdraw|show|producer|profile");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
