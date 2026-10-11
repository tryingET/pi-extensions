// AK6999 host-only interruption proof for the private proof-process group. No production
// native engine or network; only an inert Node child and a user-namespace sleep descendant.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fixture } from "../tests/helpers.ts";
import { runOwnerProof } from "./owner-proof-process.ts";

assert.equal(process.platform, "linux");
const f = await fixture();
const controller = new AbortController();
let pending: Promise<{ rejected: boolean }> | undefined;
try {
  const control = await runOwnerProof(process.execPath, ["-e", "console.log('control')"], f.dir);
  assert.equal(control.stdout.trim(), "control");
  const ready = join(f.dir, "ready");
  const code = `
    const fs=require('node:fs'); const {spawn}=require('node:child_process');
    const child=spawn('unshare',['--user','--map-root-user','sh','-c',
      'printf "%s" "$$" > "$1"; exec sleep 60','sh',${JSON.stringify(ready)}],{stdio:'inherit'});
    fs.writeFileSync(${JSON.stringify(join(f.dir, "parent"))},String(process.pid));
    child.on('error',()=>process.exit(11)); child.on('exit',()=>process.exit(12));
    setInterval(()=>{},1000);
  `;
  // Attach the rejection handler immediately while readiness is checked (no unhandled rejection).
  pending = runOwnerProof(process.execPath, ["-e", code], f.dir, controller.signal).then(
    () => ({ rejected: false }),
    () => ({ rejected: true }),
  );
  let descendant = 0;
  for (let i = 0; i < 500 && !descendant; i++) {
    try {
      descendant = Number(await readFile(ready, "utf8"));
    } catch {
      await sleep(10);
    }
  }
  assert.ok(descendant > 0, "Unprivileged namespace descendant did not become ready");
  const parent = Number(await readFile(join(f.dir, "parent"), "utf8"));
  assert.ok(parent > 0 && parent !== descendant);
  process.kill(parent, 0);
  process.kill(descendant, 0);
  const groupOf = async (pid: number) => {
    const text = await readFile(`/proc/${pid}/stat`, "utf8");
    return Number(text.slice(text.lastIndexOf(")") + 2).split(" ")[2]);
  };
  assert.equal(await groupOf(parent), parent, "Proof child lacks its own process group");
  assert.equal(await groupOf(descendant), parent, "Fixture descendant left the owned group");
  const started = Date.now();
  controller.abort();
  assert.equal((await pending).rejected, true);
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      return false;
    }
  };
  for (let i = 0; i < 500 && (alive(parent) || alive(descendant)); i++) await sleep(10);
  assert.equal(alive(parent), false, "Proof child still exists after abort");
  assert.equal(alive(descendant), false, "Namespace descendant still exists after abort");
  const cleanupMs = Date.now() - started;
  assert.ok(cleanupMs < 5000, "Cleanup must not wait for the 60s sleeper's natural exit");
  console.log(
    JSON.stringify({
      processProofPassed: true,
      node: process.versions.node,
      childGone: true,
      descendantGone: true,
      cleanupMs,
    }),
  );
} finally {
  controller.abort();
  await pending;
  await f.dispose();
}
