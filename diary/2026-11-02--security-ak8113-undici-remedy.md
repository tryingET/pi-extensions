---
summary: "AK8113 session: triage of undici 8.10.2 and minimatch 10.2.6 in Pi, the override handed to AK7845, a rebuilt CLI candidate, and how many green results were false."
read_when:
  - "Trusting a scanner, an exit code or a sandbox for a Pi security claim."
  - "Continuing the Pi CLI rebuild or its PATH decision."
---

# AK8113: undici and minimatch remedy

The write-up is `docs/project/2026-11-02-ak8113-undici-minimatch-remedy.md`. This note keeps what the
write-up does not: how the work went wrong and what caught it.

## What surprised me

The task read as "add an npm override". The Pi CLI inlines undici in its bundle, so an override changes
`node_modules`, grype goes clean, and 8.10.2 keeps running. Upstream had also already fixed both packages on
main, unreleased, which turned the upstream report into a request for a release.

## False greens, in order

1. **Probe perturbed the program.** Importing `node:http` before the SDK made Node's undici register first,
   so I reported the host safe on Node 26. Replaying the real module order overturned it.
2. **Failed scan read as clean.** `vulnCount 0` with exit 1 meant the scan had failed on a tree without
   `node_modules`.
3. **Harness exit code.** `echo "$(date) exit=$?"` logged `date`'s status, so failing tests showed `exit=0`.
4. **Root in the sandbox.** `unshare -r` runs as UID 0, so `EACCES` tests failed for the wrong reason.
5. **"0 external undici".** True for the CLI alone. With the fleet, 32 packages' SDK links load 8.10.2.
6. **"No network".** DNS escapes `unshare -n` and `bwrap --unshare-net` through the systemd-resolved socket.

Numbers 5 and 6 came from an independent inspector, which is why it was worth a second one. Each green only
became trustworthy once a positive control could fail it: the broken extension for the fleet smoke, stock
asserts for the assert count, 1 npm dispatch for the transport probe.

## Boundaries I crossed

A `git fetch --dry-run` in `contrib/pi-mono` reached github.com, and test runs looked up OpenRouter through
the DNS leak. Neither was authorized, neither changed anything, and both are on record in AK.

## Handed on

- AK7845 holds the override, applied at `420f4ed2c`, unlanded.
- AK8149: host transport hardening. AK8182: the DNS leak, a workstation decision.
- The operator sends the private report personally.
- AK8113 stays open: the live CLI is still exposed until a candidate clears the blockers in the write-up.
