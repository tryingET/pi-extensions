## 15. Effect-tiered SQLite authority and bounded audit

### 15.1 Authority boundary

SQLite is authoritative for:

- clients and epochs;
- lease/resource/TCB-generation state;
- D1 admitted and terminal calls;
- exports and quarantines;
- critical security events;
- upgrade/drain inventory.

SQLite is **not** synchronously updated for every ordinary D0 read. D0 audit uses a bounded memory queue and batch writer. Loss of recent D0 audit during crash is explicitly acceptable and reported as an observability limitation.

### 15.2 Open and readback

At database open the daemon sets and then queries/asserts:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;
PRAGMA trusted_schema=OFF;
PRAGMA busy_timeout=5000;
PRAGMA wal_autocheckpoint=<policy value>;
PRAGMA temp_store=MEMORY;
PRAGMA application_id=<assigned constant>;
PRAGMA user_version=<schema version>;
```

A mismatch, unsupported application ID, newer unknown schema, failed integrity check, or unsuitable filesystem makes the daemon refuse write authority. The checkpoint policy and observed WAL size appear in status.

### 15.3 D0 audit store

D0 audit records contain no raw content, paths, command text, or output by default. They include bounded identifiers, operation kind, duration bucket, byte-count buckets, result class, and sampling/drop counters. Batch flush uses a separate transaction and cannot delay call completion.

### 15.4 D1 transactions

#### Admission

One FULL-durability transaction inserts the admitted semantic digest, operation kind, generation-before, policy/plan/attestation digests, limits, and state before effect.

#### Start

One transaction records mutation-token ownership and STARTED immediately before releasing a structured mutator or `boundary-init` launch.

#### Terminal known

One transaction records disposition digest, output completeness, descendant proof, generation-after, and terminal state before returning success.

#### Terminal unknown

One transaction marks mutation unknown, lease quarantined, retry unsafe/operator-decision, and generation unknown-after previous.

### 15.5 Checkpoint and backup policy

The daemon owns the only writer. WAL checkpointing is bounded and occurs outside the realtime D0 path. Schema migration requires a verified backup and explicit generation transition. Runtime status exposes page count, WAL bytes, last checkpoint, checkpoint failures, and database free-space reserve.

### 15.6 Recovery

On restart the daemon reconciles database, systemd units, cgroups, leases, TCB generations, and retained artifacts before admission. Nonterminal D1 calls are never re-executed. Started D1 calls without terminal evidence quarantine the writable lease. D0 calls may disappear and be reissued.
