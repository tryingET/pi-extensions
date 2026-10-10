---
summary: "AK6872 native dependency-closure trust contract, native process boundary and the real TLS/cancellation/outbound harness that proves them."
task_id: 6872
read_when:
  - "Changing native artifact admission, the native child process boundary or transport cancellation."
  - "Provisioning a native Clipper engine that must pass closure admission."
---

# AK6872 native closure contract and real transport/process harness

Status: **approved and implemented; task completion is the operator's decision.**
On 2026-10-10 the receiver and accountable owner (tryingET) approved C1–C5 as written,
the hybrid network option and the additive `engine.boundary` result metadata in a
native interview, before admission behaviour changed. AK task/deferral state and
evidence, not this projection, are canonical.

## Threat being closed

Before this change only the ancestry of `dist/cli.cjs` was checked. The CLI loads an
external production closure (`linkedom` and others under `<root>/node_modules`), so a
group/world-writable or redirected dependency, or a module found in an ancestor
`node_modules` outside the artifact, could execute with Pi's privileges. The child also
had unrestricted outbound network, child-process and filesystem access.

## Contract

Implementation: `src/closure.ts` (admission and permission arguments),
`src/native-guard.cjs` (C5 guard), `src/native.ts` (preflight before transport,
re-admission immediately before every spawn).

**C1 Layout.** The configured CLI (`PI_OBSIDIAN_CLIPPER_CLI` or the default) is an
absolute path named `cli.cjs` whose realpath is `<R>/dist/cli.cjs`; `<R>/package.json`
is a regular file. `<R>` is the closure root. `<R>` and the private work directory must
not contain `,`, `*` or control characters (permission-flag safety).

**C2 Ancestry (unchanged).** Every directory from `<R>` up to `/` is owned by root or the
current uid and is not group/world-writable.

**C3 Closure walk, before every spawn.** `lstat` every entry under `<R>` without following
links. Allowed: directories, regular files, symlinks. Owner root or current uid; no
group/world write bit on files or directories. Each symlink's realpath must exist and be
`<R>` or inside `<R>`. Budgets: at most 50,000 entries and depth 64. Any violation fails
closed before spawning, with an error naming the closure. The installed engine
(7,811 entries, 3 in-root `.bin` links) walks in about 0.12 s.

**C4 Runtime permission boundary, every spawn.**
`node --permission --allow-fs-read=<R> --allow-fs-read=<private dir> --allow-fs-read=<guard>
--require <guard> <R>/dist/cli.cjs URL --template … --html …`. No `--allow-fs-write`,
`--allow-child-process`, `--allow-worker`, `--allow-addons`, `--allow-wasi`; no
`--allow-net` where it exists. A runtime without `--permission` fails closed. Effect:
modules and files outside `<R>` (including ancestor `node_modules` and user files) are
unreadable; child processes, workers, addons and `process.binding` are denied.

**C5 Network.** On Node with `--allow-net` support (≥25; the current Pi runtime is
26.9.0) the runtime permission model denies TCP, UDP, Unix sockets, listening, DNS and
`fetch`. On Node without it (22–24, including the pinned gate Node 22.23.3) an
adapter-owned preload guard locks the public Node network entry points it enumerates
(`net` connect/listen and server handles, the `dgram` socket constructor and methods,
`tls`, `http`/`https`/`http2`, `dns`, `fetch`, `WebSocket`, inspector). That guard is
a deny-list: in-process, not kernel-enforced, and it may miss an unenumerated path; C4
removes the obvious bypasses (bindings, child processes, workers, addons). The tests
prove denial only for the probes they run (listed below). Result metadata states which
mechanism applied and `osSandbox: false`.

**C6 Unchanged.** Environment stripping, 0600/0700 private inputs, output/stderr/line
budgets, 30 s deadline, SIGKILL on abort, no save, URL/DNS/all-address/redirect/TLS rules
and inactive module load stay as they are; no test thresholds are weakened.

## Remaining assumptions (not closed by this contract)

- Same-UID code can change the closure between check and spawn (TOCTOU) or change the
  adapter itself; root is trusted.
- Node's permission model is a "seat belt" for trusted code (Node documentation), not
  protection against deliberately malicious code; nothing here is an OS sandbox.
- The native child can still signal processes of the same user, including Pi
  (`process.kill`), on both runtimes; the permission model does not cover signals.
- C4 grants read access by path: a hard link inside `<R>` to a file elsewhere is
  admitted and readable. Planting one requires the same UID (first assumption).
- Foreign-owner rejection is implemented but not causally tested (needs `chown`/root).
- A peer that closes a close-delimited HTTP/1.1 body early is indistinguishable from a
  complete response; length/chunk truncation is detected and rejected.

## Harness

All fixtures are test-owned and loopback-only; certificates are generated per run by the
`openssl` CLI (a declared prerequisite, not skipped) into private `.scratch/tests`.

- `tests/real-transport.test.ts` + `tests/tls-fixture.ts`: real TLS through the adapter's
  own `https.request` options; only the already-pinned public address is redirected to a
  loopback port. Control (trusted CA, right host) succeeds; self-signed is rejected with
  `NODE_TLS_REJECT_UNAUTHORIZED=0`; CA-trusted wrong-host is rejected; stalled handshake,
  stalled headers/body (deadline and parent abort) and peer-interrupted length/chunked
  bodies reject and release client and server sockets.
- `tests/native-boundary.test.ts` + `tests/native-fixture.ts`: unsafe closure fixtures
  through `extract()`; a probe CLI tries TCP, TLS, HTTP, `fetch`, UDP (socket API and a
  raw handle from the `dgram.Socket` constructor), listen/`_listen2`, a Unix socket, DNS,
  a child process and outside read/write while loopback observers count arrivals. A direct run of the same
  probe is the causal control (observers must see it).

Pre-change results (Node 22.23.3 and 26.9.0): real-transport 10/10 pass against the
existing transport; mutations `rejectUnauthorized:false`, no-op `checkServerIdentity`,
dropped request `signal` and resolve-partial-on-close each turn the matching tests red.
Native boundary: 1/8 pass (in-root control); all six closure cases are admitted and the
adapter-run probe reached the observers (4 TCP, 1 UDP).

Post-change results: package suite green on Node 22.23.3 (gate) and 26.9.0; native
boundary 10/10, including independent tests of each denial mechanism (guard alone;
permission model alone, which on Node 22 is shown *not* to deny network) and a fixture
extraction through the packaged tarball under the real host loader. Mutations that drop
the permission arguments, allow escaping symlinks, skip the write-bit check, skip the
guard on Node 22 or allow special files each turn the matching tests red. The installed
engine (`6d56d618-afa7c192`) passes admission and the native smoke (114 body bytes) on
both Node versions.

Independent review (read-only reviewer, before landing) found a Node 22 guard bypass:
`new dgram.Socket()` creates a native UDP handle whose raw `send` reached a loopback
observer. Node 26 denied it. The guard now locks the `dgram.Socket` constructor,
`_createSocketHandle`, `_createServerHandle` and `Server#_listen2`; the probe covers
the raw-handle path, listen and Unix sockets, and removing the constructor lock turns
both network tests red on Node 22. C1 is now also checked on the CLI realpath's file
name. Signals and hard links were added to the remaining assumptions above.
