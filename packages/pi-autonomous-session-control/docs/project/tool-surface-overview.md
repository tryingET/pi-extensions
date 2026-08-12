---
summary: "Snapshot of available tool surface with provenance traces across core + extensions."
read_when:
  - "Auditing tool sprawl across extensions."
  - "Before pruning or consolidating extension capabilities."
system4d:
  container: "Tool inventory + provenance audit."
  compass: "Minimize ambiguity about what is available and where it comes from."
  engine: "Observe runtime tools -> trace source registration -> flag drift."
  fog: "Settings overrides and stale paths can desync intent vs actual load state."
---

# Tool Surface Overview (with provenance trace)

## Snapshot basis

This inventory combines:
1. **Current coding session callable tools** (the tool API exposed in this session)
2. **Registration traces in source** (`pi.registerTool`)
3. **Global Pi settings** (`~/.pi/agent/settings.json`) and package overrides

Date: 2026-03-05

Cross-extension coherence note:
- `tests/prompt-vault-cross-extension.test.mjs` keeps parser/readiness unit coverage in the default check.
- `tests/prompt-vault-cross-extension.live.mjs` is the explicit opt-in live harness that checks the visible `vault_query`/`vault_retrieve` tool chain still lands in ASC-owned prompt provenance on `dispatch_subagent`.
- Treat the live harness as the executable companion to this inventory when exposed-tool discoverability is in doubt; it is intentionally not discovered by default `npm run check`.

---

## A) Callable tools in this coding session (with trace)

| Tool | Trace (register source) | Origin bucket |
|---|---|---|
| `read` | pi core built-in toolset (`pi --help`) | Core |
| `bash` | pi core built-in toolset (`pi --help`) | Core |
| `edit` | pi core built-in toolset (`pi --help`) | Core |
| `write` | pi core built-in toolset (`pi --help`) | Core |
| `copy_to_clipboard` | `shitty-extensions/extensions/clipboard.ts` (also exposed by harness environment) | Extension + harness |
| `interview` | `pi-interview/index.ts` | Package extension |
| `self` | `pi-autonomous-session-control/extensions/self.ts` | Project extension |
| `dispatch_subagent` | `pi-autonomous-session-control/extensions/self/subagent.ts` | Project extension |
| `society_query` | `~/.pi/agent/extensions/society-orchestrator/index.ts` | User extension |
| `cognitive_dispatch` | `~/.pi/agent/extensions/society-orchestrator/index.ts` | User extension |
| `evidence_record` | `~/.pi/agent/extensions/society-orchestrator/index.ts` | User extension |
| `ontology_context` | `~/.pi/agent/extensions/society-orchestrator/index.ts` | User extension |
| `loop_execute` | `~/.pi/agent/extensions/society-orchestrator/loops/engine.ts` | User extension |
| `prompt_eval` | `~/.pi/agent/extensions/vault-client/evaluator.ts` | User extension |
| `vault_query` | `~/.pi/agent/extensions/vault-client/index.ts` | User extension |
| `vault_retrieve` | `~/.pi/agent/extensions/vault-client/index.ts` | User extension |
| `vault_vocabulary` | `~/.pi/agent/extensions/vault-client/index.ts` | User extension |
| `vault_insert` | `~/.pi/agent/extensions/vault-client/index.ts` | User extension |
| `vault_rate` | `~/.pi/agent/extensions/vault-client/index.ts` | User extension |

---

## B) Project extension tools expected from local auto-discovery

These are registered by this repo’s extension code:

| Tool | Trace | Expected visibility |
|---|---|---|
| `self` | `extensions/self.ts` | Visible |
| `dispatch_subagent` | `extensions/self/subagent.ts` | Visible |

Note: this inventory now matches the coding harness tool API list for project-local tools (`self`, `dispatch_subagent`).

---

## Prompt/tool discoverability rules

Keep these surfaces distinct:

