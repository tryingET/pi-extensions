---
summary: "Task 5508 package, independent review and fresh Pi execution evidence."
read_when:
  - "Checking which TypeScript port behavior was actually verified."
type: "reference"
system4d:
  container: "Package-local task 5508 verification record."
  compass: "Distinguish package checks, real execution and untested behavior."
  engine: "Validate -> independently review -> run fresh host -> record limits."
  fog: "Passing isolated checks does not prove full-stack or sandbox behavior."
---

# Verification — 2026-09-07

## Implementation and artifact checks

Fresh scaffold from template commit `8bcc39a85a62b6b8dc4b96e5879f79b4e97d8192`;
selective port from spike `a0411c361453c082822d9cdb05f177a9948c9f1a`.
See [provenance](provenance.md).

From this package, using managed TMPDIR:

```bash
npm ci --ignore-scripts --no-audit --no-fund
PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run check
```

Implementation validation passed structure, file budgets, Biome, TypeScript,
**42 tests**, an **18-file artifact allowlist**, and **nine provider-free unpacked
package checks**. Tested on Linux / Node 26.8.1; Node 22 was not separately run.
The tarball checks are not a registry production-install proof.

## Independent review

Review dispatch `dispatch-1788775554638` reproduced two defects: emitted decorator
helpers broke expression wrapping, and type-only wrapped functions were not
invoked. Both were fixed. Rereview passed ten targeted registered-tool tests plus
all four original reproductions, and approved these fixes. Type-invalid wrappers
remain rejected. Default reads were reduced to 16,000 bytes so ordinary truncated
UTF-8 results have room for the marker within the result budget.

This is bounded review, not a legal or sandbox certification.

## Installation and fresh host execution

Controller ran successfully:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-typescript-tool
```

Tester dispatch `dispatch-1788776050354` ran a fresh **actual Pi SDK agent loop**
with configured model/provider `openai-codex-2 / gpt-6-astra`, Pi **0.84.4**, Node
**26.8.1**. The extension was explicitly loaded from the canonical source path;
only `typescript` was active. Fixed snippets used a scratch fixture, not repository
or credential data. Results:

| Requested check | Host-observed result |
|---|---|
| `fs.list` and marker read in one program | Correct filenames and exact marker |
| `(() => 42) satisfies ToolProgram` | `42` |
| Decorated class function | `{"value":42,"calls":1}` |
| Deliberately invalid `fs.write` | Host `isError: true`, missing-property diagnostic |

Four calls, four results, five assistant turns, zero retries, clean exit, empty
stderr. Payload lengths were 85, 2, 22 and 94 bytes. jq assertions passed. Fixture
hashes remained unchanged and no extra workspace files appeared. Tester also ran
39 focused runtime tests; those do not substitute for the full package gate.

Local scratch evidence root:
`/home/tryinget/.local/state/pi-quests/tmp/task5508-live-2TKJpe`.
Relevant artifacts: `summary.json`, `events.jsonl`, `assertions.txt`,
`fixture-integrity.txt`, `unit-tests.tap`. Do not copy private authentication
material from scratch into this repository.

## Exact proof boundary

This proves real model-to-host tool execution, beyond mocked registration or
calling `execute` directly. It does **not** prove global autodiscovery, full-stack
compatibility, existing-controller reload, live interruption/session replacement,
or Node 22 compatibility. No release or publication was performed.

The [README trust limitations](../../README.md#trust-and-execution-limitations)
remain: in-process trusted code, no sandbox, post-await loops may hang the host,
cooperative asynchronous cancellation, and non-race-proof filesystem guards.
Main landing is separate from all validation and activation evidence above.
