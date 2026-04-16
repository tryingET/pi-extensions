---
summary: "Session diary for closing task 1477 with an isolated end-to-end proof of pi-autoresearch supervisor projection into attached AK evidence."
read_when:
  - "Reviewing how task 1477 proved the supervisor -> AK milestone path beyond unit tests."
  - "Looking for the exact command shape and observed outputs from the bounded autoresearch proof run."
type: "reference"
system4d:
  container: "Repo-root diary capture for the bounded pi-autoresearch supervisor/projection proof slice."
  compass: "Close the remaining verification gap without overstating the slice as a full autonomous campaign runtime."
  engine: "Inspect task scope -> run targeted package checks -> execute isolated proof -> validate the new docs -> record the outcome."
  fog: "The main risks are mutating the live workspace AK DB during proof, relying only on stubs, or documenting the result too loosely for later review."
---

# Session diary — `pi-autoresearch` end-to-end proof

## Goal
Close task `#1477` by proving that a real bounded `pi-autoresearch` campaign snapshot can flow through the supervisor and land as attached AK milestone evidence.

## AK context
- task: `#1477` — `Run an end-to-end autoresearch proof with supervisor + AK projection evidence`
- parent umbrella: `#1473` — `[UMBRELLA] Add orchestrator supervision and AK milestone projection for autoresearch campaigns`
- scope required paths:
  - `docs/project/pi-autoresearch-e2e-proof.md`
  - `diary/2026-04-16--pi-autoresearch-e2e-proof.md`

## What I checked first
```bash
cd /home/tryinget/ai-society/softwareco/owned/pi-extensions
ak task show 1477
ak task scope show 1477
```

Confirmed:
- scope is limited to `docs/project/**` and `diary/**`
- the two files above are the required durable artifacts

## Main proof command

I used an isolated temporary AK DB so the proof would exercise the real `ak` path without mutating the live workspace task DB.
The repo anchor stayed the real monorepo root, while the temporary campaign cwd lived under `diary/.tmp-autoresearch-proof/` and was deleted after the run.

```bash
cd /home/tryinget/ai-society/softwareco/owned/pi-extensions
set -euo pipefail

db=$(mktemp /tmp/pi-autoresearch-proof-db.XXXXXX.sqlite)
proof_root="diary/.tmp-autoresearch-proof"
campaign_dir="$proof_root/campaigns/widget-speed"
rm -rf "$proof_root"
mkdir -p "$campaign_dir"

ak repo bootstrap --path "$PWD" -d "$db" -F json
anchor_output=$(ak task create -d "$db" -r "$PWD" -P 1 "Autoresearch proof anchor")
task_id=$(printf '%s\n' "$anchor_output" | sed -n 's/^Created task \([0-9][0-9]*\):.*/\1/p')

PROOF_DB="$db" PROOF_TASK_ID="$task_id" node --input-type=module <<'EOF'
import path from 'node:path';
import {
  appendLedgerEvent,
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  campaignEvents,
  createConfigReceipt,
  createLedgerEventEntry,
  createRunReceipt,
  projectAutoresearchLedger,
} from './packages/pi-autoresearch/src/runtime.ts';
import { projectAutoresearchAkMilestone } from './packages/pi-society-orchestrator/src/runtime/autoresearch-ak-projector.ts';

const repoRoot = process.cwd();
const campaignDir = path.join(repoRoot, 'diary/.tmp-autoresearch-proof/campaigns/widget-speed');
const db = process.env.PROOF_DB;
const taskId = Number(process.env.PROOF_TASK_ID);

const config = createConfigReceipt({
  name: 'widget-speed',
  metricName: 'total_ms',
  metricUnit: 'ms',
  direction: 'lower',
  createdAt: 1_000,
  benchmarkCommand: 'bash autoresearch.sh',
  checksCommand: 'bash autoresearch.checks.sh',
});
appendReceipt(campaignDir, config);
appendLedgerEvent(
  campaignDir,
  createLedgerEventEntry(
    campaignEvents.configureSegment({
      name: config.name,
      metricName: config.metricName,
      metricUnit: config.metricUnit,
      direction: config.direction,
      benchmarkCommand: config.benchmarkCommand,
      checksCommand: config.checksCommand,
    }),
    config.createdAt,
  ),
);

const run = createRunReceipt({
  status: 'baseline',
  metric: 24.1,
  metrics: { total_ms: 24.1 },
  description: 'seed baseline',
  timestamp: 2_000,
  benchmarkCommand: 'bash autoresearch.sh',
  checksCommand: 'bash autoresearch.checks.sh',
  checksPassed: true,
});
appendReceipt(campaignDir, run);
appendLedgerEvent(
  campaignDir,
  createLedgerEventEntry(
    campaignEvents.startRun({
      description: 'seed baseline',
      benchmarkCommand: 'bash autoresearch.sh',
      checksCommand: 'bash autoresearch.checks.sh',
    }),
    run.timestamp,
  ),
);
appendLedgerEvent(
  campaignDir,
  createLedgerEventEntry(
    campaignEvents.benchmarkSucceeded({ metric: run.metric, requiresChecks: true }),
    run.timestamp,
  ),
);
appendLedgerEvent(campaignDir, createLedgerEventEntry(campaignEvents.checksSucceeded(), run.timestamp));
appendLedgerEvent(
  campaignDir,
  createLedgerEventEntry(
    campaignEvents.receiptRecorded({ status: run.status, metric: run.metric }),
    run.timestamp,
  ),
);

const runtime = buildAutoresearchRuntimeStatus(campaignDir);
const ledgerProjection = projectAutoresearchLedger(campaignDir);
const ledger = {
  context: {
    blockedReason: ledgerProjection.context.blockedReason,
    completionReason: ledgerProjection.context.completionReason,
  },
};

const first = await projectAutoresearchAkMilestone({
  taskId,
  akPath: 'ak',
  societyDb: db,
  runtime,
  ledger,
});
const second = await projectAutoresearchAkMilestone({
  taskId,
  akPath: 'ak',
  societyDb: db,
  runtime,
  ledger,
});

console.log(
  JSON.stringify(
    {
      runtimeState: runtime.runtimeProjection.state,
      first: {
        ok: first.ok,
        action: first.action,
        via: first.evidence?.via ?? null,
        checkType: first.candidate.payload?.checkType ?? null,
        projectionKey: first.candidate.payload?.details.projection_key ?? null,
        summary: first.candidate.payload?.details.summary ?? null,
      },
      second: {
        ok: second.ok,
        action: second.action,
        existingEvidenceId: second.existingEvidenceId ?? null,
      },
    },
    null,
    2,
  ),
);
EOF

sqlite3 "$db" -json "SELECT id, task_id, check_type, result, json_extract(details, '$.milestone') AS milestone, json_extract(details, '$.runtime.state') AS runtime_state, json_extract(details, '$.summary') AS summary, json_extract(details, '$.receipts.path') AS receipt_path, json_extract(details, '$.ledger.path') AS ledger_path FROM evidence ORDER BY id;"

rm -rf "$proof_root"
rm -f "$db"
```

