---
summary: "AK8605 source-only Soma schema2 interface, dispatch admission and release-ordering limits."
read_when:
  - "Integrating the workstation Soma capacity projection with Pi or Clipper"
  - "Preparing separately authorized activation of AK8605"
system4d:
  container: "Two source-owned consumers of a workstation capacity projection."
  compass: "Unknown capacity never becomes registration or dispatch permission."
  engine: "Owner proof -> schema2 -> admission -> final serialized dispatch fence."
  fog: "Fixture reload proof does not attest operator generations or live activation."
---

# Soma capacity consumer boundary — AK8605

**Source/offline only.** Operator assignment: evidence21382. No canonical landing,
installation, reload, service action, browser change or live inference is proved
by this change. Later operator authorization permits consumer installation, but
the canonical lock remains unresolved (evidence21525/21526); no installation has
occurred. Independent parent inspection of the reload correction is still required.

## Exact interface

The complete synthetic JSON fixture is
[`workstation-inference-provider.capacity-v2.example.json`](../../examples/workstation-inference-provider.capacity-v2.example.json).
Clipper carries the identical fixture in its tests. The fixture is not a live
capacity assertion and must not be published by copying or refreshing its clocks.

- `schema_version: 2`, `authority: workstation/lane-op`,
  `provider_id: workstation-inference`, `family: baseline-text`,
  `surface: canonical`; no runtime profile. Models use the owner aliases
  `baseline-text`, `baseline-text-visible`, `baseline-multimodal`, `think-small`.
- Existing model identity, input and thinking fields retain their meanings. If both
  `id` and `pi_model_id` are present, they must be identical; contradictory fields
  are rejected by both consumers. Canonical runtime profiles must be absent or the
  empty string; nonempty or wrongly typed profiles are rejected by both consumers.
- `model.capacity.schema` is exactly `soma.capacity/v1`.
- `source_generated_at`: numeric epoch seconds from Soma's response, or null.
- `expires_at`: numeric epoch seconds, or null. The exporter must compute
  `min(source_generated_at + ttl_s, every admitted route observed_at + ttl_s)`
  from the owner's evidence; `0 < ttl_s <= 600`. Consumers additionally enforce
  `source_generated_at <= now < expires_at <= source_generated_at + 600`.
- `availability`: `available`, `unavailable`, or `unknown`. Missing/unrecognized
  fields do not confer permission.
- `guaranteed.state`: `observed`, `stale`, `unknown`, or `contradictory`.
  `context_window`, `max_output_tokens`, `max_tokens` are positive safe integers
  in an observed guarantee, with
  `max_tokens == max_output_tokens == context_window - 1`, context at least 2.
  All three must be null for the producer's non-observed states. Consumers retain
  nonadmissible rows descriptively; malformed/unqualified numbers cannot admit.
- Available + observed + consistent bounds + fresh source proof is necessary for
  registration and dispatch. Unavailable may retain descriptive observed bounds,
  but never admits. Neither `current` nor model-level old `context_window` /
  `max_tokens` hints is read as schema2 permission. Export `generated_at` and
  `refresh_after_seconds` describe declaration age only, not capacity freshness.

The trusted workstation exporter is responsible for verifying Soma's raw route
observations and schema consistency before producing this projection. The consumer
cannot reconstruct omitted engine evidence. Old live `context_tokens` does not
satisfy `context_window`; it remains unknown, not a fallback or a rename in place.
No backend token accounting is invented here.

## Reader and registration

Schema1 canonical declarations are rejected even if old hint numbers are positive.
Schema1 remains only for explicitly identified unrelated `surface: canary` sources
with a family. Reserved Soma aliases in those sources remain disabled, including
when the primary source is invalid/missing or its capacity is withdrawn. Distinct
legacy canaries retain their old limits/defaults, routing and health-cache behavior.
A malformed primary/optional source cannot discard the other valid sources.
Canonical aliases are bound exclusively to the designated **primary source role**,
not whichever file happens to declare `surface: canonical`. Optional schema2 copies
remain descriptive but cannot configure/register/dispatch canonical aliases when
that primary is missing, invalid or omits an alias. Optional sources can still
contribute distinct unrelated legacy canaries. The reader's source role is local
metadata, never a producer-overridable JSON field. Explicit primary overrides
suppress implicit optional paths, but independently specified canary/Inkling paths
are still read.

