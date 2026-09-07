---
summary: "Task5480 implementation interface and evidence: DB-free lane classification, sealed host and explicit integration gates."
read_when:
  - "Consuming task5480 from lane task5481 or AK task5479."
type: implementation_evidence
---

# Decision151 Pi implementation — task5480

## Execution boundary

Authorized source worktree: `decision151-main.5gPphB/pi-extensions`, branch `main`, starting `db59f632e`. Canonical AK identity remains the original pi-extensions repo. No AK calls, registration, live activation, enrollment, credential/config reads or provider calls are authorized here. Synthetic data only.

## Lane producer interface — planned v1, published before implementation

Public emitted export: `@tryinget/pi-little-helpers/task-session-core`.
Function: `classifyTaskSessionRequest(request)` (synchronous, data-only return).
CLI: `pi-task-session classify` receives exactly one bounded UTF-8 JSON object on stdin, returns exactly one JSON object on stdout. No other options, environment namespace override, DB call, subprocess, reservation, or directory creation. `--help` needs no namespace.

Request (all fields mandatory, no unknown fields):

```json
{"schema":"pi.task-session.classify-request.v1","requestId":"caller-stable-id","akInstance":"canonical-owner-instance","taskIds":[123,456],"cwd":"/absolute/existing/checkout"}
```

Maximum 256 unique positive safe-integer task IDs, requestId 1–128 ASCII `[A-Za-z0-9._-]`, total input 64 KiB. Duplicate JSON keys, IDs, unknown fields, invalid UTF-8, empty batches or noncanonical paths refuse. The lane MUST validate the entire legacy argv (including unsupported/duplicate semantic options) before requesting classification; MUST submit all task IDs; MUST NOT partially launch a mixed request.

Response shape (v1):

```json
{"schema":"pi.task-session.classification.v1","producer":{"package":"@tryinget/pi-little-helpers","version":"0.9.0","interface":"pi.task-session.classification.v1"},"requestDigest":"sha256-of-canonical-request","namespace":null,"classification":"unknown","reasons":["not_configured"]}
```

Configured `namespace` is `{id,generation,snapshotDigest}`. Classification is `outside|enrolled|unknown`. Only `outside` permits considering legacy behavior; this is NOT task admission. Mixed/enrolled/occupied domains return `enrolled`; any missing/ambiguous custody/domain/task inventory or producer incompatibility returns `unknown`. Missing configuration never proves outside enrollment. Consumers pin the exact emitted artifact in rollout evidence in addition to checking package/version/interface and request digest. No second registry: classification reads the same owner-provisioned operational snapshot as reservation/inspection. Whole-request task/common-Git/checkout/shared-effect OR predicates apply. Task-only cross-checkout conflicts cannot be hidden by the caller cwd.

The operational namespace uses the OS account's home (not HOME/XDG overrides), fixed `.config/pi-task-sessions/host.json` locator, existing-only `.local/state/pi-task-sessions`. Owner-provisioned identity and complete canonical task-domain inventory are required for positive outside classification. No provisioning occurs in this implementation task.

## AK seam

At initial inspection, the promised AK producer contract path did not exist. No consumer schema or native claim algorithm is invented. Independent components can be implemented/tested; launch remains blocked until the actual producer fixture and fixed supervisor binding are consumed and independently verified.

## Evidence status

This initial section publishes a planned interface, not implemented or installed behavior. Subsequent commits/evidence below will distinguish verified independent behavior from integration and rollout gates.