- package-owned prompt assets live in `prompts/` and are exposed through `package.json#pi.prompts`
- package-local runtime/tool surfaces are `self` and `dispatch_subagent`
- `self` capability meta-queries (`What can you do?`, `capability discovery`, `capability routing`) describe self-tool query domains only; they do not discover or activate extension bundles
- `self({ query: "cache-aware delegation: tree or fork?" })` is the read-only routing surface for `/tree`, `/clone`, `/fork`, and clean dispatch; session replacement stays operator/command-controlled rather than becoming another model-callable mutation tool
- toolbox/bundle discovery belongs to the separate `toolbox` tool, which searches, explains, activates, deactivates, and inspects Pi extension bundles
- repo/lane capability-map routing belongs to documentation/read-first surfaces such as `repo-capability-map.md` and `pi-extensions/docs/project/root-capabilities.md`; these maps guide ownership and read order, not runtime authority
- prompt-envelope provenance is a tool-result surface on `dispatch_subagent` (`prompt_applied`, `prompt_name`, `prompt_source`, `prompt_tags`, `prompt_warning`)
- prompt-envelope/profile/task variation is placed once in the initial user message after Pi's stable host/project prefix; completed owned runs expose observed first-turn and aggregate cache measurements without asserting quality or cache inheritance
- `dispatch_subagent` request `env` is a guarded provenance-only child overlay: `PI_PROVENANCE_*` keys are allowed, while `PATH`, `NODE_OPTIONS`, `PI_CODING_AGENT_DIR`, and every non-`PI_PROVENANCE_*` key fail before spawn as `env_policy_failed`; there is no privileged passthrough escape hatch
- `self-prompt-vault-compat` reports the ASC package version against a package-manifest-bounded ASC floor, plus vault-client and prompt-vault schema checks
- live cross-extension coherence is proven by the `vault_query` -> `vault_retrieve` -> `dispatch_subagent` harness path, which should preserve the `vault-client-live` provenance label when the prompt came from the live vault-client tool chain
- repo-root `.pi/prompts/*` files in the monorepo root are repo-owned operator prompts, not ASC package prompts

---

## C) Settings-level extension trace (load intent vs filesystem reality)

### Enabled entries in `settings.json` with path issues

Observed at snapshot time; re-run the verification commands in section E before acting on these findings.

| Settings entry | Expected | Exists? | Finding |
|---|---:|---:|---|
| `/home/tryinget/.pi/agent/extensions/pi-extensions/usage-extension` | enabled | ❌ | stale/missing path |
| `+extensions/package-update-notify.ts` | enabled | ❌ | stale/missing path |
| `+extensions/secure-package-update.ts` | enabled | ❌ | stale/missing path |

### Package override drift (filtered package resources)

| Package override | Exists? | Finding |
|---|---:|---|
| `-extensions/teletext.ts` in `npm:shitty-extensions@1.0.9` | ❌ | stale disable target |
| `+pi-extensions/session-breakdown.ts` in `agent-stuff@v1.2.0` | ❌ | stale enable target |
| `-pi-extensions/context.ts` in `agent-stuff@v1.2.0` | ❌ | stale disable target |

### Ambiguous/contradictory intent

| Pattern | Finding |
|---|---|
| Speedreading entries | One absolute enabled path plus one relative disabled path create precedence ambiguity |
| Clipboard tool origin | `copy_to_clipboard` is both harness-exposed and extension-registered, risking provenance confusion |

---

## D) Practical cleanup plan

1. Remove stale/missing extension entries from `~/.pi/agent/settings.json`.
2. Normalize extension references to one style (absolute or package-relative, not mixed).
3. Keep one source of truth for `copy_to_clipboard` (harness or extension).
4. Use `pi config` after edits to verify effective enabled resources.
5. Re-run this inventory after cleanup to confirm reduced tool surface.

---

## E) Quick verification commands

```bash
pi list
pi config
rg -n "registerTool\(" ~/.pi/agent/extensions ~/.npm-global/lib/node_modules/pi-interview ~/.npm-global/lib/node_modules/shitty-extensions/extensions ~/programming/pi-extensions/pi-autonomous-session-control/extensions -g '!**/node_modules/**'
```
