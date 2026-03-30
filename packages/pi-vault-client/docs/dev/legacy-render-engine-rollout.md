---
summary: "Operator-facing rollout boundary for migrating legacy Prompt Vault templates onto explicit render_engine semantics without restoring ambiguous generic-path auto-detection."
read_when:
  - "Planning or executing migration of legacy Prompt Vault templates that still contain pi-vars syntax."
  - "Deciding whether a template should remain plain, move to explicit nunjucks, or stay pi-vars on an args-supplying path."
  - "Explaining why generic /vault and live /vault: intentionally do not auto-detect legacy pi-vars anymore."
system4d:
  container: "Package-local rollout note for render-engine migration and operator handling."
  compass: "Keep runtime behavior explicit, keep migration decisions classifiable, and never trade correctness for convenience by reviving ambient detection."
  engine: "Inventory legacy templates -> classify by execution contract -> pilot the smallest safe migration set -> verify each path explicitly -> document what still needs data work."
  fog: "The main failure modes are bulk-adding render_engine: pi-vars to templates that do not actually receive args, or treating rollout pain as proof that the old ambiguity should return."
---

# Legacy render-engine rollout boundary

Date: 2026-03-09

## Why this document exists

`pi-vault-client` now has an explicit render-engine contract:

- `none`
- `pi-vars`
- `nunjucks`

That contract is intentional.
What remains is not a runtime-design problem so much as a **data migration and operator rollout problem**:
legacy Prompt Vault templates still exist that were authored in the era when generic execution paths could get away with ambiguous pi-vars behavior.

This document exists to keep that boundary sharp:

- migrate templates intentionally
- verify each execution path honestly
- do **not** revive generic auto-detect on `/vault` or live `/vault:` just to make old data seem fine again

## Canonical behavior now

### Retrieval stays raw

These surfaces return stored content, not execution-time rendering:

- `vault_query`
- `vault_retrieve`

That means frontmatter remains visible on raw retrieval, and raw `$1`/`$@` tokens remain raw in retrieval output.

### Execution is explicit

Execution-time rendering is chosen by explicit frontmatter when present:

```md
---
render_engine: none|pi-vars|nunjucks
---
```

If `render_engine` is omitted:

- generic execution paths treat the template as `none`
- generic `/vault` and live `/vault:` do **not** auto-detect legacy pi-vars syntax from raw body text
- some specialized grounding paths may still opt into legacy pi-vars auto-detection intentionally while migration remains incomplete

### Generic `/vault` and live `/vault:` are intentionally strict

Generic vault execution paths currently provide governed context keys such as:

- `current_company`
- `context`
- `template_name`

They do **not** provide positional args.

That detail matters:

- a template that wants `{{ current_company }}` or `{{ context }}` is a good fit for explicit `nunjucks`
- a template that needs `$1`, `$2`, or `$@` is **not** automatically a good fit for generic `/vault`

This is the central rollout truth.

## What is and is not a bug

### Real bug

A template that declares an explicit supported render engine and then fails to render correctly on a path that provides the required inputs.

### Not a bug

A legacy template with raw `$1` tokens rendering as raw text on generic `/vault` when it has not been migrated.

### Also not a bug

A template becoming semantically wrong after blindly adding `render_engine: pi-vars` on a path that does not supply positional args.

That is a migration mistake, not evidence that generic auto-detect should return.

## The single most important migration rule

Do **not** bulk-prepend `render_engine: pi-vars` to every template that contains pi-vars-looking tokens.

That move is unsafe because:

- `pi-vars` performs substitution from positional args
- generic `/vault` and live `/vault:` do not supply those args
- explicit `pi-vars` templates on those paths now fail clearly instead of silently degrading

In other words:

- before migration: visible wrongness
- after blind `pi-vars` migration: hard failure on a mismatched caller contract

That hard failure is still better than reviving ambiguous auto-detection, because it makes the migration boundary visible and actionable.

## Classification matrix

Before changing any template, classify it by the execution contract it actually needs.

