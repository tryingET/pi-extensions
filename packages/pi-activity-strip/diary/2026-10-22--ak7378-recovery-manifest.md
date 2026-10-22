# AK7378 — read-only recovery manifest candidate

Added a separate `manifest` CLI rather than treating the broker snapshot or panel as a recovery
inventory. It keeps process observations, session identities, transcript candidates, window
containment and exact harness-qualified AK claimant matches distinct. Native metadata remains
private; no live session fixtures are committed.

Independent OpenAI work-product inspection found five defects in the initial candidate:
legacy panel discovery could promote guessed identities into active chips; blanket procfs path
redaction exemption; a stale registry could hide a replacement process; an open descriptor was
mislabelled a writer; and rechecks omitted harness/script changes. Corrected all five and added
regressions. The panel parser change was withdrawn entirely: CLI joins are separate, and the
legacy panel/discovery behavior is unchanged.

Operator/controller inspection additionally required PID-namespace checking before host PID
lookup and explicit separation of Electron helper process counts from conversation counts.
A foreign namespace may reuse both a host PID and its start ticks. Neither is stale-process proof
without the domain. Shared terminal containment is never exact tab identity.

Validation: package `npm run check` (Node/package contract including release dry-run), focused
synthetic tests, native full-AK CLI, and private syscall evidence. A version-already-published
response from the existing dry-run release check is handled by that script; no publication or
version bump occurred. Pi install/load smoke is skipped by the existing package CI recipe.
The CLI is exercised directly; no live extension activation is claimed.

Source-owner boundaries: AK6737 owns custody; AK6481 owns native reopen. Unknown harnesses
remain unsupported. Codex open descriptors prove neither writer status nor current display;
AngelX/AGNT/OMP have no qualified live-conversation adapter here. No session closure, replay,
claim transfer, desktop restart, canonical landing or activation was performed by this worker.

See [the invocation and schema contract](../docs/project/recovery-manifest.md) and AK7378 evidence
for exact command results, native counts, independent inspection and integration disposition.
