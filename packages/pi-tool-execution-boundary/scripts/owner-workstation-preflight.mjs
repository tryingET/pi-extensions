import { collectHostFacts } from "../src/host-facts.js";

const facts = collectHostFacts({ statePath: process.cwd() });
const checks = [
  ["linux host", facts.platform === "linux"],
  ["x86_64 host", facts.arch === "x64"],
  ["/dev/kvm read-write", facts.kvm.exists && facts.kvm.userReadWrite],
  ["cgroup v2", facts.cgroupV2.mounted],
  ["cpu PSI", facts.pressureStallInformation.cpu],
  ["memory PSI", facts.pressureStallInformation.memory],
  ["I/O PSI", facts.pressureStallInformation.io],
  ["systemd user manager", facts.systemdUser.available && facts.systemdUser.exitCode === 0],
  ["QEMU x86_64", facts.qemu.available && facts.qemu.exitCode === 0],
  ["minimum 24 GiB free", facts.stateFilesystem.availableBytes >= 24 * 1024 ** 3],
];
const report = {
  schema: "pi-tool-boundary-owner-preflight/v1",
  collectedAt: facts.collectedAt,
  checks: checks.map(([name, passed]) => ({ name, passed: Boolean(passed) })),
  facts,
  passed: checks.every(([, passed]) => passed),
  limitations: [
    "This preflight does not select a backend or prove isolation.",
    "clone3, pidfd, cgroup delegation, Landlock, device inventory, boot identity, cleanup, and voice coexistence require later canaries.",
  ],
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
