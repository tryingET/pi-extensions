import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const brokerScript = fileURLToPath(new URL("../runtime/protocol-broker.mjs", import.meta.url));

function waitForClose(child: ReturnType<typeof spawn>): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Protocol broker did not exit within the test timeout."));
    }, 5_000);
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code });
    });
  });
}

test("protocol broker isolates a newline-free worker flood from the host", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pi-code-mode-broker-flood-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workerScript = path.join(directory, "flood-worker.mjs");
  await writeFile(
    workerScript,
    'import { writeSync } from "node:fs"; writeSync(3, Buffer.alloc(64 * 1024 * 1024, "x")); setTimeout(() => {}, 5_000);\n',
  );

  const broker = spawn(process.execPath, [
    brokerScript,
    process.execPath,
    JSON.stringify([workerScript]),
  ]);
  broker.stdin.end();
  let output = Buffer.alloc(0);
  broker.stdout.on("data", (chunk: Buffer) => {
    output = Buffer.concat([output, chunk]);
  });

  const { code } = await waitForClose(broker);
  assert.equal(code, 1);
  assert.ok(output.length < 4_096, `broker forwarded ${output.length} bytes`);
  assert.deepEqual(JSON.parse(output.toString("utf8")), {
    type: "protocol_error",
    error: "Kernel-to-host protocol frame exceeded the limit.",
  });
});

test(
  "protocol broker escalates termination for the worker process group",
  { skip: process.platform === "win32" },
  async (t) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pi-code-mode-broker-kill-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const marker = path.join(directory, "late-marker.txt");
    const workerScript = path.join(directory, "worker.mjs");
    const grandchild = `process.on("SIGTERM", () => {}); setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "late"), 1_000);`;
    await writeFile(
      workerScript,
      `import { spawn } from "node:child_process";\nspawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: "ignore" });\nsetTimeout(() => {}, 5_000);\n`,
    );

    const broker = spawn(process.execPath, [
      brokerScript,
      process.execPath,
      JSON.stringify([workerScript]),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    broker.kill("SIGTERM");
    const { code } = await waitForClose(broker);
    assert.equal(code, 1);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await assert.rejects(access(marker));
  },
);
