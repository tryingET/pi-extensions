#!/usr/bin/env node
// Summarize independent synthetic observations without querying any database.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingNativeCases } from "../tests/task-session-native/coverage.mjs";
import {
  digest,
  head,
  inventory,
  json,
  sha,
  verifyPins,
} from "../tests/task-session-native/pins.mjs";

const [pinPath, logPath, output, compactPath] = process.argv.slice(2);
assert(pinPath && logPath && output);
const pins = await verifyPins(json(pinPath));
const log = readFileSync(logPath, "utf8");
assert.match(log, /pass 16/);
assert.match(log, /fail 0/);
assert.match(log, /todo 4/);
const roots = [...log.matchAll(/owned synthetic evidence retained: (.+)/g)].map((m) => m[1]);
assert.equal(new Set(roots).size, 16);
const lines = (p) =>
  existsSync(p)
    ? readFileSync(p, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((s) => JSON.parse(s))
    : [];
const cases = roots.map((root) => {
  const end = json(join(root, "harness-end.json"));
  assert(log.includes(`✔ ACTUAL native AK + sealed Pi: ${end.scenario} (`));
  const events = lines(join(root, "host-trace.jsonl"));
  const native = lines(join(root, "native-observations.jsonl"));
  const attempts = json(join(root, "state.json")).attempts;
  const dir = attempts.length
    ? join(root, "attempts", attempts[0].attempt, attempts[0].incarnation)
    : null;
  const receipts = dir
    ? Object.fromEntries(
        readdirSync(dir)
          .filter(
            (n) => n.endsWith(".json") && !["observation.json", "viewer-ready.json"].includes(n),
          )
          .map((n) => {
            const path = join(dir, n);
            try {
              return [n, sha(readFileSync(path))];
            } catch (e) {
              assert.equal(e.code, "EISDIR");
              return [n, "fault-injected-directory"];
            }
          }),
      )
    : {};
  const proof = join(root, "repo/src/proof.txt");
  const taskSnapshots = native
    .filter((n) => n.operation === "--inspect")
    .map((n) => ({
      status: n.observation.task.status,
      version: n.observation.task.entity_version,
      claimant: n.observation.task.claimed_by,
      leaseExpired: n.observation.lease_expired,
      digest: digest(n.observation),
      maxMigration: Math.max(...n.observation.families.migrations.map((r) => Number(r.version))),
    }));
  const observer = lines(join(root, "observer-trace.jsonl"));
  return {
    scenario: end.scenario,
    status: "passed",
    root,
    host: existsSync(join(root, "host-result.json")) ? json(join(root, "host-result.json")) : null,
    taskSnapshots,
    frames: events
      .filter((e) => e.value)
      .map((e) => ({ direction: e.event, kind: e.value.kind ?? e.value.schema, at: e.at })),
    sends: events.filter((e) => e.event === "fetch"),
    custody: events.filter((e) => e.event === "fd-custody"),
    flock: observer,
    reservation: attempts.map((a) => ({
      attempt: a.attempt,
      hostClosed: a.hostClosed,
      effectsDisposed: a.effectsDisposed,
      claimResolved: a.claimResolved,
    })),
    proofSha256: existsSync(proof) ? sha(readFileSync(proof)) : null,
    receiptHashes: receipts,
    evidenceHashes: Object.fromEntries(
      [
        "host-trace.jsonl",
        "native-observations.jsonl",
        "observer-trace.jsonl",
        "supervisor-trace.jsonl",
        "state.json",
        "harness-end.json",
        ...readdirSync(root).filter((n) => /^supervisor-(startup|recover)-/.test(n)),
      ]
        .filter((n) => existsSync(join(root, n)))
        .map((n) => [n, sha(readFileSync(join(root, n)))]),
    ),
  };
});
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const summary = {
  schema: "pi.task-session.actual-native-evidence.v1",
  task: 5513,
  status: "actual-frozen-schema43-interop-passed-overall-pending",
  passed: 16,
  failed: 0,
  pending: pendingNativeCases,
  nativeReleasePin: false,
  publicEntryPointPositiveProof: false,
  liveProvider: false,
  fullDatabaseEffectAudit: false,
  freeze: {
    packet: pins.packet,
    pinsSha256: sha(readFileSync(pinPath)),
    akCommit: pins.ak.head,
    akSourceFiles: Object.keys(pins.ak.sources).length,
    akSourceDigest: digest(pins.ak.sources),
    nonGitBuildAppendix: pins.ak.nonGitBuildAppendix,
    ownerExportReceiptSha256: pins.ak.receiptSha256,
    ownerSourceIdentitySha256: sha(readFileSync(pins.ak.identity)),
    artifacts: pins.artifacts,
    piRef: pins.pi.head,
    piTarSha256: pins.pi.tarHash,
    piSourceDigest: digest(pins.pi.sources),
    piRuntimeInventoryDigest: digest(pins.pi.runtimeInventory),
    piRuntimeFiles: Object.keys(pins.pi.runtimeInventory).length,
    observedLiveHeadsAtFreeze: pins.observedLiveHeads,
  },
  log: { name: basename(logPath), sha256: sha(readFileSync(logPath)) },
  observerRepoHead: head(repo),
  harnessSourceHashes: inventory(repo, [
    "tests/task-session-native",
    ...readdirSync(join(repo, "scripts"))
      .filter((n) => n.startsWith("task-session-native") && n.endsWith(".mjs"))
      .map((n) => `scripts/${n}`),
  ]),
  cases,
};
writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ passed: summary.passed, pending: summary.pending, output }));

if (compactPath) {
  const compact = {
    ...summary,
    rawEvidence: { path: output, sha256: sha(readFileSync(output)) },
    cases: summary.cases.map((c) => ({
      scenario: c.scenario,
      status: c.status,
      root: c.root,
      host: c.host,
      taskSnapshots: c.taskSnapshots.map(({ claimant, ...state }) => state),
      sendProfiles: c.sends.map(({ at, bodyKeys, event, ...profile }) => profile),
      flock: {
        excluded: c.flock.filter((p) => !p.available).length,
        available: c.flock.filter((p) => p.available).length,
      },
      custody: c.custody.map((c) => ({
        ordinaryExecExit: c.ordinaryExecExit,
        ordinaryExecLeaked: c.ordinaryExecLeaked,
        flags: c.held.map((fd) => /^flags:\s+(\d+)/m.exec(fd.info)?.[1]),
      })),
      reservation: c.reservation,
      proofSha256: c.proofSha256,
      receiptHashes: Object.fromEntries(
        Object.entries(c.receiptHashes).filter(([n]) =>
          [
            "ak-admission.json",
            "t1.json",
            "dispatch.json",
            "ak-recovery-result.json",
            "host-closure.json",
          ].includes(n),
        ),
      ),
      evidenceHashes: c.evidenceHashes,
    })),
  };
  const { cases: compactCases, ...header } = compact;
  const bytes = `${JSON.stringify(header, null, 2).slice(0, -2)},\n  "cases": [\n${compactCases.map((c) => `    ${JSON.stringify(c)}`).join(",\n")}\n  ]\n}\n`;
  writeFileSync(compactPath, bytes, { flag: "wx", mode: 0o600 });
}
