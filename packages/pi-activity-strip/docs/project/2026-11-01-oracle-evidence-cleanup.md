---
summary: "AK8014 source repair: clean successful automatic oracle-regression evidence, preserve failed/explicit evidence, and reconcile the already-owned AK7960 documentation fix."
task_id: 8014
read_when:
  - "Running oracle correctness regressions or changing their artifact lifecycle."
  - "Reconciling the dated AK7417 handoff documents with current source authority."
system4d:
  container: "Activity-strip test fixtures and historical evidence navigation only."
  compass: "Avoid accumulating successful-run scratch without losing failure diagnostics."
  engine: "Executable Given/When/Then failure and retention controls, independent inspection and exact source binding."
  fog: "Developer checks are not safe-toolchain qualification, source delivery or product GUI proof."
---

# AK8014 — oracle regression evidence lifecycle

## Scope

This disjoint source contribution addresses AK7417 evidence18733. Base:
`81304a4595c7b32058337448f07835fe9d4ecaf2`. It changes only the oracle regression
wrapper, a dedicated test-support evidence owner, new lifecycle tests and this
record. It does not change ownership replay assertions, mutation checks, production
code, worker deadlines, current AK7894 source005dda or the two AK7960-owned docs.

## Repairs

- Successful automatic regression runs previously left about7MB of copied sources
  and reports every time. The wrapper now finishes its own evidence lifetime after
  all scenarios and synchronous oracle workers return.
- `PI_ACTIVITY_STRIP_ORACLE_EVIDENCE_DIR` opts into preserving the complete run,
  including successful runs. Its parent must already exist; only a new child is
  allocated. An empty value means automatic temporary evidence, not the checkout.
- Scenario failures and artifact-write failures preserve the whole evidence root.
  Non-Error throws are serialized accurately instead of throwing on `error.stack`.
  A secondary outcome-write error is diagnosed without replacing the primary
  scenario failure. No unsafe `throw` inside `finally` or lint suppression is used.
- Cleanup acts only on the newly allocated directory with matching device/inode
  identity. A replacement directory/symlink is refused, and repeated successful
  finish cannot act on a subsequently recreated path. The caller-supplied parent,
  foreign evidence and retained production assets are never cleanup targets.
- The documentation finding D1 was already source-fixed in committed, unlanded
  AK7960 subject `8f3e3a5d1` (two `task_id: 7417` additions). This was discovered
  during final owner reconciliation. The duplicate draft and its two new assertions
  were withdrawn from AK8014, not counted as a new fix; the original docs are byte-
  unchanged here. All lifecycle/failure/closure controls remain. Integration of D1
  belongs to AK7960's owner, not this contribution.

## Regression construction and process closure

`oracle-evidence-lifecycle.test.mjs` exercises the actual scenario/after-hook code
using private copied fixtures and deliberately replaced **in-process** callbacks.
It does not run the explicit oracle-worker pipeline inside another timed worker.
Independent inspection caught that flaw in the first test draft: killing an outer
suite did not necessarily stop its explicitly spawned worker. Test isolation alone
was not sufficient. That draft is not the final subject.

The revised lifecycle fixture has one direct child and no callback-created child.
A deliberate deadline control verifies the fixture reached its hang in that exact
PID, returns ETIMEDOUT/SIGKILL, and confirms the PID is gone before removing owned
fixture scratch. The synthetic hang also self-expires as defense in depth. On any
unexpected setup/identity/status failure, its fixture is retained, not blindly
removed. The original eight oracle correctness scenarios still run separately and
retain their existing one-process synchronous worker contract and strict assertions.

## Observed source-development checks

- Initial full regression-source controls:9 Given/When/Then tests,3pass/**6fail**
  on the original wrapper/docs (automatic and empty override leaks, null error
  outcome, masked primary failure, two missing document bindings).
- Final lifecycle-only harness against original wrapper:11 cases,7pass/**4fail**;
  the four failures isolate automatic/empty-override leaks, null error recording
  and masked primary failure. The two duplicate AK7960 document assertions are
  excluded from both sides, not weakened to manufacture lifecycle GREEN.
- Current11 lifecycle controls plus the unchanged eight oracle scenarios:
  **19/19 pass**, including directory/symlink replacement, repeated finish,
  explicit/failure retention and the owned-child deadline control.
- A fresh successful-run TMPDIR was empty after the tests.
- Biome2.4.4 checks of the three changed test/helper files passed without suppression.
- Before duplicate withdrawal, package docs strict metadata checks passed both
  with and without explicit AK read argv. Those results covered the old six-file
  draft, not this final source. The final standalone base still lacks the two
  AK7960-bound metadata lines; do not call a failing raw docs check green. Any
  composed docs check must name the exact AK7960 source inputs and is not package
  qualification or evidence that AK7960 has landed.

Runtime: installed `/usr/bin/node` **26.13.0**, SHA256
`c81f852be62443a3e4003b2b1924177c780ca44f27acb2e1b771b3aff4b2edd2`.
Tests used sanitized private HOME/TMPDIR and stdlib-only mocks/fixtures; no npm
installation, retired22.23.3 execution, product native/GUI action or live change.
The existing native formatter executable was used directly, without borrowing a
foreign node_modules root or treating it as package-install admission.

These are **developer observations, not pinned qualification**. AK7675's safe
runtime/pin and resource decisions remain separate. Do not silently substitute
Node26 into a pinned gate or revive22.23.3 to commit/qualify this contribution.
Full package/root gates, commit, canonical landing, publication, task completion
and any broader source integration are not established by these checks.

## Evidence and next owner action

The AK8014 task carries exact source hashes, RED/GREEN logs and independent
inspection references. Preserve real failure artifacts and this source derivative;
no cleanup of earlier leaked/retained directories is authorized. After an approved
safe-toolchain route is available, qualify the exact source, coordinate integration
with the package owner, and use the supported canonical landing contract if
separately authorized. Do not overlap active SDK, native, inventory or resource
packet writers or turn this test contribution into a new global prerequisite.
