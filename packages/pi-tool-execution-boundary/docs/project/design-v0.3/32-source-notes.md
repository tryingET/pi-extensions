## Source notes

### v0.3 additional primary anchors

- Linux Landlock userspace API: <https://docs.kernel.org/userspace-api/landlock.html>
- Linux PSI: <https://docs.kernel.org/accounting/psi.html>
- Protocol Buffers non-canonical serialization: <https://protobuf.dev/programming-guides/serialization-not-canonical/>
- RFC 8949 deterministic CBOR: <https://www.rfc-editor.org/rfc/rfc8949.html>
- SQLite pragmas and synchronous semantics: <https://sqlite.org/pragma.html>
- Firecracker design and production posture: <https://github.com/firecracker-microvm/firecracker>
- QEMU security guidance: <https://www.qemu.org/docs/master/system/security.html>
- SLSA provenance specification: <https://slsa.dev/spec/>

The design is grounded in these primary sources and specifications:

1. Linux kernel cgroup v2 documentation: recursive `cgroup.events populated`, delegation, controller hierarchy, and `cgroup.kill`.
2. Linux `clone3()` manual: `CLONE_INTO_CGROUP`, `CLONE_PIDFD`, and namespace creation.
3. Linux kernel `no_new_privs` documentation and seccomp-filter documentation.
4. Linux namespace and mount-namespace manual pages.
5. Git `git-ls-tree`, `git-cat-file`, and `git-commit-tree` plumbing documentation.
6. QEMU invocation and security documentation, including seccomp sandbox and least-privilege guidance.
7. systemd D-Bus `StartTransientUnit()` and cgroup resource-control model.
8. SQLite WAL, synchronous pragma, and atomic-commit documentation.
9. Protocol Buffers encoding documentation.
10. IETF RFC 9562 UUIDv7 specification.
11. Gondolin security, filesystem, custom-image, COW rootfs, snapshot, and limitations documentation.
12. Pi containerization documentation describing host-Pi/tool-delegation behavior and host extension trust.
13. SLSA provenance and SBOM standards used for image/artifact supply-chain evidence.

Exact source versions and URLs are recorded in the companion expert decision register and implementation evidence bundle so release evidence remains tied to the versions actually used.

---