Declaration validity, per-model capacity admissibility, endpoint health and actual
registered model IDs are separate command-status fields. A valid declaration can
have zero admissible models. Such models never pass to Pi registration defaults.
The schema normalizer removes schema2 legacy hints and marks absent proof as null.

Explicit installed-entrypoint status/refresh replaces the provider registration,
using Pi's supported `unregisterProvider` before registering the eligible subset.
After awaited health or lifecycle work, registration rereads independent authoritative
sources and re-admits from that new snapshot; it does not register the earlier
status/health snapshot. Provider-only bootstrap likewise builds its final bindings
from a single new source snapshot, with no per-model await before registration.
That final snapshot is atomically adopted into the active dispatch generation before
registration. Its models, routes, source identities and generation IDs are therefore
shared by registration and immediate dispatch, including unrelated legacy canaries.
Older in-flight refresh results or failures are invalidated and cannot overwrite
that publication. This cache adoption is not canonical capacity permission: canonical
registration/dispatch still require the independent primary-role/proof checks above.
Provider-only rebootstrap on the same API also removes its prior registration.
When removal is unsupported, status says so. Removal does not prove that every
selected model object or UI entry vanished. An already-selected object is fenced
by the stream's dispatch checks, not by a status label or file-change assertion.
No global Pi model configuration is rewritten.

## Pi1.1 old-to-new reload

Independent verifier `dispatch-1794605564329` confirmed that `083b9c0d` left
`b61361850` registrations and dispatch closures alive for schema1, unknown schema2
and malformed publication, in both entrypoints. Real retained-object invocation and
real `AgentSession.prompt()` each sent one stubbed request in all six cases.
Fresh-candidate passes were not migration proof.

Both entrypoints now reconcile in bound `session_start`, not just the factory.
They revoke the known owned `workstation-inference` id and their own recorded
registration before admitting current source bindings. No provider enumeration or
other-owner removal is used. Provider-only keeps its cleanup handler loaded when
initial source admission fails; bound initialization retries and reports the error
only after revocation. The bare loader can consequently succeed with no models.
Valid canonical bindings and explicitly supplied unrelated legacy canaries still
register from coherent snapshots. Source failure cannot restore an old closure.

Offline authentic Pi1.1 proof uses old source at one private path, copies candidate
source over it, invokes actual `AgentSession.reload()`, and retains the exact old
selected object. It passes **32/32**: sixteen denied migrations (eight source states,
both entrypoints), valid/canary controls, async-hook withdrawal, optional-source
precedence, another owner's provider, and distinct fresh-start checks. Both retained
ModelRuntime calls and real session prompts send zero requests in denied migrations.
The real interactive reload command body is also exercised, with presentation-only
doubles, not keyboard/PTY control. SDK/OpenAI bindings are actual installed **1.1.0**;
transport is stubbed, credentials/settings are private, and guarded real socket,
subprocess, config-read and outside-scratch-write attempts are zero.

The supported interactive route is **`/reload` after installation, while idle**;
Pi refuses it during streaming or compaction. SDK owners may call
`await session.reload()` (or command-context `ctx.reload()`). There is no direct
reload RPC command: do not send a literal `/reload` as a generic model prompt.
In-process `pi.unregisterProvider(id)` is supported after binding, not a remote
process-control interface. Model selection/UI objects may remain visible with old
limits after removal; they are not permission, and their real invocation is denied.
Provider-only hosts without session binding must use a new verified ModelRuntime,
not reuse old registrations by copying the loader's pending queue.

