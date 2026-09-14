---
summary: "Trusted TypeScript tool: usage, bounded helpers, and execution limitations."
read_when:
  - "Using or reviewing the typescript tool."
system4d:
  container: "Private Pi extension in pi-extensions."
  compass: "Typed trusted-code execution with explicit limits."
  engine: "Review -> typecheck -> execute -> bounded result."
  fog: "In-process vm and typechecking are not security boundaries."
---

# @tryinget/pi-typescript-tool

One Pi tool, **typescript**: strictly type-check one TypeScript function or
expression in memory, then execute it with read-only filesystem helpers rooted at
session `ctx.cwd`. **Trusted code only. Node vm is NOT a sandbox; typechecking is
not a security boundary.** Installing this tool exposes arbitrary in-process code
execution to the model; there is no per-call approval UI.

## Usage

Supply the tool's `code` argument, for example:

```typescript
async ({ fs }) => (await fs.list("."))
  .filter(entry => entry.kind === "file")
  .map(entry => entry.name)
```

Sync functions and expressions such as `40 + 2` also work. Parentheses, a trailing
semicolon and comments are accepted. Function classification also looks through
`satisfies`, `as`, angle-bracket assertions and non-null `!`, while retaining their
type constraints for validation. Class decorators and emitted TypeScript helpers
are executed as part of the complete compiled script. Imports, declarations and multiple top-level
statements are rejected. The [contract](src/capability-contract.d.ts) is included in
the tool description. Contextual parameter typing works; annotate empty arrays
when inference cannot determine their element type. Failed checks never execute.
Diagnostic coordinates refer to normalized/wrapped code, not original whitespace.
The package also ships two review/planning prompt templates; no slash command
executes snippets.

## Bounds and failure behavior

- Source: at most **65,536 UTF-8 bytes**. Only ES2022 library types and the contract
  enter the checker; no Node/DOM typings or arbitrary module resolution.
- `fs.list(path = ".")`: sorted directory metadata; **500 entries maximum**.
  Larger directories fail rather than silently omit entries. Symlinks are listed
  as `other`, without following them to obtain size. Enumeration is streamed.
- `fs.read(path, maxBytes = 16000)`: regular-file UTF-8 prefix, integer
  **1..65,536 bytes**. Reads at most maxBytes + 1; adds `… truncated` on overflow,
  dropping an incomplete trailing UTF-8 sequence. Malformed file bytes use Node's
  UTF-8 replacement behavior. The default leaves room for the marker when returning
  a valid UTF-8 prefix directly. Many newlines, malformed-byte expansion, JSON
  escaping or larger explicit reads can still exceed result limits; request less
  or summarize. No offset/pagination or binary decoding API.
- Per execution: **128 filesystem calls**, **1 MiB of requested read bytes**
  (plus one detection byte per read); reservations also cover concurrent calls.
  Path strings: at most 4096 characters, no NUL. A leading `@` is stripped.
- Results: strings, top-level undefined, or plain JSON data. **16,384 UTF-8 bytes /
  2000 lines**, **4096 nodes / 32 levels** maximum. Oversized values fail with a
  request to summarize; there is no hidden full-output file. Cycles, bigint,
  functions, symbols, non-finite numbers, nested undefined, sparse/extended arrays,
  class instances, accessors and non-enumerable properties are rejected. No
  toJSON/getter invocation. JSON output is compact. Details contain only the
  snippet kind, never the raw return value. Error messages are capped at 2000
  characters; arbitrary thrown objects are not coerced to strings.
- Tool errors are thrown so Pi marks failure. Pre-abort prevents checking and
  execution; abort listeners and deadline timers are removed after settlement.
  Helpers are revoked when execution finishes/fails; pending I/O checks revocation
  before returning. Underlying OS operations are not forcibly cancelled.

## Trust and execution limitations

- The VM timeout covers **initial synchronous invocation** (10 seconds). A separate
  10-second async deadline only stops waiting when the event loop can run. Code
  after await, microtask starvation and blocking host calls **can still hang Pi**;
  abort cannot interrupt them. Compilation, root resolution and serialization are
  outside the execution deadline. Detached work/rejections may outlive the call.
- There is **no memory, CPU, process, network or credential isolation**. Host
  function constructors can reach host globals; a test demonstrates this harmlessly
  with `typeof process`. Dynamic VM code generation is disabled as defense in
  depth only. Type assertions, directives and JavaScript reflection can bypass
  typing. Never run hostile code or infer that passing the gate grants permission.
- Helpers reject lexical escapes and canonical realpath escapes, including stable
  file/directory symlinks. In-root symlinks and symlinked cwd work. Final-file
  no-follow/nonblocking open prevents common replacement/FIFO mistakes. These
  checks are **not race-proof** against concurrent filesystem mutation, hard-link
  aliases, mount changes or host-code escape. Directory metadata is not a snapshot.
- Output/I/O limits bound normal helper use and returned payloads, not arbitrary
  allocations or execution. Proxy traps and hostile object inspection can still
  block serialization. No secret filtering: allowed files may contain sensitive
  data that a snippet returns to the model. Review code and workspace contents.
- No saved-function registry, scopes, arbitrary Pi-tool dispatcher, browser/CDP,
  writes, persistence, custom UI or provider calls. Every call uses a fresh VM.

## Validation and activation

```bash
# From this package; keep gate scratch under your managed TMPDIR.
npm ci
PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run check
```

The real root-owned package gate runs structure, budgets, Biome, TypeScript,
node:test and real tarball checks. Tests include child-process watchdogs to avoid
hanging the test runner while demonstrating the async CPU-loop limitation.
Private artifact checks load the unpacked entrypoint via jiti with only its
runtime compiler and host typebox linked, then exercise success and rejection.
This is **provider-free artifact evidence**, not a Pi live-session test or an npm
production-install test. See [engineering overrides](docs/engineering.local.md).

Activation is a separate owner action, not performed by package checks:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-typescript-tool
# Then /reload; run one trusted typescript fs.list call and one type-error call.
```

## Identity and provenance

Private, unpublished `0.1.0`; `releaseConfigMode: none`. No release map or
publishing approval is implied by inherited publishConfig metadata. Host baseline
remains template Pi 0.84.3 as scaffold history. Development pins follow the root
compatibility policy (currently 0.84.4); package validation reads that policy rather
than choosing a version from the installed Pi. The original port was tested on
0.84.4; that historical observation is not a minimum-version requirement.
Host peers use `*` as Pi requires, not a universal
compatibility claim. TypeScript 6.0.3 is a **runtime** dependency; typebox 1.3.7 is
host-provided, with an exact development pin and peer declaration.

Fresh Copier lineage and port deltas: [provenance](docs/project/provenance.md).
Mechanism derived from cv/pic v0.2.37, via the specified spike; original Pic
portions are Apache-2.0. Preserve [NOTICE](NOTICE), [Apache license](external/LICENSE-Apache-2.0.txt)
and the generated [LICENSE](LICENSE) rider for package-original material.
