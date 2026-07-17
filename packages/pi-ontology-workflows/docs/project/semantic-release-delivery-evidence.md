---
summary: "Task 3990 evidence for a default-off Pi semantic-release delivery attestation boundary."
read_when:
  - "Reviewing Decision 53 Pi delivery implementation or dogfood evidence."
system4d:
  container: "Decision 53 default-off Pi delivery evidence."
  compass: "Keep Pi delivery attestations separate from semantic and consumer authority."
  engine: "Validate exact scope and freshness -> emit delivered, suppressed, or failed receipt -> independently replay."
  fog: "A delivery receipt can be mistaken for adoption, use, or influence."
type: "evidence"
status: "implementation_evidence"
---

# Decision 53 — Default-Off Pi Delivery Evidence

## Authority

- AK task: `3990`
- Decision: `53`
- ADR: `core/rocs-cli/docs/adr/2026-07-13-semantic-release-and-single-canary-adoption.md`
- Implementation plan slice: I5

Pi owns only exact `delivered`, `suppressed`, and `failed` attestations. It does not issue semantic approval, publication, consumer intent/acceptance, activation, adoption, use, influence, rollback policy, or AK lineage.

## Implementation

- [`../../src/semantic/semantic-release-delivery.ts`](../../src/semantic/semantic-release-delivery.ts)
  - exports `SEMANTIC_RELEASE_DELIVERY_DEFAULT_ENABLED=false`;
  - exports `LIVE_ACQUISITION_IMPLEMENTED=false`;
  - validates a complete `semantic-rocs-generation-receipt.v0`, including its closed shape, ROCS issuer, recursive fields, and JCS domain digest, instead of trusting caller-supplied generation or execution digests;
  - enforces the protocol invariant that generation candidate IDs and pack digests are strictly UTF-8 sorted and unique; duplicate or out-of-order arrays fail even when the receipt is correctly resealed;
  - derives the exact revision-3 `softwareco/pi-canary-consumer` identity, one operator-named canary scope, activation head, and effective-execution digest from that checked generation receipt;
  - emits accepted `semantic-pi-delivery-receipt.v0` shapes and domain digests;
  - defaults to policy suppression;
  - allows delivered attestations only through an explicit, unintegrated `isolatedDogfood` constructor option;
  - requires generation, canary, prompt-run, and effective-execution expectations for independent receipt replay;
  - compares canonical structures independently of JSON object insertion order;
  - fails closed on cancellation, deadline equality/expiry, stale activation head, hostile issuer, scope drift, cross-run reuse, unknown fields, and digest tampering.
- [`../../tests/semantic-release-delivery.test.ts`](../../tests/semantic-release-delivery.test.ts) covers the closed boundary.

No extension registration, startup hook, automatic prompt path, package default, consumer repository, or live acquisition capability is connected.

## Validation and dogfood

Run from `packages/pi-ontology-workflows`:

```bash
npm run docs:list
npm run check
node --import ./node_modules/tsx/dist/loader.mjs --test tests/semantic-release-delivery.test.ts
```

The sanitized dogfood invocation uses the same test file through an explicit Node/tsx path with a closed environment. It proves one isolated delivered receipt plus policy, stale, cancellation, deadline-equality timeout, generation-resolution, strict sorted/unique generation arrays, canonical-order, scope, issuer, cross-run, and digest failure closure. It is not consumer consent or activation evidence.

## Rollback

Delete the two new TypeScript files and this evidence note. Because no extension entrypoint imports the implementation and the default is disabled, rollback does not require repository, runtime, consumer, or session-state migration.

## Deferred facts

- `live_acquisition_implemented=false`;
- exact consumer repository and owner consent are absent;
- the operator has not named a production canary;
- no recovery-controller identity exists;
- no publication, activation, default, startup, or fleet authority is present.
