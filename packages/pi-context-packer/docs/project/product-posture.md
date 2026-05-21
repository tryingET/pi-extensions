---
summary: "Product posture for @tryinget/pi-context-packer: promise, maturity, trust gates, boundaries, and next bets."
read_when:
  - "Before choosing the next pi-context-packer product or implementation slice."
  - "When deciding whether context selection belongs in pi-context-packer, SCI, docs-list, AK, FCOS, Prompt Vault, or Pi runtime."
  - "When reviewing context packet authority, output shape, or provider scope."
type: "reference"
system4d:
  container: "Package-local product posture for the Pi context-window packet planner."
  compass: "Make large context windows useful without turning packet assembly into hidden authority or JSON bloat."
  engine:
    invariants:
      - "Plans and packets stay read-only and source-owned."
      - "Primary packet output is curated Markdown; structured details stay compact."
      - "Provider omissions, budgets, and already-loaded dedupe are visible."
  fog:
    risks:
      - "Context packing becomes another ad-hoc search loop."
      - "Retrieved content is mistaken for stronger authority than its source owner grants."
      - "Tool details or session metadata silently bloat the harnessed model context."
---

# Product posture — `@tryinget/pi-context-packer`

## Vision relation

The package north star lives in [vision.md](./vision.md). This posture file records current maturity, boundaries, trust gates, and next product bets. It is not a task queue and does not replace AK/FCOS/runtime authority.

## Product promise

`pi-context-packer` turns a task objective plus a few optional seeds into a bounded, source-owned context plan or packet that reduces low-level `read`/search/status churn.

The healthy loop is:

```text
objective -> provider plan -> bounded retrieval -> Markdown packet -> compact receipt -> agent work with fewer raw probes
```

## Primary users

- Pi coding agents that need high-signal context before implementation.
- Operators who want context-window usage to be deliberate rather than accidental.
- Package/repo owners reviewing whether a packet respected source-owner boundaries.

## Current maturity

- maturity: `internal dogfood / read-only MVP`
- current strategic line: make `context_plan` cheap and always available, keep `context_pack` activatable, preserve Markdown-primary output, and prove docs/AGENTS/git/SCI/session slices before adding AK/FCOS/Prompt Vault adapters
- release posture: package checks pass; package is installed locally into Pi; live activation is via toolbox `context-packer` bundle

## Current landed capability baseline

The package currently owns:

- `/context-pack` planning posture command;
- always-active `context_plan` when toolbox baseline is current;
- toolbox-activatable `context_pack` for bounded packet assembly;
- AGENTS provider with loader-style root-to-leaf ordering;
- caller-seeded Markdown docs provider;
- docs-list-ranked Markdown discovery when no explicit safe Markdown seed was supplied;
- trusted-system-git status provider;
- read-only SCI provider for caller-seeded code paths and symbols;
- session/system-prompt-aware measurement and already-loaded dedupe;
- primary Markdown packet output;
- compact structured `details` that omit raw item content by default;
- measurement receipt fields for estimated tool calls avoided, packet fill, selected/omitted counts, already-loaded dedupe, session awareness, and unwired provider omissions;
- explicit omissions for planned-but-unwired provider seams.

## Product non-goals

`pi-context-packer` must not become:

- a canonical task/evidence/decision authority;
- a replacement for AGENTS/system/developer/user instruction precedence;
- an SCI ownership layer or code semantics authority;
- a docs authority or docs migration engine;
- an AK, FCOS, Prompt Vault, or git mutator;
- a hidden session-memory store;
- a raw JSON mega-packet generator.

## Trust gates

A context packet is product-healthy only when:

1. **Read-only source boundary** — every provider remains a projection of its owning source.
2. **Budget visibility** — selected and omitted content are visible with token/byte estimates.
3. **Output discipline** — primary output is useful Markdown; structured details do not duplicate raw content by default.
4. **Provider honesty** — unwired or unavailable providers are explicit omissions, not implied coverage.
5. **Already-loaded awareness** — content already in the active prompt/session is represented without wasteful duplication where detectable.
6. **No mutation drift** — packet assembly never mutates files, git, AK, FCOS, Prompt Vault, SCI, or source-owner repos.

## Next product bets

Near-term bets:

- fix live context-plan budget normalization if the installed runtime reports impossible reserves;
- add AK/FCOS read-only orientation only after the output and docs/SCI slices stay stable;
- add Prompt Vault read-only procedure retrieval only through governed vault read surfaces;
- improve ranking/selection measurement with real dogfood receipts;
- keep file-size discipline so agents can read package source without fragmenting context.