This is source migration proof, **not installed-package or operator-session proof**.
No operator input/reload, service, GPU, producer, Soma or browser action occurred.
The known canonical index lock is untouched. Actual loaded generations, all affected
sessions/workers, busy/in-flight reload, hard crashes, module-load/compile failure
before the handler exists, co-loading both entrypoints and live backend fitness
remain outside this proof. Parent must coordinate each idle owner and verify the
new generation before declaring cutover; unreloaded old processes remain unfenced.

## Final request boundary

Both entrypoints use the same dispatch fence. Canonical resolution reads current
sources independently of the latency cache and any earlier in-flight refresh.
After inherited asynchronous payload hooks and SDK serialization, a fetch wrapper
reads the authoritative binding again, checks its full contract/model fingerprint,
and rechecks proof expiry immediately before invoking the underlying transport.
Binding comparison includes the designated source path/inline identity and source
role, as well as the contract/model bytes. Switching to an identical copy during
an awaited hook is a binding change, not renewed permission. A changed/missing/
invalid/unavailable/expired binding denies an old invocation.
No canonical stale-while-revalidate capacity permission exists. Health caching is
separate and remains latency-oriented. Retries cross the same fence again.

The normal stream takes limits from the current binding, not a cached selected
model. Provider-only additionally requires its bootstrap fingerprint to remain
unchanged; changed contracts require rebootstrap. Hook route/callback-model
mutation is rejected. The serialized JSON request must retain the exact alias
and contract chat endpoint. Reservation fields `max_completion_tokens` and
`max_tokens`, when present, must each be positive safe integers; each is clamped
to the current owner output guarantee. When both are absent, the wrapper inserts
`max_tokens` at that guarantee. Null, string, zero, fractional and unsafe values
are rejected. JSON `toJSON` effects are checked at the serialized-byte boundary,
not merely on the earlier hook object.

This bounds the **output reservation**, not prompt + output tokens. Only the
backend tokenizer can enforce that coupling and context fit. An owner maximum
of context minus one does not promise that maximum fits an arbitrary prompt.
The fence is at the SDK fetch invocation; it cannot revoke an already-sent
request or prevent time advancing inside the underlying transport. Custom fetch
and extension hooks remain trusted in-process code, not an OS sandbox.

## Clipper

Status can describe unknown/unavailable capacity. Setup refuses before emitting
an enabled provider/model recipe unless the exact baseline-multimodal text+image
alias has a fresh eligible guarantee, including a recheck of expiry at recipe
creation. Existing no-follow/owner/size/credential/endpoint/browser boundaries
remain. This does **not** revoke existing browser configuration or enforce a
later browser request. Browser permissions, CORS, authentication and actual
request/context fit remain separate checks; no browser action was performed.

## Release ordering and rollback — all HELD

1. Independently inspect the source, exact fixture and offline evidence; integrate
   the producer projection from workstation AK8393 using the owner decoder.
2. Inventory normal Pi sessions, provider-only workers, retained model selections,
   Clipper setup consumers and the currently exported schema. Old consumers reject
   schema2 but can keep warm schema1 generations: a producer file change alone is
   **not** a warm-cache revocation plan.
3. Under separate authorization, land/install and reload/rebootstrap **all** affected
   consumers before treating schema2 publication as effective. New consumers refuse
   old schema1 canonical hints, so a temporary denied canonical lane is expected.
   Preserve unrelated canaries. An unreloaded old consumer is not fenced by this
   source commit; terminate/reload it through its owner before declaring cutover.
4. Separately authorize any required Soma restart/publication. Do not start large
   models or manufacture observations. Unknown/unavailable remains denied.
5. Verify loaded source generations, removal/selected-model behavior, unchanged
   global config and canaries, real final dispatch denial and owner health after
   authorized activation. Browser configuration remains a separate owner action.
6. Rollback must account for source, exported schema, loaded sessions and selected
   objects together. Rolling only the file or only the package back can restore
   schema1 hint permission in old consumers. Prefer retaining the fail-closed
   consumer fence until the owner approves a coordinated rollback. No rollback
   mutation is authorized by this document.