| Template class | Typical markers | Recommended engine | Safe on generic `/vault`? | Notes |
|---|---|---:|---:|---|
| Plain static template | no variable syntax | `none` or omitted | yes | Optional frontmatter only if clarity helps |
| Governed-context template | wants company/context/template metadata | `nunjucks` | yes | Preferred upgrade path for generic vault usage |
| Positional-args template on a specialized caller | `$1`, `$2`, `$@`, `${@:N}` and a real args-supplying path exists | `pi-vars` | not generically | Keep only where caller contract truly supplies args |
| Legacy pi-vars template currently invoked through generic `/vault` | raw pi-vars tokens but no args-supplying caller | redesign, often to `nunjucks` | not until redesigned | This is a content/caller mismatch, not a renderer bug |

## Recommended decision tree

### 1. Does the template need no dynamic data?

- leave it plain
- optionally add `render_engine: none` if you want explicitness

### 2. Does the template only need governed vault context?

Examples:

- current company
- freeform context string
- template name

Then migrate it to explicit `nunjucks`.

### 3. Does the template truly need positional args from a specialized invocation path?

Then `pi-vars` may still be the correct engine, **but only if the caller actually supplies args**.

Examples of good fits:

- grounding flows that deliberately pass positional inputs
- future explicit command/tool surfaces that define positional args as part of their contract

### 4. Does the template currently use pi-vars but only via generic `/vault` or live `/vault:`?

That template needs redesign, not a blind engine annotation.

Most often the right answer is one of:

- rewrite it as `nunjucks` using governed context keys
- keep it off generic vault paths until an args-supplying invocation path exists
- split one overloaded template into multiple templates with clearer execution contracts

## Migration patterns

## Pattern A: plain template stays plain

Stored content:

```md
Offer the sharpest possible diagnosis of the current problem.
Then propose three options with tradeoffs.
```

Recommended action:

- no change required
- optional explicit frontmatter:

```md
---
render_engine: none
---
Offer the sharpest possible diagnosis of the current problem.
Then propose three options with tradeoffs.
```

## Pattern B: generic vault template should become explicit `nunjucks`

### Before

```md
Company: $1
Context: $2
```

If that template is being used from generic `/vault`, it already has a contract mismatch because generic `/vault` does not supply positional args.

### Better after

```md
---
render_engine: nunjucks
---
Company: {{ current_company }}
Context: {{ context }}
```

Why this is better:

- it matches the actual generic vault caller contract
- it is explicit at the storage layer
- it avoids positional-args ambiguity

## Pattern C: specialized args-supplying path should become explicit `pi-vars`

### Before

```md
Objective: $1
Workflow: $2
Mode: $3
Extras: $4
```

### After

```md
---
render_engine: pi-vars
---
Objective: $1
Workflow: $2
Mode: $3
Extras: $4
```

Only do this when you can point to the real caller that supplies those positional args.

## Pattern D: overloaded legacy template should be split instead of force-fit

If one template tries to serve both:

- generic `/vault`
- and specialized args-supplying invocation

then the clean answer may be to split it:

- one template for generic governed-context execution
- one template for specialized positional-args execution

The resulting system is easier to understand, safer to test, and harder to misuse.

## Inventory commands

