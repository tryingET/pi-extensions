---
summary: "Installed-package validation evidence for raw query/retrieve behavior, shared prompt preparation, live Nunjucks rendering, and legacy pi-vars rendering in pi-vault-client."
read_when:
  - "Before claiming render-engine behavior is verified end to end."
  - "When you need evidence for raw retrieval vs execution-time rendering in pi-vault-client."
system4d:
  container: "Package-local validation artifact for render-engine behavior."
  compass: "Keep raw Prompt Vault surfaces distinct from execution-time rendering, and record what was verified live vs what still needs manual UI-only confirmation."
  engine: "Insert temporary templates -> verify raw query/retrieve -> install package into isolated pi runtime -> verify live execution paths -> remove temporary templates -> document evidence."
  fog: "Main failure modes are conflating retrieval with rendering, assuming /vault passes positional args, or hiding render failures behind a silent extension fallback."
---

# Live render-engine validation

Date: 2026-03-08

## Scope

This validation pass covered:

1. raw discovery stays non-rendering
2. raw retrieval stays raw
3. shared prompt preparation now uses explicit render inputs and structured success/error output
4. explicit Nunjucks renders at execution time in an installed package
5. malformed Nunjucks fails clearly in live usage
6. legacy pi-vars substitution still works in live usage on a path that supplies positional args

Post-nexus hardening note:
- generic `/vault` execution no longer auto-detects pi-vars from raw prompt text
- the `nunjucks` engine name now maps to a safe variable-only interpolation subset rather than the full JS-evaluating Nunjucks runtime
- block syntax such as `{% ... %}` is intentionally rejected

## Preconditions

### Prompt Vault verification

```bash
cd ~/ai-society/core/prompt-vault
./verify.sh
```

Observed:
- pass (`39` checks, `0` failures)

### Package regression checks run during this slice

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
node --test tests/template-renderer.test.mjs tests/vault-query-regression.test.mjs
```

Observed:
- pass (`35` tests, `0` failures)

## Temporary Prompt Vault fixtures used

These temporary active templates were inserted for the verification pass and removed afterward:

- `tmp-nunjucks-live-20260308`
- `tmp-nunjucks-bad-20260308`
- `tmp-pivars-live-20260308`

Key live Nunjucks fixture:

```md
---
render_engine: nunjucks
---
Company: {{ current_company }}
Context: {{ context }}
Template: {{ template_name }}
```

Malformed live Nunjucks fixture:

```md
---
render_engine: nunjucks
---
{% if current_company %}broken
```

## 0) Shared preparation contract follow-up

This follow-up pass moved `/vault`, live `/vault:`, and grounding onto the same structured preparation contract.

What the preparation step now makes explicit:

- `currentCompany`
- `context`
- `args`
- `templateName`
- structured success/error output instead of ad-hoc throwing at each call site

Additional regression evidence from the follow-up pass:

- governed render keys (`current_company`, `context`, `template_name`, `arguments`, `argN`) cannot be overridden by extra render data
- generic `/vault` paths preserve literal `$1`/`$ARGUMENTS` text unless a caller explicitly opts into legacy pi-vars compatibility
- the shared preparation step appends `## CONTEXT` whenever caller context would otherwise be lost
- visibility-sensitive live verification can be pinned with `PI_COMPANY`
- session-sensitive company resolution is pinned through explicit session cwd handoff before live rendering paths fire

## 1) Raw discovery remains raw (`vault_query`)

Command:

```text
vault_query({
  intent_text: "temporary live verification template for explicit Nunjucks rendering",
  include_content: false,
  limit: 5
})
```

Observed excerpt:

```md
## tmp-nunjucks-live-20260308
Temporary live verification template for explicit Nunjucks rendering

### Core classification
- artifact_kind: procedure
- control_mode: one_shot
- formalization_level: bounded
```

Interpretation:
- discovery surfaced classification only
- no rendered body appeared
- query stayed discovery-only as intended

## 2) Raw retrieval remains raw (`vault_retrieve`)

Command:

```text
vault_retrieve({ names: ["tmp-nunjucks-live-20260308"], include_content: true })
```

Observed excerpt:

