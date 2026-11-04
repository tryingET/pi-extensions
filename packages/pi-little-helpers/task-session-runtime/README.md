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

One `npm ci` from the lock fills a private cache. Every npm call sees only the public registry, with
`--replace-registry-host=never`, no inherited `npm_config_*`, user or global npmrc, update check,
`NODE_OPTIONS`, `NODE_PATH`, `NODE_ENV` or `PREFIX` in any letter case, so an inherited mirror or preload cannot move the
fetch or the build. A CA comes from `NODE_EXTRA_CA_CERTS`. No proxy is used: npm connects directly, since
through a proxy the guard below would see only the proxy, and `git` is disabled.
npm still reads a project `.npmrc`: the fetch runs in an empty directory, and in an own package one must
be committed, since an untracked one makes the source dirty. Configuration does not stop npm following a
redirect, so the two online steps preload [`egress-guard.cjs`](egress-guard.cjs), which refuses any TCP
connection except to registry.npmjs.org. Packing and installing then run under `unshare -rn`
with `--offline`, so a missing tarball fails the install; a flag alone would not stop a fetch. Every
package npm recorded as installed is then compared with the lock by name, version, tarball URL and
integrity, and every own package with the tarball packed for this install. A lock entry must be its own
registry tarball under its own name, so an npm alias cannot smuggle a package in under another name.
That comparison reads npm's record. The bytes on disk are bound by a digest of the whole installed tree,
covering file contents, modes and link targets, and by `assertSdkIdentity` for the four SDK packages.

Packing refuses any ignored file in an own package except `node_modules/`, `dist/` and `.tmp*` test
scratch, because the clean check cannot see ignored files and a build may read them. Each package's
`dist/` is then cleared just before it is packed, so built output can only come from this build, and
every packed file must be tracked at the commit or lie under `dist/`. Tracked files are compared with
`HEAD` by their own bytes, type and mode, hashed here rather than through `git status` or git's filters,
so an edit hidden by `--assume-unchanged`, `--skip-worktree` or an end-of-line conversion still counts
as dirty. Every git call runs without inherited `GIT_*` variables and with `GIT_NO_REPLACE_OBJECTS=1`, so
no other repository, index or replacement tree can stand in for the recorded commit. npm packs a file's
mode after adding owner read-write and dropping group and other write, and that must give 644 or 755:
664 passes, 600, 654 or a setuid, setgid or sticky bit does not; restore a drifted one with `chmod`. The installer runs with umask 022, so
the `package.json` prepack restores keeps its mode even under a stricter caller, such as heavy-job's 077.

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
drifted `@earendil-works` package or a stale override. The new lock replaces the old one by rename, so
an interrupted update leaves the reviewed lock whole. Inspect the printed changes and the diff, then
commit.

When the SDK moves, change these together:

- `SDK_VERSION` in [`closure.mjs`](closure.mjs) and the pins in `runtime-package.json`.
- The hashes in `src/task-session/identity.ts`.
- `overrides` in `runtime-package.json`. An override holds a version down as well as up, so
  `update-lock.mjs` and the installer refuse one that an exact pin has moved past, in the lock or in a
  packed own package. Remove it once the SDK catches up.
- This lock, through the command above.

A new runtime directory results, keyed by the host build digest and the closure digest. Earlier runtimes
are kept, and a closure-only change gets its own directory rather than being dropped.

Installing the same closure again reuses its directory only if the tree on disk still equals the one
this install built, the runtime directory and its `node_modules` keep the fresh build's type and mode,
and the host's own identity checks pass. Otherwise the verified tree takes the
directory's place in one atomic exchange (`exch`, util-linux 2.40 or later, the package that also
provides `unshare`), so a launcher sees the old tree or the new one and never a missing directory, and
the next install of the closure finds it. The old tree is then set aside as `<runtime>.damaged-<ms>`,
never deleted; if the process stops between the two steps, or `exch` fails, it stays under
`runtime/.staging-*`, whichever tree that holds, and the refusal names it.
`tree_sha256` in `closure.json` records the digest as a receipt; reuse recomputes it from disk instead
of trusting it.

## What packing does not prove

Packing runs in the working tree, not an immutable export. Two things therefore stay unverified: a tool
under `node_modules` changed after it was installed, and a checkout that changes during packing and is
back where it started by the end. Packing from an export of the commit with its own locked installs
would close both.

## The undici override

The SDK pins `undici` 8.10.2 exactly, and that version is the host's transport on every supported Node.
`overrides` moves the runtime to 8.12.3, which has the fixes (AK8113). Three limits follow:

- Only the installed runtime has it. The tracked `package-lock.json` keeps the SDK's 8.10.2, so the unit
  suites run on the old transport, and pack-proof stubs the send.
- `host_build_digest` does not change. Compare `closure_digest` to tell a fixed runtime from a vulnerable
  one. That digest attests the closure npm recorded, so read the installed `undici` version to be sure.
- `npm ci` needs both the override and this lock, because the SDK's exact pin rejects the lock alone.
