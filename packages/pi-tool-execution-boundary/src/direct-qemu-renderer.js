import path from "node:path";
import { domainSeparatedDigest } from "./canonical-cbor.js";
import { BoundaryError } from "./errors.js";
import { SEMANTIC_PLAN_SCHEMA } from "./plan.js";
import { deepFreeze } from "./util.js";

function absolute(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0")) {
    throw new BoundaryError("INVALID_RENDER_PATH", `${label} must be an absolute path`);
  }
  return value;
}

export function renderDirectQemuCandidate(plan, artifacts) {
  if (!plan || plan.schema !== SEMANTIC_PLAN_SCHEMA) {
    throw new BoundaryError("INVALID_SEMANTIC_PLAN", "A semantic micro-VM plan is required");
  }
  const qemuBinary = absolute(artifacts.qemuBinary, "qemuBinary");
  const kernel = absolute(artifacts.kernel, "kernel");
  const initramfs = absolute(artifacts.initramfs, "initramfs");
  const rootDisk = absolute(artifacts.rootDisk, "rootDisk");
  const workspaceDisk = absolute(artifacts.workspaceDisk, "workspaceDisk");
  const controlSocket = absolute(artifacts.controlSocket, "controlSocket");
  const qmpSocket = absolute(artifacts.qmpSocket, "qmpSocket");

  const argv = Object.freeze([
    qemuBinary,
    "-nodefaults",
    "-no-user-config",
    "-display",
    "none",
    "-machine",
    "microvm,accel=kvm,usb=off,pit=off,pic=off,rtc=off",
    "-cpu",
    "host",
    "-smp",
    String(plan.resources.vcpus),
    "-m",
    String(Math.floor(plan.resources.memoryBytes / 1_048_576)),
    "-kernel",
    kernel,
    "-initrd",
    initramfs,
    "-append",
    "console=hvc0 panic=1 reboot=t quiet random.trust_cpu=on",
    "-drive",
    `if=none,id=root,format=raw,readonly=on,file=${rootDisk}`,
    "-device",
    "virtio-blk-device,drive=root",
    "-drive",
    `if=none,id=workspace,format=qcow2,cache=none,aio=native,file=${workspaceDisk}`,
    "-device",
    "virtio-blk-device,drive=workspace",
    "-device",
    "virtio-serial-device",
    "-chardev",
    `socket,id=boundary-control,path=${controlSocket},server=on,wait=off`,
    "-device",
    "virtserialport,chardev=boundary-control,name=pi.boundary.control",
    "-qmp",
    `unix:${qmpSocket},server=on,wait=off`,
    "-sandbox",
    "on,obsolete=deny,elevateprivileges=deny,spawn=deny,resourcecontrol=deny",
    "-no-reboot",
  ]);

  // A production renderer must keep these absences explicit. In particular,
  // there is no -netdev/-nic, virtiofs, 9p, USB, GPU, audio, or host socket mount.
  const exactControls = deepFreeze({
    networkDevices: [],
    hostFilesystemDevices: [],
    passthroughDevices: [],
    rootDiskReadOnly: true,
    workspaceFormat: "qcow2",
    qemuSandbox: true,
    qmpSocket,
    controlSocket,
  });

  const renderedBody = {
    1: plan.semanticPlanDigest,
    2: "direct-qemu-candidate",
    3: argv,
    4: {
      1: exactControls.rootDiskReadOnly,
      2: exactControls.workspaceFormat,
      3: exactControls.qemuSandbox,
      4: exactControls.networkDevices,
      5: exactControls.hostFilesystemDevices,
      6: exactControls.passthroughDevices,
    },
  };

  return deepFreeze({
    schema: "pi-tool-boundary-rendered-backend-plan/v1",
    candidateOnly: true,
    backendId: "direct-qemu-candidate",
    semanticPlanDigest: plan.semanticPlanDigest,
    argv,
    exactControls,
    renderedPlanDigest: domainSeparatedDigest(
      "pi-tool-boundary/rendered-backend-plan/v1",
      renderedBody,
    ),
  });
}