```md
---
render_engine: nunjucks
---
Company: {{ current_company }}
Context: {{ context }}
Template: {{ template_name }}
```

Interpretation:
- retrieval returned frontmatter + body unchanged
- retrieval did not pretend execution-time rendering had already happened

## 3) Installed-package live Nunjucks execution

### Installation evidence

Commands:

```bash
TEST_AGENT_DIR=$(mktemp -d)
cp ~/.pi/agent/auth.json "$TEST_AGENT_DIR/auth.json"
cat > "$TEST_AGENT_DIR/settings.json" <<'JSON'
{
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o",
  "enabledModels": ["openai/gpt-4*"],
  "extensions": []
}
JSON

PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client

PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" pi list
```

Observed:

```text
User packages:
  ../../home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
    /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
```

### Live execution command

```bash
PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi --no-session --mode json \
  --print '/vault:tmp-nunjucks-live-20260308::phase-1-live' \
  | jq -r 'select(.type=="agent_end") | .messages[0].content[0].text'
```

Observed:

```text
Company: software
Context: phase-1-live
Template: tmp-nunjucks-live-20260308
```

Interpretation:
- installed package handled the command
- execution-time rendering happened inline
- `current_company`, `context`, and `template_name` were populated on the `/vault` path
- raw frontmatter was stripped before use

## 4) Malformed Nunjucks now fails clearly in live usage

Command:

```bash
PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi --no-session --mode json \
  --print '/vault:tmp-nunjucks-bad-20260308::phase-1-live' \
  | jq -r 'select(.type=="agent_end") | .messages[0].content[0].text'
```

Observed after the live-error handling fix:

```text
Vault template render failed (tmp-nunjucks-bad-20260308): Nunjucks render failed: Unsupported Nunjucks syntax: only variable interpolation tags like {{ current_company }} are allowed
```

Interpretation:
- malformed Nunjucks no longer falls through as a raw slash command
- the user-visible execution path now surfaces the render failure explicitly

## 5) Legacy pi-vars still render in live usage on an args-supplying path

Live verification used the existing `next-10-expert-suggestions` flow because it still passes positional args into template rendering.

Command:

```bash
PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi --no-session --mode json \
  --print '/next-10-expert-suggestions "verify templating" "workflow" "lite"' \
  | jq -r 'select(.type=="agent_end") | .messages[0].content[0].text' \
  | rg -n '^verify templating$|^workflow$|^lite$'
```

Observed:

```text
12:verify templating
15:workflow
18:lite
```

Interpretation:
- the live prompt text contained the supplied positional values
- legacy pi-vars substitution remained intact on a real execution path that provides args

## 6) Environment-pinned live checks after the preparation-contract follow-up

Commands (run from `/tmp` to avoid accidentally depending on repo cwd):

```bash
PI_COMPANY=software PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi --no-session --mode json --print '/vault:tmp-nexus-nunjucks-20260308::phase-2' \
  | jq -r 'select(.type=="agent_end") | .messages[0].content[0].text'

PI_COMPANY=software PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi --no-session --mode json --print '/vault:tmp-nexus-plain-20260308::phase-2' \
  | jq -r 'select(.type=="agent_end") | .messages[0].content[0].text'

PI_COMPANY=software PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi --no-session --mode json --print '/vault:tmp-nexus-bad-20260308::phase-2' \
  | jq -r 'select(.type=="agent_end") | .messages[0].content[0].text'

PI_COMPANY=core PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi --no-session --mode json --print '/vault:tmp-nexus-nunjucks-20260308' \
  | jq -r 'select(.type=="agent_end") | .messages[0].content[0].text'
```

Observed:

```text
Company: software
Context: phase-2
Template: tmp-nexus-nunjucks-20260308

Base body

## CONTEXT
phase-2

Vault template render failed (tmp-nexus-bad-20260308): Nunjucks render failed: Unsupported Nunjucks syntax: only variable interpolation tags like {{ current_company }} are allowed

Vault selection unavailable: no-match. Check VAULT_DIR/fzf availability.
```

Interpretation:
- explicit-company Nunjucks rendering still works through the shared preparation path
- non-Nunjucks vault prompts still get deterministic `## CONTEXT` attachment
- malformed Nunjucks still fails through the same shared preparation path
- company visibility can be pinned explicitly during live verification with `PI_COMPANY`