Run these from the package directory.

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
VAULT_DIR=$(node -e "import('./src/vaultTypes.ts').then(m=>console.log(m.VAULT_DIR))")
cd "$VAULT_DIR"
```

### Count active templates with obvious legacy pi-vars syntax

```bash
dolt sql -r json -q "SELECT COUNT(*) AS count FROM prompt_templates WHERE status='active' AND (content LIKE '%$1%' OR content LIKE '%$2%' OR content LIKE '%$@%' OR content LIKE '%$ARGUMENTS%' OR content LIKE '%${@:1}%');"
```

### Count active templates with explicit `render_engine:` frontmatter

```bash
dolt sql -r json -q "SELECT COUNT(*) AS count FROM prompt_templates WHERE status='active' AND content LIKE '%render_engine:%';"
```

### Inspect candidate templates by name and owner

```bash
dolt sql -q "SELECT name, owner_company, artifact_kind, control_mode, formalization_level FROM prompt_templates WHERE status='active' AND (content LIKE '%$1%' OR content LIKE '%$@%' OR content LIKE '%$ARGUMENTS%' OR content LIKE '%${@:1}%') ORDER BY owner_company, name LIMIT 200;"
```

### Re-measured inventory on 2026-03-09

Current observed counts:

- active templates using legacy pi-vars tokens: `78`
- active templates with explicit `render_engine:` frontmatter: `0`

This matched the earlier nexus-pass observation, so the backlog is real rather than a measurement artifact.

A first read-only sample of affected template names included:

- `100x-mindset`
- `analysis-router`
- `implementation-planning`
- `meta-orchestration`
- `frontend-design`

Treat those names as inventory evidence, not as pre-approved migration targets.
Each still needs caller-contract classification before any content change.

## Suggested rollout sequence

## Phase 1: inventory and classification

For each candidate template, answer:

1. Which execution path actually uses it?
2. Does that path supply positional args?
3. Could the template be rewritten to governed context instead?
4. Is the template overloaded across multiple incompatible call contracts?

Do not change content until those answers are clear.

## Phase 2: pilot a tiny safe batch

Start with the lowest-risk category:

- templates clearly intended for generic `/vault`
- templates whose needs map cleanly to `current_company`, `context`, and `template_name`

Convert those to explicit `nunjucks` first.

That gives the highest confidence per change with the smallest behavioral surface area.

## Phase 3: verify the pilot end to end

For every pilot template, verify:

- raw query remains raw
- raw retrieval remains raw
- exact `/vault <name>` behaves correctly
- live `/vault:` behaves correctly
- malformed frontmatter or malformed Nunjucks fails clearly if intentionally tested

## Phase 4: classify the remaining pi-vars population

Split the rest into:

- **true pi-vars templates** with known args-supplying callers
- **misfit generic templates** that should be rewritten to Nunjucks or otherwise redesigned
- **unknowns** that need owner review before migration

## Phase 5: migrate only the class you understand

Good:

- explicit engine migration for a known class
- a tracked spreadsheet/list/issue batch of template names
- staged owner review if templates are cross-company or operationally sensitive

Bad:

- bulk search-and-replace across the entire vault
- assuming every `$1` means the same call contract
- treating operator pressure as permission to resurrect ambiguity

## Verification checklist for each migrated template

## Raw retrieval behavior

- `vault_query(..., include_content: false)` does not pretend execution has already happened
- `vault_retrieve(..., include_content: true)` returns raw frontmatter + body

## Generic vault behavior

If the template is intended for generic `/vault` usage:

- `/vault <exact-name>` renders with the expected governed context
- live `/vault:` renders the same template correctly
- no positional-args dependency remains hidden inside the body

## Specialized path behavior

If the template is intended for a specialized args-supplying path:

- verify that exact path, not just generic `/vault`
- verify positional ordering explicitly
- verify that the path still passes the expected args after migration

## Failure behavior

- malformed `nunjucks` fails clearly
- unsupported syntax is surfaced explicitly
- nothing silently falls through as if rendering succeeded

## Operator notes and hard boundaries

### Do not restore generic pi-vars auto-detect

Even if the migration backlog is annoying.
Even if raw token rendering looks ugly.
Even if there is pressure to make old templates "just work" again.

That ambiguity was removed for a reason.
Restoring it would reintroduce path-dependent behavior that is hard to reason about and hard to validate.

### Do not assume all `$1` templates should stay `pi-vars`

Some legacy templates used pi-vars-like notation simply because it was the path of least resistance at the time.
Those often become better templates when rewritten to explicit governed-context Nunjucks.

### Do not assume generic `/vault` has or should have positional args

Its current contract is intentionally different.
If a template fundamentally needs args, either:

- invoke it via a path that supplies them
- or redesign the template to use governed context instead

### Prefer visible strictness over invisible magic

A strict system that says "this template is not yet migrated" is safer than a magical system that sometimes guesses wrong.

## Suggested artifacts to maintain during rollout

If a larger migration begins, keep one operator artifact with:

- template name
- owner company
- current variable pattern
- intended execution path
- proposed target engine
- migration status
- verification status
- reviewer/owner signoff if needed

That artifact can live in Prompt Vault docs or governance tracking, but it should exist somewhere stable.

## Relationship to other package docs

- [Live render-engine validation](live-render-engine-validation.md) records installed-package evidence for current behavior.
- [README](../../README.md) describes the runtime contract seen by package users.
- [Next session prompt](../../next_session_prompt.md) tracks the remaining implementation work around tool context and rollout handling.

## Success condition for the rollout boundary

This document has done its job if maintainers can say all of the following with a straight face:

- we know why generic `/vault` is strict
- we know which templates should become Nunjucks
- we know which templates are legitimate pi-vars users on args-supplying paths
- we are not confusing migration backlog with renderer-design failure
- we are not tempted to bring back ambiguity just to make the backlog disappear
