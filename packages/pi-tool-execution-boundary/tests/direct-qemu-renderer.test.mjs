import test from "node:test";
import assert from "node:assert/strict";
import { normalizePolicy } from "../src/policy.js";
import { compileSemanticPlan } from "../src/plan.js";
import { renderDirectQemuCandidate } from "../src/direct-qemu-renderer.js";

const plan = compileSemanticPlan(normalizePolicy());
const rendered = renderDirectQemuCandidate(plan, {
  qemuBinary: "/usr/bin/qemu-system-x86_64",
  kernel: "/var/lib/pi-boundary/kernel",
  initramfs: "/var/lib/pi-boundary/initramfs",
  rootDisk: "/var/lib/pi-boundary/root.raw",
  workspaceDisk: "/var/lib/pi-boundary/workspace.qcow2",
  controlSocket: "/run/user/1000/pi-boundary/control.sock",
  qmpSocket: "/run/user/1000/pi-boundary/qmp.sock",
});

test("direct-QEMU candidate has no network or host filesystem arguments", () => {
  const text = rendered.argv.join(" ");
  assert.equal(/-netdev|-nic|virtiofs|9p|usb-host|vfio|pulseaudio|spice/iu.test(text), false);
  assert.match(text, /sandbox on,obsolete=deny/);
  assert.equal(rendered.exactControls.rootDiskReadOnly, true);
  assert.equal(rendered.exactControls.workspaceFormat, "qcow2");
  assert.match(rendered.renderedPlanDigest, /^[a-f0-9]{64}$/);
});

test("renderer rejects relative artifact paths", () => {
  assert.throws(() => renderDirectQemuCandidate(plan, { qemuBinary: "qemu" }), /absolute path/);
});
