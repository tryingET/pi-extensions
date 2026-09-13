---
summary: "Product and technical vision for pi-context-packer."
read_when:
  - "Defining or revisiting project direction."
system4d:
  container: "Project north-star statement for the Pi context-packer package."
  compass: "Make large context windows useful by planning bounded, source-owned context packets before agents burn turns on ad-hoc reads."
  engine: "Intent -> provider plan -> bounded packet -> compact receipt -> measured usefulness."
  fog: "The package can drift if it becomes a hidden authority store, a session orchestrator, or a duplicate owner for SCI/docs/AK/FCOS/ASC/peer tooling."
---

# Vision

`pi-context-packer` makes large Pi context windows deliberate instead of accidental.

It turns a task objective plus optional seeds into a source-owned context plan or Markdown packet that helps an agent start with the right context, avoid redundant reads, and understand what was omitted.

The package owns the read-only planning and packing seam:

```text
objective -> provider selection -> bounded retrieval -> Markdown packet -> compact receipt -> measured usefulness
```

It should help a harnessed agent or operator:

- decide which source-owned providers should contribute context;
- assemble bounded Markdown-primary packets when that will reduce raw `read` / search / status churn;
- preserve SCI as the code-context provider rather than an all-context owner;
- include docs/docs-list, AGENTS, git, session-awareness, Prompt Vault, AK, and FCOS through explicit provider boundaries;
- expose token/byte budgets, omissions, and already-loaded dedupe before filling a large model context window;
- measure whether a planned packet reduces low-level tool calls;
- keep structured tool details compact so raw JSON does not become the actual context payload.

A mature context-packer should become a **context advisory membrane** for Pi sessions. It may recommend what context is worth loading, what is already likely loaded, what should be omitted, and which owner surface should be used next when a task actually requires execution, peer launch, messaging, workflow supervision, or authority movement.

It may prepare context packets for those surfaces, but it must not call, spawn, supervise, persist, or authorize them.

## Ownership boundary

`pi-context-packer` owns packet planning and bounded read-only packet assembly.

It does **not** own:

- canonical task, evidence, direction, or decision authority;
- AGENTS/system/developer/user instruction precedence;
- SCI code semantics or patch planning;
- docs authority or docs migration;
- AK, FCOS, Prompt Vault, ROCS, KES, Oracle, or git mutation;
- ASC/`self` operational introspection or `dispatch_subagent` execution;
- `intercom` peer messaging;
- visible peer launch, candidate worktrees, or peer cleanup;
- above-seam workflow coordination or fan-in gates;
- hidden session memory or raw JSON mega-packets.

For current maturity and trust gates, see [Product posture](product-posture.md). For the project-level concept map, see [Project foundation model](foundation.md).
