// summary: Exercises the real packed runtime with isolated cold-start IPC, messaging, and OS-process teardown.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = fs.realpathSync(process.argv[2]);
const layout = process.argv[3];
assert.ok(["hoisted", "nested"].includes(layout));
const requirePackage = createRequire(path.join(packageRoot, "package.json"));
const cli = requirePackage.resolve("tsx/cli");
const nested = path.join(packageRoot, "node_modules/tsx/dist/cli.mjs");
assert.equal(cli === nested, layout === "nested", `Unexpected ${layout} launcher layout: ${cli}`);
const manifest = requirePackage("./package.json");
assert.equal(manifest.dependencies.tsx, "4.23.13");
// Omit an extra prefix: managed TMPDIRs already approach Linux's Unix socket limit.
const runtimeDir = fs.mkdtempSync(`${os.tmpdir()}${path.sep}`);
const pidPath = path.join(runtimeDir, "broker.pid");
const socketPath = path.join(runtimeDir, "broker.sock");
if (process.platform !== "win32") {
  assert.ok(Buffer.byteLength(socketPath) < 108, "TMPDIR is too long for the broker Unix socket");
}
const { createPeerMessagingRuntime } = await import(
  pathToFileURL(path.join(packageRoot, "index.ts")).href
);
const runtimes = [];
let brokerPid;
let brokerStart;
function processIdentity(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform !== "linux") return "present";
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  } catch (error) {
    if (["ESRCH", "ENOENT"].includes(error.code)) return undefined;
    throw error;
  }
}
const gone = () =>
  !fs.existsSync(pidPath) && (!brokerPid || processIdentity(brokerPid) !== brokerStart);
async function waitFor(predicate, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Installed broker smoke timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
const message = (text, replyTo) => ({
  id: randomUUID(),
  timestamp: Date.now(),
  replyTo,
  content: { text },
});
async function cleanup() {
  const disconnected = await Promise.allSettled(runtimes.map((runtime) => runtime.disconnect()));
  try {
    await waitFor(gone);
  } catch (error) {
    // Signal only the captured owned process, and only while its Linux identity
    // still matches. A fallback kill fails the smoke; it is not teardown proof.
    if (
      process.platform === "linux" &&
      brokerPid &&
      brokerStart &&
      processIdentity(brokerPid) === brokerStart
    ) {
      process.kill(brokerPid, "SIGTERM");
      await waitFor(gone);
    }
    throw error;
  }
  assert.equal(fs.existsSync(socketPath), false);
  fs.rmSync(runtimeDir, { recursive: true });
  for (const result of disconnected) {
    if (result.status === "rejected") throw result.reason;
  }
}

try {
  const alice = await createPeerMessagingRuntime({
    id: "installed-alice",
    cwd: packageRoot,
    model: "fixture",
    runtimeDir,
    idleShutdownMs: 250,
  });
  runtimes.push(alice);
  brokerPid = Number(fs.readFileSync(pidPath, "utf8").trim());
  assert.ok(Number.isInteger(brokerPid) && brokerPid > 1);
  brokerStart = processIdentity(brokerPid);
  assert.ok(brokerStart, "The owned broker must be a live OS process");
  const bob = await createPeerMessagingRuntime({
    id: "installed-bob",
    cwd: packageRoot,
    model: "fixture",
    runtimeDir,
    idleShutdownMs: 250,
  });
  runtimes.push(bob);
  assert.equal((await alice.status()).connected, true);
  assert.equal((await alice.listPeers()).length, 2);
  let received = false;
  const replies = [];
  bob.onMessage((from, incoming) => {
    if (incoming.content.text === "send-proof") received = true;
    if (incoming.content.text === "ask-proof")
      replies.push(bob.send({ to: from.id, message: message("reply-proof", incoming.id) }));
  });
  const bobId = (await bob.status()).selfId;
  assert.equal((await alice.send({ to: bobId, message: message("send-proof") })).delivered, true);
  await waitFor(() => received);
  const reply = await alice.ask({ to: bobId, message: message("ask-proof"), timeoutMs: 5_000 });
  assert.equal(reply.content.text, "reply-proof");
  for (const delivery of await Promise.all(replies)) assert.equal(delivery.delivered, true);
} finally {
  await cleanup();
}
console.log(
  JSON.stringify({
    installedBrokerSmoke: "passed",
    package: manifest.name,
    version: manifest.version,
    layout,
    launcher: cli,
    node: process.version,
    brokerPid,
    brokerStart,
    proof:
      "cold-start, two peers, send, correlated ask/reply, disconnect, original OS process gone",
  }),
);
