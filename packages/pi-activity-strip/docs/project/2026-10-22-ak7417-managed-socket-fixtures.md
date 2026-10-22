---
summary: "AK7417: reproduce and repair socket fixture path/cleanup failures under governed long TMPDIR without changing production or timeouts."
read_when:
  - "Running activity-strip tests in managed heavy-job scratch or inspecting the combined652a failure."
---

# Managed socket fixture repair — AK7417

## Scope and failure

Base: canonical `a10c14c7798573d8baa1359e93cd339099cbdc9f`.
Controller: `session-01a1654e-ef4c-7564-b376-7c98d5d01827`.
This is an isolated, package-scoped test repair for the AK7416 owner's fan-in. No independent
canonical landing, production source change, native restart or AK7419 repair is included.

AK7416's combined652a root check failed `panel-protocol.test.mjs`,
`ribbon-diagnostics.test.mjs` and `startup-readiness.test.mjs` under its governed long TMPDIR.
The latter two reported ENOENT during socket chmod, then kept the test process open until its
existing file deadline. The controller rejection fixture was killed at its existing deadline.
Those are real fixture failures, not accepted timing noise.

## Cause and separate detection failure

Observed: Node22.23.3 accepts an overlong Unix address through listen, but the requested full
filesystem path is absent at chmod. Raw physical address construction from managed TMPDIR was
118 bytes in the exact reproduction; Linux sockaddr_un is bounded. The protocol fixture's
relative path also depends on both checkout and TMPDIR location, so relative is not sufficient.

Separately, both new CLI fixtures awaited `createActivityStripBroker` before entering their
try/finally. A startup rejection after listen prevented the caller acquiring the broker handle
for teardown, leaving an open server. A shorter-TMPDIR pass did not characterize this condition.
The repair preserves the original application assertions and deadlines; no timeout change,
force-exit, skip or global TMPDIR shortening hides these defects.

## Repair and oracle

Shared `tests/support/socket-fixture.mjs` keeps physical files inside the supplied managed
TMPDIR. It opens only its own0700 directory and uses `/proc/<parent-PID>/fd/<FD>/broker.sock`
as the bounded Unix address. The explicit parent PID allows real child clients/controllers to
reach that same socket without inheriting the descriptor. No `/tmp` fallback, operator socket,
abstract-namespace substitution or production path rewrite is introduced. This uses the same
Linux descriptor-alias mechanism already used by the package's isolated GUI support.

Cleanup is registered before broker startup; ownership is captured before awaiting start.
Startup rejection closes the owned server before closing the directory descriptor/removing
scratch. Initial chmod/open failures also remove the unacquired fixture directory. Cleanup is
idempotent, and the descriptor remains open until normal broker/client shutdown completes.
The three affected files use this fixture, with their existing assertions/timeouts intact.

Permanent executable scenarios check:
- real broker ping and real child-process client at normal and >300-byte physical TMPDIR paths;
- real socket remains inside the managed directory and has a bounded transport address;
- normal/repeated cleanup releases both socket storage and descriptor;
- injected chmod failure after actual listen does not orphan the server/directory;
- injected initial chmod/open failures leave no fixture scratch behind.

## Evidence and limits

Owned evidence root: `/home/tryinget/.local/state/pi-quests/tmp/ak7417-socket-repair.ikxQwSbJ`.

- `06-governed-raw-red.txt`: exact Node22.23.3 heavy-job-generated long TMPDIR reproduction
  against actual production broker, exit1 with ENOENT chmod and118-byte raw address. The
  reproduction explicitly closes the broker on rejection, so red is not measured by hanging.
- `01-long-path-red.txt`: additional ambient-Node deep-path control, exit1 listenEINVAL;
  not substituted for the exact pinned reproduction above.
- `04-long-path-final.tap`: all27 focused scenarios pass under deliberately deep child-local
  TMPDIR; no skips. The original three files run unchanged assertions through the new fixture.
- `03-governed-package-check.txt`: heavy-job package check passes with inherited shorter TMPDIR.
  This alone would not establish the requested governed-long condition.
- `05-governed-long-package-check.txt`: heavy-job allocates its own managed long TMPDIR
  (`env -u TMPDIR -u TMP -u TEMP` only for that new job, no global environment mutation).
  The run asserts its former raw socket address would exceed108 bytes, then the unmodified
  package check passes all46 test files, lint/type checks and normal package release checks.
  Its default Pi-smoke skip remains a skip, not GUI/activation evidence.
- Independent inspection `dispatch-1792708782334`: no blockers; independently25/25 focused
  tests passed at normal and304-byte TMPDIR. Its optional constructor-exception finding was
  resolved with initial-acquisition cleanup and two permanent scenarios before commit.

No production/runtime changes were needed. This repair does not establish real GUI, reboot,
rollback, native expiry or entire five-priority completion. The receiving owner still qualifies
its exact combined tree and owns its supported canonical landing. Canonical/retained runtime,
rollback refs and unrelated dirty ontology paths remain untouched by this repair session.
