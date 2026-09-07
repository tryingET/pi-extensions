#!/usr/bin/env node
// Summarize independent synthetic observations without querying any database.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  nativeScenarios,
  nativeSchemas,
  pendingNativeCases,
} from "../tests/task-session-native/coverage.mjs";
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
const expected = nativeSchemas.length * nativeScenarios.length;
assert.match(log, new RegExp(`^ℹ pass ${expected}$`, "m"));
assert.match(log, /^ℹ fail 0$/m);
assert.match(log, /^ℹ todo 0$/m);
assert.match(log, /^ℹ cancelled 0$/m);
assert.match(log, /^ℹ skipped 0$/m);
const runReceipt = JSON.parse(log.trim().split("\n").at(-1));
assert.equal(runReceipt.status, "FROZEN_NATIVE_SOURCE_MATRIX_PASSED");
assert.equal(pendingNativeCases.length, 0);
const roots = [...log.matchAll(/owned synthetic evidence retained: (.+)/g)].map((m) => m[1]);
assert.equal(roots.length, expected);
assert.equal(new Set(roots).size, expected);
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
  assert(
    log.includes(`✔ ACTUAL native AK + sealed Pi schema${end.schemaVersion}: ${end.scenario} (`),
  );
  assert.equal(end.akHead, pins.ak.head);
  assert.equal(end.piHead, pins.pi.head);
  const events = lines(join(root, "host-trace.jsonl"));
  const native = lines(join(root, "native-observations.jsonl"));
  const attempts = json(join(root, "state.json")).attempts;
  const resolution = json(join(root, "fixture.json")).modelResolution;
  let ownerModel = null;
  if (resolution) {
    const profileFile = readdirSync(join(root, "profiles"))[0];
    const profile = json(join(root, "profiles", profileFile));
    const source = json(join(root, "model-sources", `${resolution.sourceDigest}.json`));
    assert.equal(digest(source), resolution.sourceDigest);
    assert.equal(digest(profile), profileFile.slice(0, -5));
    ownerModel = {
      ...resolution,
      profileDigest: digest(profile),
      profileReasoning: profile.reasoning,
      metadataReasoning: source.metadata.reasoning,
      thinkingLevelMap: source.metadata.thinkingLevelMap,
    };
  }
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
    schemaVersion: end.schemaVersion,
    ownerModel,
    calls: end.calls,
    launchError: end.launchError,
    nativeFaultOracle: native
      .filter((n) => n.operation === "--fault-oracle")
      .map((n) => n.observation),
    faultMarkers: Object.fromEntries(
      ["native-fault-consumed.json", "native-fault-reached.json", "native-fault-observed.json"]
        .filter((n) => existsSync(join(root, n)))
        .map((n) => [n, json(join(root, n))]),
    ),
    admission:
      dir && existsSync(join(dir, "ak-admission.json"))
        ? json(join(dir, "ak-admission.json")).body
        : null,
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
        ...readdirSync(root).filter((n) => n.startsWith("native-fault") && n.endsWith(".json")),
        ...readdirSync(root).filter((n) => /^supervisor-(startup|recover)-/.test(n)),
      ]
        .filter((n) => existsSync(join(root, n)))
        .map((n) => [n, sha(readFileSync(join(root, n)))]),
    ),
  };
});
assert.deepEqual(
  cases.map((c) => `${c.schemaVersion}:${c.scenario}`).sort(),
  nativeSchemas.flatMap((v) => nativeScenarios.map((s) => `${v}:${s}`)).sort(),
);
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const summary = {
  schema: "pi.task-session.actual-native-evidence.v2",
  task: 5513,
  status: "actual-frozen-schema40-and43-source-interop-passed-task-not-closed",
  passed: expected,
  schemaVersions: nativeSchemas,
  taskCompletionAuthority: false,
  remainingAcceptanceGates: [
    "parent independent R6/I04 disposition and task authority",
    "public-entrypoint/G2 and installed/live proof",
    "exhaustive database/FK/catalog/crash effect audit",
  ],
  adapterUse:
    "both packed encoders/decoders; orchestrator-encoded startup delivered to actual native supervisor; public fences asserted",
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
    piPackedArtifacts: pins.pi.packedArtifacts,
    piPackEvidenceSha256: pins.pi.packEvidenceSha256,
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
assert.equal(
  digest(summary.harnessSourceHashes),
  runReceipt.harnessSourceDigest,
  "summarizer/harness changed since execution",
);
writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ passed: summary.passed, pending: summary.pending, output }));

if (compactPath) {
  const compact = {
    ...summary,
    rawEvidence: { path: output, sha256: sha(readFileSync(output)) },
    cases: summary.cases.map((c) => ({
      scenario: c.scenario,
      schemaVersion: c.schemaVersion,
      ownerModel: c.ownerModel,
      calls: c.calls,
      launchError: c.launchError,
      nativeFaultOracle:
        Object.keys(c.faultMarkers).length || c.scenario.startsWith("owner-off-null")
          ? [c.nativeFaultOracle[0], c.nativeFaultOracle.at(-1)]
          : undefined,
      faultMarkers: c.faultMarkers,
      admission: c.admission
        ? {
            outcome: c.admission.outcome,
            effects: c.admission.effects,
            reason: c.admission.reason,
            readbackDigest: c.admission.readback_digest,
          }
        : null,
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
      evidenceInventoryDigest: digest(c.evidenceHashes),
      evidenceHashes: Object.fromEntries(
        Object.entries(c.evidenceHashes).filter(([name]) =>
          [
            "host-trace.jsonl",
            "supervisor-trace.jsonl",
            "native-observations.jsonl",
            "harness-end.json",
            "native-fault-reached.json",
            "native-fault-observed.json",
          ].includes(name),
        ),
      ),
    })),
  };
  const { cases: compactCases, ...header } = compact;
  // Keep each committed evidence projection below the repo's file-size budget.
  for (const version of nativeSchemas) {
    const selected = compactCases.filter((c) => c.schemaVersion === version);
    const slice = {
      ...header,
      status: `actual-frozen-schema${version}-source-interop-passed-task-not-closed`,
      passed: selected.length,
      fullMatrixPassed: expected,
      schemaVersions: [version],
    };
    const path = `${compactPath.replace(/\.json$/, "")}-schema${version}.json`;
    const bytes = `${JSON.stringify(slice, null, 2).slice(0, -2)},\n  "cases": [\n${selected.map((c) => `    ${JSON.stringify(c)}`).join(",\n")}\n  ]\n}\n`;
    assert(Buffer.byteLength(bytes) <= 50000, "split evidence further rather than exceed budget");
    writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  }
}
