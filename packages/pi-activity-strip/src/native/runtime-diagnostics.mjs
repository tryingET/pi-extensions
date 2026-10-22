// ---
// summary: "read-only, allowlisted ribbon diagnostics; observations never grant input or AK authority"
// read_when:
//   - "changing ribbon build/focus/ownership explanations or their privacy boundary"
// ---

import { createHash } from "node:crypto";
import fs from "node:fs";
import { open, readlink, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PANEL_PROTOCOL } from "./panel-protocol.mjs";
import { parseProcStat } from "./recovery-proc.mjs";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
/** @param {import("node:crypto").BinaryLike} bytes */
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** @param {unknown} value */
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

// Startup source-tree observation, NOT proof of all in-memory bytes or AK custody.
function startupSourceSha256() {
  try {
    const files = ["package.json"];
    /** @param {string} relative */
    const visit = (relative) => {
      for (const entry of fs.readdirSync(path.join(packageRoot, relative), {
        withFileTypes: true,
      })) {
        const next = path.join(relative, entry.name);
        if (entry.isDirectory()) visit(next);
        else if (entry.isFile()) files.push(next);
      }
    };
    visit("src");
    return sha256(
      files
        .sort()
        .map((file) => `${file}\0${sha256(fs.readFileSync(path.join(packageRoot, file)))}\n`)
        .join(""),
    );
  } catch {
    return null;
  }
}

/** Descriptor-bound, capped, asynchronous read; FIFOs/devices cannot block the controller loop.
 * @param {string} file @param {number} cap @param {boolean} [followSymlink] */
async function boundedFile(file, cap, followSymlink = false) {
  const handle = await open(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (followSymlink ? 0 : fs.constants.O_NOFOLLOW),
  );
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > cap) throw new Error("unavailable");
    const bytes = Buffer.alloc(cap + 1);
    let length = 0;
    while (length <= cap) {
      const { bytesRead } = await handle.read(bytes, length, cap + 1 - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await handle.stat();
    if (length > cap || before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      throw new Error("changed");
    return { bytes: bytes.subarray(0, length), identity: `${after.dev}:${after.ino}` };
  } finally {
    await handle.close();
  }
}

/** Non-atomic PID observation, checked for birth/executable changes during the sample.
 * Receipt matching means integrity, NOT approval or original-child custody.
 * @param {number | null | undefined} pid @param {{procRoot?: string}} [options] */
export async function inspectPanelBuild(pid, { procRoot = "/proc" } = {}) {
  if (!Number.isSafeInteger(pid) || Number(pid) <= 0) return { state: "unavailable" };
  const base = path.join(procRoot, String(pid));
  let binarySha256;
  try {
    const birth = parseProcStat(
      (await boundedFile(path.join(base, "stat"), 8192)).bytes.toString(),
      Number(pid),
    );
    if (!birth) return { state: "unavailable" };
    const exe = path.join(base, "exe");
    const location = await readlink(exe);
    const executable = await boundedFile(exe, 16 * 1024 * 1024, true);
    binarySha256 = sha256(executable.bytes);
    let receipt;
    try {
      receipt = JSON.parse(
        (
          await boundedFile(path.join(path.dirname(location), "artifact.json"), 64 * 1024)
        ).bytes.toString(),
      );
    } catch {
      receipt = null;
    }
    const afterBirth = parseProcStat(
      (await boundedFile(path.join(base, "stat"), 8192)).bytes.toString(),
      Number(pid),
    );
    const afterExe = await stat(exe);
    if (
      birth.startTicks !== afterBirth?.startTicks ||
      (await readlink(exe)) !== location ||
      executable.identity !== `${afterExe.dev}:${afterExe.ino}`
    )
      return { state: "changed-during-observation" };
    if (!receipt)
      return { state: "unavailable", binarySha256, processStartTicks: birth.startTicks };
    const privateProtocol = Number.isSafeInteger(receipt.panelProtocol)
      ? receipt.panelProtocol
      : null;
    return {
      state:
        privateProtocol !== PANEL_PROTOCOL
          ? "incompatible"
          : receipt.schema === "pi-activity-strip-native-artifact.v1" &&
              receipt.target === "x86_64-unknown-linux-gnu" &&
              receipt.sha256 === binarySha256
            ? "receipt-matched"
            : "receipt-mismatch",
      binarySha256,
      processStartTicks: birth.startTicks,
      privateProtocol,
      receiptedSourceSha256: isHash(receipt.sourceSha256) ? receipt.sourceSha256 : null,
    };
  } catch {
    // A failed generation check must not retain a digest attributed to the wrong process.
    return { state: "unavailable" };
  }
}

/** @param {{runtimeStatus: import("../common/contracts.ts").ActivityStripRuntimeStatus;
 * projection: ReturnType<typeof import("./panel-projection.mjs").createNativePanelProjection>}} options */
export function createRuntimeStatusReader({ runtimeStatus, projection }) {
  const controllerStartupSourceSha256 = startupSourceSha256();
  /** @type {Awaited<ReturnType<typeof inspectPanelBuild>>} */
  let panelBuild = { state: "unavailable" };
  let observedPid = runtimeStatus.panelPid;
  let sampledAt = 0;
  /** @type {Promise<void> | null} */
  let pending = null;
  function refresh() {
    const pid = runtimeStatus.panelPid;
    if (pid !== observedPid) {
      observedPid = pid;
      sampledAt = 0;
      panelBuild = { state: "pending" };
    }
    if (!pending && (sampledAt === 0 || Date.now() - sampledAt >= 1000)) {
      pending = inspectPanelBuild(pid)
        .then((next) => {
          if (runtimeStatus.panelPid === pid) {
            panelBuild = next;
            sampledAt = Date.now();
          }
        })
        .finally(() => {
          pending = null;
        });
    }
  }
  return () => {
    refresh(); // async sampling only; status/keyboard event handling never waits for file I/O.
    const facts = projection.diagnostics();
    const visibilityReason =
      runtimeStatus.state !== "ready"
        ? runtimeStatus.state
        : !facts.contextValid
          ? "unproven-focus"
          : facts.focus === "non-agent"
            ? "non-agent-focus"
            : !facts.eligible
              ? "no-admitted-owner"
              : runtimeStatus.windowVisible !== true
                ? "awaiting-panel-visibility"
                : "eligible-agent-context";
    return {
      ...runtimeStatus,
      warnings: [...(runtimeStatus.warnings ?? [])],
      ribbonDiagnostics: {
        controllerStartupSourceSha256,
        expectedPrivateProtocol: PANEL_PROTOCOL,
        panelBuild: { ...panelBuild },
        panelBuildObservedAt: sampledAt || null,
        visibilityReason,
        ...facts,
        // Protocol 2 does not report native monotonic expiry. A grant is NOT capture proof.
        captureExpiry: "not-observed",
      },
    };
  };
}
