---
summary: "The two-layer closure of the Pi task-session runtime: what the committed lock proves, what it does not, and how to update it."
read_when:
  - "Installing the task-session host, or moving its SDK."
  - "Refreshing the third-party closure, or asking what the lock guarantees."
system4d:
  container: "The committed lock and own tarballs that make up one task-session runtime."
  compass: "Install exactly what a person committed, with no resolution and no network at install time."
  engine: "Update the lock as a reviewed step -> fetch once by integrity -> pack own code at the commit -> install with the network unshared -> verify."
  fog: "A lock is easy to mistake for a trust decision; it only fixes which bytes are installed."
---

# Task-session runtime closure

[`scripts/task-session-install.mjs`](../scripts/task-session-install.mjs) builds a runtime from two
layers. Nothing in it resolves a version.

1. **Third-party and SDK packages** come from [`runtime.lock`](runtime.lock), with its root manifest in
   [`runtime-package.json`](runtime-package.json). They are not named `package-lock.json` and
   `package.json` so the monorepo does not treat this directory as a package.
2. **Own packages** are packed at the checked-out commit and added offline. The set is every
   `@tryinget` package `pi-little-helpers` and `pi-society-orchestrator` reach. The lock must hold none
   of them, and an install refuses one that resolves from the registry.

One `npm ci` from the lock fills a private cache. Packing and installing then run under `unshare -rn`
with `--offline`, so a missing tarball fails the install; a flag alone would not stop a fetch. Every
package npm recorded as installed is then compared with the lock by version and integrity, and every own
package with the tarball packed for this install. That compares npm's record, which it writes as it checks
integrity on extraction; it does not re-read installed files. `assertSdkIdentity` is what hashes bytes on
disk, and only for the four SDK packages.

Run it from a clean linked worktree, on the Node pinned in `policy/ci-toolchain-lock.json`, with that Node
first on `PATH`. Packing rewrites each manifest during `prepack`, so the installer and pack-proof refuse
the canonical checkout, which live Pi sessions load from. `--root` and `--bin-dir` are both required, and
naming the live host's paths is an AK D151 rebinding. Launchers name the exact Node that installed them,
so moving the pin means reinstalling. A `--lock-dir` outside the commit counts as dirty.

## What the lock proves

The lock gives **reproducibility, not trust**. Its sha512 values come from the registry at the moment
the lock was written, which is trust on first use. It proves a later install gets the same bytes as
that moment. It does not prove those bytes were good, who published them, or that they have no known
vulnerability. A frozen lock also ages: advisories published afterwards still apply to it.

## Update path

```bash
node task-session-runtime/update-lock.mjs
```

This is the only step that resolves anything. It seeds from the tracked `package-lock.json`, prints every
version change, and refuses a lock with an own package, a non-registry source, a missing integrity, a
drifted `@earendil-works` package or a stale override. Inspect the printed changes and the diff, then
commit.

When the SDK moves, change these together:

- `SDK_VERSION` in [`closure.mjs`](closure.mjs) and the pins in `runtime-package.json`.
- The hashes in `src/task-session/identity.ts`.
- `overrides` in `runtime-package.json`. An override holds a version down as well as up, so
  `update-lock.mjs` refuses one that an exact pin has moved past. Remove it once the SDK catches up.
- This lock, through the command above.

A new runtime directory results, keyed by the host build digest and the closure digest. Earlier runtimes
are kept, and a closure-only change gets its own directory rather than being dropped.

## The undici override

The SDK pins `undici` 8.10.2 exactly, and that version is the host's transport on every supported Node.
`overrides` moves the runtime to 8.12.3, which has the fixes (AK8113). Three limits follow:

- Only the installed runtime has it. The tracked `package-lock.json` keeps the SDK's 8.10.2, so the unit
  suites run on the old transport, and pack-proof stubs the send.
- `host_build_digest` does not change. Compare `closure_digest` to tell a fixed runtime from a vulnerable
  one. That digest attests the closure npm recorded, so read the installed `undici` version to be sure.
- `npm ci` needs both the override and this lock, because the SDK's exact pin rejects the lock alone.
