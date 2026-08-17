---
summary: Stable versioned contract for bounded read-only context providers.
read_when:
  - Integrating another package with pi-context-packer without importing planner internals.
system4d:
  container: "Versioned cross-package provider contract owned by pi-context-packer."
  compass: "Bounded, sanitized, read-only context flows from source owners to consumers."
  engine: "Import the stable API -> verify with provider tests -> keep versions additive."
  fog: "Provider consumers and backing sources may evolve outside this package."
---

# Read-only context provider API

Import the public contract from `@tryinget/pi-context-packer/api`. Consumers must not import provider implementation files directly.

## Contract

A provider is created with `defineReadOnlyContextProvider()` or one of the package-owned factories, then executed with `runReadOnlyContextProvider()`.

```js
import {
  defineReadOnlyContextProvider,
  runReadOnlyContextProvider,
} from "@tryinget/pi-context-packer/api";

const provider = defineReadOnlyContextProvider({
  id: "example-status",
  version: "v1",
  authority: "Read-only projection of the example owner source.",
  async collect(input, { signal }) {
    signal?.throwIfAborted?.();
    return {
      ok: true,
      state: { verified: true },
      items: [
        {
          id: "example-status:current",
          kind: "status",
          content: "bounded source-owned status",
          provenance: { commandClass: "read-only" },
          authority: "Example owner source.",
          rationale: "Needed for the next continuation step.",
          freshness: "live collection",
        },
      ],
      omissions: [],
    };
  },
});

const result = await runReadOnlyContextProvider(provider, {}, {
  signal,
  limits: { maxItems: 8, maxItemChars: 2_000, maxTotalChars: 8_000 },
});
```

The returned schema is `pi.context-provider-result.v1`. Provider identity and authority come from the registered definition, not from untrusted result data.

## Guarantees

The runner:

- bounds item count, per-item characters, total characters, state depth, and omission count;
- redacts high-confidence credential shapes and local absolute paths;
- converts omission details into safe public diagnostics;
- records counts, duration, selected characters, and redactions without payload telemetry;
- propagates cancellation while converting ordinary provider failures into a bounded unavailable result;
- marks every result as a read-only projection and never as an authorization surface.

## Git worktree provider

`createGitWorktreeProvider()` supplies verified live Git metadata using fixed trusted executable candidates and `execFile` argument arrays. It exposes only repo-relative paths and bounded counts. It never stages, resets, checks out, commits, or otherwise mutates the worktree.

Consumers must treat `result.ok === true && result.state.verified === true` as the condition for current worktree claims. Historical file activity is not a substitute for this live verification.

## Evolution

Breaking contract changes require a new API version and export path. Additive fields may be introduced in v1, but consumers should ignore unknown fields and must not depend on implementation-specific modules.

## Independent package discovery

The package loads a small `context-provider-api` extension that publishes the frozen v1 surface under `Symbol.for("tryinget.pi-context-packer.provider-api.v1")`. This lets separately installed Pi packages consume the stable contract without declaring or traversing a hard dependency on planner internals. Consumers should prefer the process-local surface, validate `apiVersion === 1`, and may fall back to the public package export when normal package resolution is available.
