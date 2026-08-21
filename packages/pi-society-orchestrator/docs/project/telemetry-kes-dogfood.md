# Telemetry-to-KES lifecycle dogfood

`dogfood-telemetry-kes-lifecycle.mjs` exercises the real owner-local telemetry/KES adapter with three bounded synthetic cases:

1. **Supporting:** the observed metric crosses the declared threshold, sample and live coverage are sufficient, and explicit `materialize` writes one diary entry and one candidate learning into a temporary package root.
2. **Falsifying:** sample and live coverage are sufficient, but the observation is below the threshold. Planning reports counterevidence and writes nothing.
3. **Insufficient evidence:** the threshold is crossed, but the declared minimum sample is not met. Planning reports an evidence blocker and writes nothing.

Run it from the package root:

```sh
node ./scripts/dogfood-telemetry-kes-lifecycle.mjs
```

The output is canonical, byte-deterministic JSON using the schema `pi.telemetry-kes-dogfood.v1`. It contains no temporary paths or private telemetry payloads.

## Authority boundary

The fixtures are deliberately synthetic. They prove deterministic behavior of the integration contract, not an operational claim about current subagent performance.

The dogfood does not:

- read the maintainer's telemetry store;
- call Agent Kernel;
- write outside temporary roots;
- mutate tracked package documentation;
- accept a KES candidate;
- change ontology material;
- promote engineering-core content.

A materialized KES candidate remains at the **Proposal** stage. Live adoption, falsification, and promotion decisions require separately authorized, provenance-bearing operational evidence.
