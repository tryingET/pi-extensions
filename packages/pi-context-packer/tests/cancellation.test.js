/**
summary: "Verify context-packet cancellation reaches docs-provider subprocesses."
read_when:
  - "You change abort-signal propagation through context planning or docs discovery."
*/

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket } from "../src/context-pack.js";

const makeWorkspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-pack-cancel-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n", "utf8");
  return root;
};

test("context_pack propagates cancellation into docs provider subprocesses", async () => {
  const root = await makeWorkspace();
  const docsListScript = join(root, "docs-list.mjs");
  await writeFile(
    docsListScript,
    "// fake executable resolved by the injected subprocess adapter\n",
  );
  const controller = new AbortController();
  let subprocessSignal;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const execFileAsync = (_command, _args, options) => {
    subprocessSignal = options.signal;
    markStarted();
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    });
  };

  const packet = buildContextPacket(
    {
      objective: "Discover docs for cancellation behavior",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off", session: "off" },
    },
    { cwd: root, docsListScript, execFileAsync, signal: controller.signal },
  );

  await started;
  assert.equal(subprocessSignal, controller.signal);
  controller.abort(new DOMException("operator cancelled", "AbortError"));
  await assert.rejects(packet, { name: "AbortError" });
});