## Observed proof output

Key projector result:

```json
{
  "runtimeState": "awaiting_decision",
  "first": {
    "ok": true,
    "action": "recorded",
    "via": "ak",
    "checkType": "autoresearch:milestone:decision-required",
    "projectionKey": "decision-required|segment:widget-speed|metric:total_ms|direction:lower|benchmark:bash%20autoresearch.sh|checks:bash%20autoresearch.checks.sh|runs:1|success:1|last:baseline|last_metric:24.1|baseline:24.1|best:24.1|blocked:none|completed:none",
    "summary": "1 runs recorded; best total_ms is 24.1 ms; awaiting next bounded decision."
  },
  "second": {
    "ok": true,
    "action": "already-projected",
    "existingEvidenceId": 2
  }
}
```

Key isolated-DB evidence query result:

```json
[
  {
    "id": 1,
    "task_id": null,
    "check_type": "repo:bootstrap",
    "result": "pass",
    "milestone": null,
    "runtime_state": null,
    "summary": null,
    "receipt_path": null,
    "ledger_path": null
  },
  {
    "id": 2,
    "task_id": 1,
    "check_type": "autoresearch:milestone:decision-required",
    "result": "pass",
    "milestone": "decision-required",
    "runtime_state": "awaiting_decision",
    "summary": "1 runs recorded; best total_ms is 24.1 ms; awaiting next bounded decision.",
    "receipt_path": "/home/tryinget/ai-society/softwareco/owned/pi-extensions/diary/.tmp-autoresearch-proof/campaigns/widget-speed/autoresearch.jsonl",
    "ledger_path": "/home/tryinget/ai-society/softwareco/owned/pi-extensions/diary/.tmp-autoresearch-proof/campaigns/widget-speed/autoresearch.events.jsonl"
  }
]
```

## What the proof showed
1. The bounded `pi-autoresearch` runtime helpers produced a real `awaiting_decision` campaign snapshot from local receipts plus the event ledger.
2. The supervisor/projector path classified that snapshot as `decision-required`.
3. The first projection wrote attached evidence through the real `ak` path (`via: "ak"`).
4. The second projection deduped correctly and returned `already-projected`.

## Output written
- `docs/project/pi-autoresearch-e2e-proof.md`
- `diary/2026-04-16--pi-autoresearch-e2e-proof.md`

## Verification run
```bash
cd packages/pi-society-orchestrator && node --test tests/autoresearch-supervisor.test.mjs tests/autoresearch-ak-projector.test.mjs

tmpdir=$(mktemp -d)
mkdir -p "$tmpdir/docs/project" "$tmpdir/diary"
cp docs/project/pi-autoresearch-e2e-proof.md "$tmpdir/docs/project/"
cp diary/2026-04-16--pi-autoresearch-e2e-proof.md "$tmpdir/diary/"
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs \
  --docs "$tmpdir/docs/project" \
  --docs "$tmpdir/diary" \
  --strict

git diff --check -- docs/project/pi-autoresearch-e2e-proof.md diary/2026-04-16--pi-autoresearch-e2e-proof.md
```

Note:
- strict docs validation is intentionally scoped to the two new artifacts because the repo still has unrelated pre-existing docs debt outside this task.

## Outcome
The final verification item named in the AK projection contract is now closed: a real bounded `pi-autoresearch` campaign can produce one attached AK milestone evidence row through the orchestrator path, and unchanged re-projection stays idempotent.
