---
summary: "Implementation and rollout plan for the workstation provider hot path."
read_when:
  - "Implementing, validating, or rolling out the local-first provider changes."
system4d:
  container: "Implementation and rollout plan for the workstation provider hot path."
  compass: "Land the cached hot path without changing lane-op runtime authority."
  engine: "Benchmarks, integration tests, live workstation validation, then rollout."
  fog: "Live TTFT/inter-token latency numbers are unvalidated until owner-workstation runs complete."
---

# Local-first workstation inference implementation plan

## Completed implementation scope

- [x] Add a dependency-free immutable contract-generation cache.
- [x] Build an O(1) first-contract-wins model index.
- [x] Add asynchronous TTL refresh and explicit atomic refresh.
- [x] Preserve the previous generation on refresh failure.
- [x] Add retry backoff to prevent refresh storms.
- [x] Add singleflight endpoint-health probes.
- [x] Add blocking, background, and skip health modes.
- [x] Isolate caller cancellation from a shared probe.
- [x] Prime known endpoints asynchronously after registration.
- [x] Use background health for ordinary text and blocking health for governed audio.
- [x] Add `/workstation-inference hot-path` diagnostics.
- [x] Add a synthetic million-lookup benchmark.
- [x] Add package files-list and benchmark-script entries.
- [x] Add design/ADR/operating documentation.
- [x] Add tests for generation, refresh, backoff, singleflight, stale verdicts, and cancellation.

## Repository changes

1. Add `extensions/workstation-provider-hot-path.ts`.
2. Replace `extensions/workstation-inference-contract.ts` with the generation/health integration.
3. Replace `extensions/workstation-inference.ts` with diagnostics and health priming.
4. Change ordinary stream selection to:

   ```ts
   healthMode: attachment ? "blocking" : "background"
   ```

5. Change test helpers to clear both contract and health caches between inline contracts.
6. Add hot-path tests, benchmark, ADR, design packet, and this plan.
7. Add the hot-path module to `package.json#files`.

## Validation gates

### Implemented in this bundle

- strict TypeScript compilation of the dependency-free hot-path module;
- 18 passing tests: 14 hot-path unit tests and 4 contract-integration tests;
- one-million-lookup synthetic benchmark;
- TypeScript parser checks for modified integration files;
- JSON validation for package and example contract;
- patch/apply dry-run against a synthetic base fixture.

### Required on the owner workstation

- package `npm install` using the pinned lockfile;
- `npm run check`;
- live Pi extension load;
- `/workstation-inference status` and `hot-path` smoke;
- one ordinary text completion;
- one governed-audio canary through the existing owner path;
- local TTFT, ITL, queue, and cancellation benchmark under idle and batch contention.

## Rollout

1. Apply the bundle on a feature branch.
2. Run package-local checks.
3. Run live text smoke with the existing canonical contract.
4. Run 30 minutes of mixed realtime/deep-work load while observing TTFT and queueing.
5. Run governed audio owner canaries.
6. Keep `PI_WORKSTATION_INFERENCE_CONTRACT_REFRESH_MS=5000` initially.
7. Promote only after no regression in audio authority tests and voice p95.

## Rollback

Revert the patch. No contract schema or workstation runtime migration is required. The change is adapter-local and preserves existing provider/model IDs.