Important inspection note:
- in `--mode json` traces above, `messages[0]` is the transformed user text after extension preparation
- use that intentionally when verifying prompt-preparation behavior
- do not confuse it with the model's final assistant response

## Contract clarifications from this pass

1. `vault_query(..., include_content:false)` and `vault_retrieve(..., include_content:true)` must stay raw; execution-time rendering is a separate layer.
2. `/vault`, live `/vault:`, and grounding now share the same preparation contract with explicit render inputs and structured success/error output.
3. `/vault` and live `/vault:` currently provide:
   - `current_company`
   - `context`
   - `template_name`
4. positional args (`args`, `arguments`, `arg1`, `arg2`, ...) are available only on execution paths that actually pass args, such as grounded flows like `next-10-expert-suggestions`.
5. explicit `pi-vars` templates should now fail clearly on execution paths that supply no positional args instead of silently substituting empty strings.
6. governed render keys must not be overrideable by extra render data.
7. framework-grounding appendices should go through the same shared preparation contract rather than bypassing rendering as raw template text.
8. for visibility-sensitive live verification, pin `PI_COMPANY` explicitly instead of relying on cwd inference alone.
9. the original live verification gap was not just success-path rendering; malformed Nunjucks needed explicit live-path error surfacing too.

## `/reload` note

Automated evidence here used an installed package plus a fresh `pi` process rooted at an isolated `PI_CODING_AGENT_DIR`.
That proves the installed package behavior on a clean runtime load.

What is **not** captured here is a same-session interactive `/reload` transcript inside a running TUI instance.
If maintainers require literal `/reload` evidence rather than clean-start equivalence, append a short manual TUI note here rather than redoing the rest of the matrix.

## 2026-03-11 addendum — published semver dependency installed-runtime follow-up

After retiring the local file-dependency + bundle-staging bridge, an additional installed-runtime pass was run against the package as installed into an isolated `PI_CODING_AGENT_DIR`.

### Installation evidence

Commands:

```bash
TEST_AGENT_DIR=$(mktemp -d /tmp/pi-vault-live-XXXXXX)
cp ~/.pi/agent/auth.json "$TEST_AGENT_DIR/auth.json"
cat > "$TEST_AGENT_DIR/settings.json" <<'JSON'
{
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o",
  "enabledModels": ["openai/gpt-4*"],
  "extensions": []
}
JSON

PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client

PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" pi list
```

Observed excerpt:

```text
User packages:
  ../../home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
    /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
```

### Installed-package tool evidence

Commands:

```bash
PI_COMPANY=software PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi -p "Do not use bash or read. Call the custom tool named vault_schema_diagnostics exactly once with empty arguments, then reply with only SUCCESS or FAILURE based on whether the tool call succeeded."

PI_COMPANY=software PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi -p "Do not use bash or read. Call the custom tool named vault_query with limit 1 and include_content false, then reply with only SUCCESS or FAILURE based on whether the tool call succeeded."
```

Observed:

```text
SUCCESS
SUCCESS
```

Interpretation:
- installed package registration remained healthy after the semver-dependency switch
- tool surfaces still load and execute in an isolated installed runtime

### Installed-package live `/vault:` path

Command:

```bash
PI_COMPANY=software PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
  pi --no-session --mode json --print '/vault:meta-orchestration::phase-1-live' \
  | jq -r 'select(.type=="agent_end") | .messages[0].content[0].text'
```

Observed excerpt:

```text
META-ORCHESTRATION — The Phase Navigator
...
## CONTEXT
phase-1-live
```

Interpretation:
- installed package handled the live `/vault:` execution path correctly after the dependency simplification
- execution-time preparation still happened in the installed runtime
- caller context was preserved through the shared preparation boundary

### Important limitation from this addendum

Headless `--print` evidence remains strongest for live `/vault:` and tool surfaces.
Registered slash-command handlers such as `/vault`, `/route`, and the interactive-only `/vault-check` still need a same-session TUI `/reload` validation note if maintainers want literal interactive parity evidence rather than clean-start installed-runtime equivalence.
