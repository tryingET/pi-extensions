---
summary: "Design and implementation record for the pi-agent-registry package (AK 5098)."
read_when:
  - "Changing the manifest loader, resolver, or ASC dispatch integration."
  - "Onboarding to the agent manifest convention implementation."
system4d:
  container: "Monorepo package implementing the agent manifest convention v1."
  compass: "Fail-closed name-to-launch resolution with ASC-owned execution."
  engine: "Validate manifests -> compose launch -> feed ASC custom profile."
  fog: "Convention drift between the spec doc, the fleet, and this package."
---


# pi-agent-registry — design record (2026-08-27, AK 5098)

Implements the agent manifest convention v1
(`docs/project/2026-08-27-agent-manifest-convention.md` at the monorepo root,
authoritative spec). Conventions owner for the fleet layout is
`softwareco-agents/docs/agent-registry.md`; this package implements
resolution and dispatch, not fleet policy.

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
  └─ src/dispatch.ts      feeds ASC createAscExecutionRuntime with
                          profile="custom" + skillProfile=<agent name>
  └─ extensions/…         agent_registry + dispatch_agent tools, /agents
```

### ASC integration (minimal seam, no fork)

ASC gained one opt-in hook: `extraSkillProfileResolver` on
`AscExecutionRuntimeOptions` / `SubagentSkillSelectionOptions`. It is
consulted only when the built-in skill-librarian registry misses the
requested profile; returning `undefined` preserves ASC's original
fail-closed diagnostics. The registry maps the agent name to a materialized
skill-dir selection through that hook, so clean-child skill isolation
(`--no-skills` + materialized `--skill` dirs), capacity, effect receipts,
and post-run cleanup remain ASC-owned end to end. ASC is a semver-exact
runtime dependency resolved from the npm registry (not bundled: npm 12
rejects overrides-affected bundles, and ASC `0.5.2` has no runtime
dependencies of its own); the packed manifest keeps the plain
`0.5.2` requirement for consumers.

### Model handling

`defaults.model: null` inherits the parent session model via ASC's
`resolveSubagentModelSelection`; a pinned `provider/model` string is passed
through. Request-level `model` overrides both.

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
- unknown agent at dispatch; resolution failure rejects before any spawn

## Verification

- `tests/manifest.test.mjs` — validation fail-closed paths + activity globs
- `tests/registry.test.mjs` — discovery, resolution happy path, materialization
  from the real EC `profiles.json`, live fixture against the real
  `~/ai-society/agents/agent-adoption-steward` repo
- `tests/dispatch.test.mjs` — ASC custom-profile composition, model
  inheritance, no-spawn failure paths, post-run skill cleanup
- `tests/extension.test.mjs` — tool registration, list/show/validate/refresh,
  unknown-agent structured error
- ASC: `tests/dispatch-subagent-extra-skill-profile.test.mjs` — seam fallback,
  built-in-registry precedence, spawn-def passthrough

## Future

- `resumeDispatchId` passthrough for standing-agent continuation.
- Extension allowlist hardening beyond ASC's current resolution.
- Optional per-agent override of discovery depth — intentionally absent now.
