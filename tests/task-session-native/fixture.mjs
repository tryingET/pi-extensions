import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { digest, json, sha } from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));
export async function wait(predicate, label, milliseconds = 125000) {
  const deadline = Date.now() + milliseconds;
  while (!predicate()) {
    assert(Date.now() < deadline, `timeout: ${label}`);
    await delay(10);
  }
}
export const trace = (root, name = "host") => {
  const path = join(root, `${name}-trace.jsonl`);
  if (!existsSync(path)) return [];
  const bytes = readFileSync(path, "utf8");
  return bytes
    .slice(0, bytes.lastIndexOf("\n") + 1)
    .split("\n")
    .filter(Boolean)
    .map((s) => JSON.parse(s));
};
export function available(path) {
  const result = spawnSync("/usr/bin/flock", ["-n", path, "/usr/bin/true"]);
  assert([0, 1].includes(result.status), "flock probe failed, not evidence of exclusion");
  appendFileSync(
    join(dirname(dirname(path)), "observer-trace.jsonl"),
    `${JSON.stringify({ event: "independent-flock", at: Date.now(), available: result.status === 0 })}\n`,
  );
  return result.status === 0;
}
export function native(pins, root, operation) {
  // No AK command dispatch/default DB/environment. Only the unshipped bounded fixture API.
  const result = spawnSync(
    pins.artifacts.native_fixture.path,
    [operation, join(root, "new-synthetic.db")],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 1048576,
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TMPDIR: root, HOME: join(root, "home") },
    },
  );
  assert.equal(result.status, 0, `native ${operation}: ${result.stderr} ${result.error ?? ""}`);
  const parsed = result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
  appendFileSync(
    join(root, "native-observations.jsonl"),
    `${JSON.stringify({ operation, at: Date.now(), code: result.status, observation: parsed })}\n`,
  );
  return parsed;
}
export async function setup(pins, scenario) {
  const temp = realpathSync(process.env.TMPDIR);
  const root = mkdtempSync(join(temp, "task5479-native-process-task5513-"));
  process.stderr.write(`task5513 owned synthetic root: ${root}\n`);
  // Fail before SDK import/DB creation rather than capture ambient instructions.
  for (let path = temp; ; path = dirname(path)) {
    for (const name of ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"])
      assert(!existsSync(join(path, name)), `non-synthetic resource ancestor: ${join(path, name)}`);
    if (path === dirname(path)) break;
  }
  const runtimeRoot = pins.pi.runtimeRoot ?? join(pins.pi.root, "packages/pi-little-helpers");
  const distPath = join(runtimeRoot, "dist/task-session");
  const dist = pathToFileURL(distPath).href;
  const state = await import(`${dist}/state.js`);
  const { installedHostBuild } = await import(`${dist}/build-identity.js`);
  const require = createRequire(join(runtimeRoot, "package.json"));
  const sdkRoot = require.resolve
    .paths("@earendil-works/pi-ai")
    .map((p) => join(p, "@earendil-works/pi-ai"))
    .find((p) => existsSync(join(p, "package.json")));
  assert(sdkRoot);
  const { getModel } = await import(
    pathToFileURL(join(sdkRoot, json(join(sdkRoot, "package.json")).exports["./compat"].import))
      .href
  );
  const seed = native(pins, root, "--initialize");
  const checkout = seed.repo; // Actual native registered repo, not a hand-authored task/baseline.
  mkdirSync(join(checkout, ".git"));
  mkdirSync(join(checkout, "src"));
  for (const name of ["agent", "home", "profiles", "credentials", "attempts", "ak-locks"])
    mkdirSync(join(root, name), { mode: 0o700 });
  writeFileSync(
    join(root, "agent", "SYSTEM.md"),
    "Synthetic hermetic task5513 SDK integration only.",
  );
  writeFileSync(join(root, "namespace.lock"), "", { mode: 0o600 });
  const r = lstatSync(root),
    l = lstatSync(join(root, "namespace.lock"));
  const locator = {
    schema: "pi.task-session.locator.v1",
    namespace: "synthetic-task5513",
    root,
    uid: process.getuid(),
    rootDev: r.dev,
    rootIno: r.ino,
    lockDev: l.dev,
    lockIno: l.ino,
  };
  const domain = {
    akInstance: "synthetic-task5513",
    taskId: seed.task_id,
    checkout,
    commonGit: join(checkout, ".git"),
    sharedEffects: [],
    physical: {
      checkout: state.physicalIdentity(checkout),
      commonGit: state.physicalIdentity(join(checkout, ".git")),
    },
  };
  state.durableWrite(join(root, "state.json"), {
    schema: "pi.task-session.state.v1",
    namespace: locator.namespace,
    generation: 1,
    withdrawn: false,
    inventoryComplete: true,
    domains: [domain],
    enrolled: [domain],
    attempts: [],
  });
  const db = join(root, "new-synthetic.db"),
    locks = join(root, "ak-locks");
  const lock = join(locks, `db-${sha(db)}.lock`);
  writeFileSync(lock, "", { mode: 0o600 });
  const host = join(root, "host");
  // Fixed newly generated test executable. Production public host remains unmodified and fenced.
  writeFileSync(
    host,
    `#!/usr/bin/python3\nimport os\nos.execv(${JSON.stringify(process.execPath)}, ${JSON.stringify([process.execPath, join(here, "host.mjs"), root, dist])})\n`,
    { mode: 0o700 },
  );
  const protocol = join(pins.ak.root, "docs/project/contracts/task-session-protocol-v1.json");
  const policy = {
    schema_version: 1,
    status: "normal",
    operator_entrypoint: { kind: "exclusive_runtime_gate" },
    admission_gate: {
      protocol: "flock_exclusive_v1",
      gates_reads_and_writes: true,
      lock_identity: "sha256_of_canonical_database_path",
      location_kind: "stable_home_state",
      lock_directory: locks,
    },
    approved_binary: {
      path: pins.artifacts.native_fixture.path,
      sha256: pins.artifacts.native_fixture.sha256,
    },
    database: { path: db },
    task_session: {
      bulk_recovery_suspended: true,
      host_sha256: sha(readFileSync(host)),
      host_build_digest: installedHostBuild(),
      protocol_sha256: sha(readFileSync(protocol)),
      supervisor_sha256: sha(
        readFileSync(join(pins.ak.root, "scripts/ak-task-session-supervisor.py")),
      ),
    },
  };
  writeFileSync(join(root, "policy.json"), JSON.stringify(policy), { mode: 0o600 });
  writeFileSync(
    join(root, "mode"),
    scenario === "commit-result-loss" ? "native-exit-after-result" : "normal",
  );
  const credential = {
    type: "oauth",
    access: `synthetic.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "synthetic-account" } })).toString("base64url")}.synthetic`,
    refresh: "synthetic",
    expires: Date.now() + 3600000,
  };
  state.durableWrite(join(root, "credentials", `${digest(credential)}.json`), credential, true);
  const dbStat = lstatSync(db);
  const pin = {
    schema: "pi.task-session.profile.v1",
    provider: "openai-codex",
    model: "gpt-5.4",
    reasoning: "high",
    account: "synthetic-account",
    modelDigest: sha(JSON.stringify(getModel("openai-codex", "gpt-5.4"))),
    credentialDigest: digest(credential),
    agentDir: join(root, "agent"),
    runSeconds: 30,
    producer: {
      executable: host,
      entrypointDigest: policy.task_session.host_sha256,
      akBinaryDigest: policy.approved_binary.sha256,
      policyDigest: sha(readFileSync(join(root, "policy.json"))),
      databaseIdentity: digest({ path: db, device: dbStat.dev, inode: dbStat.ino }),
      hostBuildDigest: installedHostBuild(),
    },
  };
  let modelResolution;
  if (scenario === "owner-model-recover") {
    mkdirSync(join(root, "model-sources"), { mode: 0o700 });
    const source = {
      schema: "pi.task-session.model-source.v1",
      implementation: "pinned-native-codex-sse-v1",
      requested: {
        provider: "synthetic-owner",
        model: "synthetic-requested-alias",
        account: pin.account,
      },
      resolved: {
        provider: "synthetic-wire-provider",
        model: "synthetic-native-wire-model",
        account: pin.account,
      },
      api: "openai-codex-responses",
      baseUrl: "https://chatgpt.com/backend-api",
      transport: "sse",
      auth: { kind: "oauth", provider: "openai-codex", refresh: false },
      metadata: {
        name: "Synthetic task5513 owner model",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 131072,
        maxTokens: 8192,
        costMicroUsdPerMillion: {
          input: 1250000,
          output: 9000000,
          cacheRead: 125000,
          cacheWrite: 0,
        },
        thinkingLevelMap: {
          off: "none",
          minimal: "minimal",
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "xhigh",
          max: null,
        },
      },
    };
    assert.equal(getModel("openai-codex", source.resolved.model), undefined);
    const sourceDigest = digest(source);
    state.durableWrite(join(root, "model-sources", `${sourceDigest}.json`), source, true);
    const { loadOwnerModel } = await import(`${dist}/model-source.js`);
    const loaded = loadOwnerModel(locator, sourceDigest, source.requested);
    Object.assign(pin, {
      schema: "pi.task-session.profile.v2",
      ...source.requested,
      modelSourceDigest: sourceDigest,
      modelDigest: sha(JSON.stringify(loaded.model)),
    });
    modelResolution = {
      schema: "pi.task-session.model-resolution.v1",
      implementation: source.implementation,
      requested: source.requested,
      resolved: source.resolved,
      sourceDigest,
      modelDigest: pin.modelDigest,
    };
  }
  if (scenario === "profile-mismatch") pin.modelDigest = "0".repeat(64);
  if (scenario === "pin-mismatch") pin.producer.policyDigest = "0".repeat(64);
  const request = {
    schema: "pi.task-session.request.v1",
    requestId: `task5513-${scenario}`,
    akInstance: domain.akInstance,
    taskId: seed.task_id,
    cwd: checkout,
    provider: pin.provider,
    model: pin.model,
    reasoning: pin.reasoning,
    account: pin.account,
    profile: digest(pin),
    objective: "Write the synthetic task5513 native SDK proof in src/proof.txt",
    context: [],
    placement: "window",
  };
  state.durableWrite(join(root, "profiles", `${request.profile}.json`), pin, true);
  const config = {
    locator,
    checkout,
    scenario,
    lock,
    akRoot: pins.ak.root,
    protocol,
    syntheticAccess: credential.access,
    objective: request.objective,
    dist,
    expectedModel: modelResolution?.resolved.model ?? pin.model,
    modelResolution,
  };
  writeFileSync(join(root, "fixture.json"), JSON.stringify(config), { mode: 0o600 });
  return { root, checkout, locator, request, pin, config, dist, state, pins, lock };
}
export function startSupervisor(f, payload, mode = "startup") {
  const invocation = (f.invocations ?? 0) + 1;
  f.invocations = invocation;
  const child = spawn("/usr/bin/python3", ["-B", join(here, "supervisor.py"), f.root, mode], {
    cwd: f.root,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TMPDIR: f.root, HOME: join(f.root, "home") },
  });
  let out = "",
    err = "";
  child.stdout.on("data", (d) => {
    out += d;
  });
  child.stderr.on("data", (d) => {
    err += d;
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const result = { code, signal, out, err };
      writeFileSync(join(f.root, `supervisor-${mode}-${invocation}.json`), JSON.stringify(result));
      resolve(result);
    });
  });
  child.stdin.on("error", () => {});
  child.stdin.end(JSON.stringify(payload));
  return { child, done };
}
export function hostAlive(f) {
  const path = join(f.root, "host-pid.json");
  if (!existsSync(path)) return false;
  const identity = json(path);
  try {
    const fields = readFileSync(`/proc/${identity.pid}/stat`, "utf8").split(") ")[1].split(" ");
    return fields[19] === identity.stat && fields[0] !== "Z";
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
}
export function signalOwnedHost(f) {
  if (hostAlive(f)) process.kill(json(join(f.root, "host-pid.json")).pid, "SIGTERM");
}
