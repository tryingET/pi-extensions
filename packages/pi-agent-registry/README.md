---
summary: "Overview and quickstart for the pi-agent-registry package."
read_when:
  - "Starting work in this package workspace."
  - "Using the agent_registry/dispatch_agent tools or the agent manifest convention."
system4d:
  container: "Local pi extension for standing-agent manifests."
  compass: "Map agent names to composed inspection metadata without owning execution."
  engine: "Discover manifests -> inspect/validate fail-closed -> report the Phase-0 dispatch gate."
  fog: "Fleet layout and conventions evolve in softwareco-agents, not here."
---

# pi-agent-registry

Standing-agent registry for Pi: discovers `agent.json` manifests (schema
`ai-society.agent/1`) and resolves an agent name into composed inspection
metadata without owning execution.

Status: Fleet Phase 0 (AK 5130) — manifest discovery, validation, and
inspection remain available; standing-agent execution is disabled. See
`docs/project/2026-08-27-agent-registry.md` for the design and `AGENTS.md` for
package-local rules.

## What it provides

- `agent_registry` tool — `list` / `show` / `validate` / `refresh` standing
  agents from their manifests.
- `dispatch_agent` tool — static confirmed-no-effects Phase-0 gate. It does
  not read request properties, resolve the registry, allocate capacity or
  sessions, create a worktree, spawn, or route through another tool. AK 5132
  owns the future exact-task read-only ASC contract.
- `/agents` command — quick operator listing.

## Fleet layout

ONE STANDALONE REPO PER AGENT. The canonical fleet home is
`~/ai-society/agents/agent-*` (conventions owner:
`softwareco-agents/docs/agent-registry.md`). Company/lane agent homes
(`~/ai-society/softwareco/owned/agent-*`, …) are forward-compatible extras.
An `agent.json` is only ever read at an agent-repo root — never nested inside
a product repo.

Override discovery with `PI_AGENT_REGISTRY_ROOTS` (colon-separated patterns
or explicit dirs; env-configured roots that do not exist fail closed).

## Resolution contract

```
registry.resolve(name) -> {
  systemPrompt,   // system_prompt_file contents + rendered advisory scope
  tools,          // manifest allowlist; read default for [] (read-only)
  thinking, model,// manifest defaults; model null = inherit parent session
  extensions,     // resolved child extension allowlist
  skillDirs,      // materialized EC profile members + extras
  activities,     // expanded activity template paths
  cleanup()       // removes materialized skill dirs after inspection
}
```

Fail-closed: unknown skill names, unknown EC profiles, missing files,
duplicate agent names, or schema mismatches ⇒ resolution error. Separately,
every `dispatch_agent` request is rejected before resolution or effects.

## Environment

| Variable | Meaning |
| --- | --- |
| `PI_AGENT_REGISTRY_ROOTS` | colon-separated discovery patterns/dirs |
| `PI_AGENT_REGISTRY_EC_PROFILES` | engineering-core `skills/profiles.json` path |
| `PI_AGENT_REGISTRY_USER_SKILLS` | user skills root for `skills.extra` |

Sources of truth: manifest authoring belongs to each agent repo; skill
profiles belong to engineering-core (`skills/profiles.json`, generated schema
`engineering-core.skill-profiles/1`); future authorized execution belongs to
pi-autonomous-session-control. The loader retains legacy raw-map read
compatibility only for migration and fails closed on governed schema drift.
This package maps name → composed inspection metadata and never duplicates
those owners. Fork/scout/candidate/workflow tools are separate capabilities,
not standing-agent routing fallbacks.

## Validation

```bash
npm run check        # quality gate: structure, lint, typecheck, tests, packaging
npm test             # same
```

Tests include a live fixture against the real
`~/ai-society/agents/agent-adoption-steward` repo and the real
engineering-core `profiles.json`.
