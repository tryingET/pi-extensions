---
summary: "Overview and quickstart for the pi-agent-registry package."
read_when:
  - "Starting work in this package workspace."
  - "Using the agent_registry/dispatch_agent tools or the agent manifest convention."
system4d:
  container: "Local pi extension for standing-agent manifests."
  compass: "Map agent names to composed launches without owning execution."
  engine: "Discover manifests -> resolve fail-closed -> dispatch through ASC."
  fog: "Fleet layout and conventions evolve in softwareco-agents, not here."
---

# pi-agent-registry

Standing-agent registry for pi: discovers `agent.json` manifests (schema
`ai-society.agent/1`), resolves an agent name into a composed launch, and
dispatches it through pi-autonomous-session-control's existing subagent
machinery.

Status: v0.1.0 — manifest loader/validator, resolver, ASC dispatch
integration, tests. See `docs/project/2026-08-27-agent-registry.md` for the
design and `AGENTS.md` for package-local rules.

## What it provides

- `agent_registry` tool — `list` / `show` / `validate` / `refresh` standing
  agents from their manifests.
- `dispatch_agent` tool — resolve an agent and dispatch it through ASC's
  custom-profile + skill-profile path (session custody, capacity, effect
  receipts, and resume stay owned by ASC).
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
  cleanup()       // removes materialized skill dirs (ASC calls it post-run)
}
```

Fail-closed: unknown skill names, unknown EC profiles, missing files,
duplicate agent names, or schema mismatches ⇒ resolution error, no spawn.

## Environment

| Variable | Meaning |
| --- | --- |
| `PI_AGENT_REGISTRY_ROOTS` | colon-separated discovery patterns/dirs |
| `PI_AGENT_REGISTRY_EC_PROFILES` | engineering-core `skills/profiles.json` path |
| `PI_AGENT_REGISTRY_USER_SKILLS` | user skills root for `skills.extra` |

Sources of truth: manifest authoring belongs to each agent repo; skill
profiles belong to engineering-core (`skills/profiles.json`, generated schema
`engineering-core.skill-profiles/1`); execution belongs to
pi-autonomous-session-control. The loader retains legacy raw-map read
compatibility only for migration and fails closed on governed schema drift.
This package only maps name → composed launch and never duplicates those
owners.

## Validation

```bash
npm run check        # quality gate: structure, lint, typecheck, tests, packaging
npm test             # same
```

Tests include a live fixture against the real
`~/ai-society/agents/agent-adoption-steward` repo and the real
engineering-core `profiles.json`.
