## 30. Residual risks after closure

Even a fully conforming Release 0.1 retains:

- QEMU/KVM and guest-kernel escape risk;
- malicious or compromised trusted host/extension risk;
- same-user host attacker risk;
- timing/cache side channels;
- remote LLM data exposure when a remote model is selected;
- operator error when manually applying exported changes;
- denial of service within configured caps;
- compatibility limitations from clean-Git and offline-only scope;
- supply-chain risk in pinned components despite provenance;
- filesystem and hardware behavior outside documented assumptions.

These are disclosed, monitored, and not hidden behind a general `secure` label.

---
