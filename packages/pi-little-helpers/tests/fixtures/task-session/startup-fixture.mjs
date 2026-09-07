import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@earendil-works/pi-ai/compat";
import { installedHostBuild } from "../../../dist/task-session/build-identity.js";
import { bytesDigest, digest } from "../../../dist/task-session/json.js";
import { loadOwnerModel } from "../../../dist/task-session/model-source.js";
import { durableWrite, physicalIdentity } from "../../../dist/task-session/state.js";
export function setup(stop = false, root = mkdtempSync(join(tmpdir(), "task5480-e2e-"))) {
  const checkout = join(root, "checkout");
  mkdirSync(checkout);
  mkdirSync(join(checkout, ".git"));
  for (const dir of ["profiles", "credentials", "attempts", "agent"])
    mkdirSync(join(root, dir), { mode: 0o700 });
  const lock = join(root, "namespace.lock");
  writeFileSync(lock, "", { mode: 0o600 });
  const rs = lstatSync(root),
    ls = lstatSync(lock);
  const locator = {
    schema: "pi.task-session.locator.v1",
    namespace: "synthetic",
    root,
    uid: process.getuid(),
    rootDev: rs.dev,
    rootIno: rs.ino,
    lockDev: ls.dev,
    lockIno: ls.ino,
  };
  const domain = {
    akInstance: "synthetic-ak",
    taskId: 1,
    checkout,
    commonGit: join(checkout, ".git"),
    sharedEffects: [],
    physical: {
      checkout: physicalIdentity(checkout),
      commonGit: physicalIdentity(join(checkout, ".git")),
    },
  };
  durableWrite(join(root, "state.json"), {
    schema: "pi.task-session.state.v1",
    namespace: "synthetic",
    generation: 1,
    withdrawn: false,
    inventoryComplete: true,
    domains: [domain],
    enrolled: [domain],
    attempts: [],
  });
  const credential = {
    type: "oauth",
    access: `synthetic.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "synthetic-account" } })).toString("base64url")}.synthetic`,
    refresh: "synthetic",
    expires: Date.now() + 3600000,
  };
  const cd = digest(credential);
  durableWrite(join(root, "credentials", `${cd}.json`), credential, true);
  const pin = {
    schema: "pi.task-session.profile.v1",
    provider: "openai-codex",
    model: "gpt-5.4",
    reasoning: "high",
    account: "synthetic-account",
    modelDigest: bytesDigest(JSON.stringify(getModel("openai-codex", "gpt-5.4"))),
    credentialDigest: cd,
    agentDir: join(root, "agent"),
    runSeconds: 30,
    producer: {
      executable: realpathSync("/usr/bin/true"),
      entrypointDigest: bytesDigest(readFileSync("/usr/bin/true")),
      akBinaryDigest: bytesDigest(readFileSync("/usr/bin/true")),
      policyDigest: "a".repeat(64),
      databaseIdentity: "b".repeat(64),
      hostBuildDigest: installedHostBuild(),
    },
  };
  const reference = digest(pin);
  durableWrite(join(root, "profiles", `${reference}.json`), pin, true);
  const request = {
    schema: "pi.task-session.request.v1",
    requestId: "synthetic-request",
    akInstance: "synthetic-ak",
    taskId: 1,
    cwd: checkout,
    provider: pin.provider,
    model: pin.model,
    reasoning: pin.reasoning,
    account: pin.account,
    profile: reference,
    objective: "write synthetic evidence",
    context: [],
    placement: "window",
  };
  writeFileSync(join(root, "fixture.json"), JSON.stringify({ locator, checkout, stop }));
  return { root, checkout, locator, request, pin };
}

/** Entirely synthetic: these aliases assert no actual Astra/Codex service mapping. */
export function provisionOwnerModel(f, mutate = () => {}) {
  mkdirSync(join(f.root, "model-sources"), { mode: 0o700 });
  const source = {
    schema: "pi.task-session.model-source.v1",
    implementation: "pinned-native-codex-sse-v1",
    requested: {
      provider: "synthetic-astra-provider",
      model: "synthetic-astra-label",
      account: f.pin.account,
    },
    resolved: {
      provider: "synthetic-wire-provider",
      model: "synthetic-nonbuiltin-codex-wire",
      account: f.pin.account,
    },
    api: "openai-codex-responses",
    baseUrl: "https://chatgpt.com/backend-api",
    transport: "sse",
    auth: { kind: "oauth", provider: "openai-codex", refresh: false },
    metadata: {
      name: "Synthetic owner model",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 131072,
      maxTokens: 8192,
      costMicroUsdPerMillion: { input: 1250000, output: 9000000, cacheRead: 125000, cacheWrite: 0 },
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
  assertNoBuiltin(source);
  const initial = digest(source);
  durableWrite(join(f.root, "model-sources", `${initial}.json`), source, true);
  const modelDigest = bytesDigest(
    JSON.stringify(loadOwnerModel(f.locator, initial, source.requested).model),
  );
  const requested = structuredClone(source.requested);
  mutate(source);
  const modelSourceDigest = digest(source);
  if (modelSourceDigest !== initial)
    durableWrite(join(f.root, "model-sources", `${modelSourceDigest}.json`), source, true);
  const pin = {
    ...f.pin,
    schema: "pi.task-session.profile.v2",
    ...requested,
    modelDigest,
    modelSourceDigest,
  };
  const reference = digest(pin);
  durableWrite(join(f.root, "profiles", `${reference}.json`), pin, true);
  return { ...f, pin, source, request: { ...f.request, ...requested, profile: reference } };
}
function assertNoBuiltin(source) {
  if (getModel("openai-codex", source.resolved.model) !== undefined)
    throw Error("fixture_must_be_nonbuiltin");
}
