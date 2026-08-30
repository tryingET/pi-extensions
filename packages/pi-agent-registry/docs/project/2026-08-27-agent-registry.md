---
summary: "Design and implementation record for the pi-agent-registry package (AK 5098)."
read_when:
  - "Changing the manifest loader, resolver, or Fleet Phase-0 dispatch gate."
  - "Onboarding to the agent manifest convention implementation."
system4d:
  container: "Monorepo package implementing the agent manifest convention v1."
  compass: "Fail-closed manifest inspection with standing-agent execution disabled in Phase 0."
  engine: "Validate manifests -> compose inspection metadata -> report the static dispatch gate."
  fog: "Convention drift between the spec doc, the fleet, and this package."
---


# pi-agent-registry — design record (2026-08-27, AK 5098)

Implements the agent manifest convention v1
(`docs/project/2026-08-27-agent-manifest-convention.md` at the monorepo root,
authoritative spec). Conventions owner for the fleet layout is
`softwareco-agents/docs/agent-registry.md`; this package implements
resolution and the Phase-0 dispatch gate, not fleet policy.

## Non-goals

- No new spawn machinery: execution, session custody, capacity, effect
  receipts, and resume stay owned by pi-autonomous-session-control (ASC).
- No manifest authoring tooling: each agent repo owns its `agent.json`.
- No sandbox: `scope.repos` / `scope.forbidden` are advisory and rendered
  into the system prompt plus the ASC task contract only.

## Architecture

```
agent.json (agent repo root)
  └─ src/manifest.ts      fail-closed loader/validator (schema, names,
                          path containment, skills, tools, defaults, scope,
                          activity globs)
  └─ src/ec-profiles.ts   governed EC profiles.json envelope loading
                          (engineering-core.skill-profiles/1 + deprecated
                          aliases; legacy-map transition read), skill-source
                          resolution (EC root → agent .pi/skills → user root),
                          materialized layout <dir>/<skill>/SKILL.md
  └─ src/registry.ts      pattern discovery (~/ai-society/agents/agent-* …),
                          duplicate-name fail-closed index, resolve(name)
  └─ src/dispatch.ts      static frozen confirmed-no-effects Phase-0 gate;
                          no registry, ASC, peer, workflow, or loop routing
  └─ src/sessions-dir.ts  quarantined legacy registry-owned path resolver
  └─ extensions/…         read-only agent_registry, gated dispatch_agent, /agents
```

### Fleet Phase-0 execution quarantine (AK 5130)

The resolver still composes persona, skills, tools, model/thinking defaults,
extensions, and advisory scope for read-only `agent_registry` inspection.
That object is not execution authority.

`dispatch_agent` and the shipped `src/dispatch.ts` adapter reject statically
before reading caller properties or touching registry resolution, skill
materialization, ASC runtime construction, session/capacity state, worktrees,
spawners, evidence, or authority. They do not route through
`dispatch_subagent`, fork/scout/candidate peers, workflows, or loops. The
legacy registry-local session-root adapter is also quarantined; registry code
must not reproduce ASC path/capacity policy.

ASC remains the execution owner, and its `extraSkillProfileResolver` seam is
available for an intentionally versioned future consumer. AK 5132 must first
land and prove an exact-task, immutable-receipt, read-only contract. Until
then the registry's exact `0.5.2` ASC dependency is not used as a launch path,
and no unpublished monorepo export is assumed.

### Model metadata

`defaults.model: null` means a future authorized ASC consumer would inherit
the parent model; a pinned `provider/model` remains inspectable registry
metadata. Phase 0 accepts no request-level model or policy override because it
never launches.

### Discovery (fleet rule)

ONE STANDALONE REPO PER AGENT. Default roots: the workspace-level fleet home
`~/ai-society/agents/agent-*` first, then company/lane `agent-*` patterns as
forward-compatible extras (silently absent today). A root is either a glob
whose leaf segment matches agent-repo dir names or an explicit agent-repo
dir; there is no recursion and no nesting. `PI_AGENT_REGISTRY_ROOTS`
overrides; env-configured roots that do not exist fail closed, defaults skip
silently.

### Fail-closed surface

- schema mismatch, unknown top-level/defaults/scope/skills keys
- reserved names (ASC profiles), malformed names/versions/tools
- `system_prompt_file` / activities escaping the repo root or missing
- unknown EC profile (at load, when profiles are supplied), unknown extra
  skill (at resolution), EC profile member missing on disk
- glob activities matching no files; duplicate agent names across repos
- every dispatch request receives the static Phase-0 gate before agent lookup
- no legacy session-root, raw-spawn, or alternate peer/workflow route

## Verification

- `tests/manifest.test.mjs` — validation fail-closed paths + activity globs
- `tests/registry.test.mjs` — discovery, resolution happy path, materialization
  from the real EC `profiles.json`, live fixture against the real
  `~/ai-society/agents/agent-adoption-steward` repo
- `tests/dispatch.test.mjs` — hostile caller proxies, immutable no-effect
  metadata, legacy policy/session-root quarantine, and no alternate route
- `tests/extension.test.mjs` — tool registration, list/show/validate/refresh,
  and public Phase-0 gate behavior without request-property reads
- ASC contract tests — public runtime option/state identity hardening,
  malformed-resume no-effect behavior, and packed entrypoint boundaries

## Future

- AK 5132: exact-task, immutable-receipt, read-only standing-agent dispatch.
- Resume, extension allowlists, and any model override only after that
  contract proves no authority/capacity bypass.
- Optional per-agent override of discovery depth — intentionally absent now.
