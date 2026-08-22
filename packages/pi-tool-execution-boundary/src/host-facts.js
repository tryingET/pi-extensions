import { accessSync, constants, readFileSync, statfsSync } from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

function command(args, { timeout = 2_000 } = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    timeout,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
  });
  return {
    available: result.error?.code !== "ENOENT",
    exitCode: result.status,
    stdout: String(result.stdout ?? "").trim().slice(0, 8_192),
    stderr: String(result.stderr ?? "").trim().slice(0, 8_192),
    timedOut: result.error?.code === "ETIMEDOUT",
  };
}

function readable(path) {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function writable(path) {
  try {
    accessSync(path, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function readText(path) {
  try {
    return readFileSync(path, "utf8").trim().slice(0, 16_384);
  } catch {
    return undefined;
  }
}

export function collectHostFacts({ statePath = process.cwd() } = {}) {
  const systemd = command(["systemctl", "--user", "show-environment"]);
  const qemu = command(["qemu-system-x86_64", "--version"]);
  const firecracker = command(["firecracker", "--version"]);
  const java = command(["java", "-version"]);
  const cgroupControllers = readText("/sys/fs/cgroup/cgroup.controllers");
  const cgroupKill = readable("/sys/fs/cgroup/cgroup.kill");
  const stat = statfsSync(statePath);
  const availableBytes = Number(stat.bavail) * Number(stat.bsize);

  return Object.freeze({
    schema: "pi-tool-boundary-host-facts/v1",
    collectedAt: new Date().toISOString(),
    authoritativeForRelease: false,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    kernel: os.release(),
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    kvm: {
      exists: readable("/dev/kvm"),
      userReadWrite: writable("/dev/kvm"),
    },
    cgroupV2: {
      mounted: readable("/sys/fs/cgroup/cgroup.controllers"),
      controllers: cgroupControllers?.split(/\s+/u).filter(Boolean) ?? [],
      cgroupKillAtRoot: cgroupKill,
    },
    pressureStallInformation: {
      cpu: readable("/proc/pressure/cpu"),
      memory: readable("/proc/pressure/memory"),
      io: readable("/proc/pressure/io"),
    },
    systemdUser: systemd,
    qemu,
    firecracker,
    java,
    stateFilesystem: {
      path: statePath,
      availableBytes,
    },
    limitations: [
      "This probe does not prove cgroup delegation, clone3(CLONE_INTO_CGROUP), pidfd, Landlock, QEMU device absence, or VM isolation.",
      "Release evidence must come from the owner workstation and exact selected TCB generation.",
    ],
  });
}
