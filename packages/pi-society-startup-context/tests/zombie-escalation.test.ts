import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCommand } from "../src/command-runner.ts";

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// Independent PID/start/state oracle: deliberately not the runner's proc helpers.
function identity(pid: number) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return { start: fields[19], state: fields[0] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
const live = (pid: number, start: string) => {
  const value = identity(pid);
  return value?.start === start && !["Z", "X"].includes(value.state);
};

for (const denyKill of [false, true]) {
  test(
    `matching zombie-only censuses with a live fork/exit descendant require guarded KILL (${denyKill ? "ownership unavailable: retain" : "escalate"})`,
    { skip: process.platform !== "linux" },
    async () => {
      const root = mkdtempSync(join(tmpdir(), "society-zombie-subset-"));
      const ready = join(root, "ready");
      const release = join(root, "release");
      const term = join(root, "term");
      let member: { pid: number; start: string; group: number; session: number } | undefined;
      let pending: ReturnType<typeof runCommand> | undefined;
      let scans = 0;
      let observedGroup: number | undefined;
      try {
        const leaf = `const fs=require('fs');process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(term)},'term'));const f=fs.readFileSync('/proc/self/stat','utf8');const s=f.slice(f.lastIndexOf(')')+2).split(' ');fs.writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid,start:s[19],group:Number(s[2]),session:Number(s[3])}));setInterval(()=>{},1000)`;
        const relay = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:'ignore'});process.exit(0)`;
        const leader = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(relay)}],{stdio:'ignore'});const t=setInterval(()=>{if(require('fs').existsSync(${JSON.stringify(release)})){clearInterval(t);process.exit(0)}},5)`;
        pending = runCommand(process.execPath, ["-e", leader], {
          timeoutMs: 3_000,
          scanGroup: (group, start) => {
            observedGroup = group;
            scans++;
            if (denyKill && existsSync(term)) throw new Error("ownership unavailable before KILL");
            assert.ok(start);
            // Controlled scanner negative control: same zombie subset, hiding the independently live leaf.
            return [
              {
                pid: group,
                group,
                session: group,
                start,
                state: "Z",
                uid: process.getuid?.() || 0,
              },
            ];
          },
        });
        for (let i = 0; i < 100 && !existsSync(ready); i++) await pause(25);
        assert.ok(existsSync(ready));
        member = JSON.parse(readFileSync(ready, "utf8"));
        assert.ok(member && live(member.pid, member.start));
        assert.equal(member.group, member.session);
        writeFileSync(release, "exit leader now");
        const result = await pending;
        assert.ok(scans > 0);
        assert.equal(
          observedGroup,
          member.group,
          "known live leaf belongs to the actual owned group",
        );
        assert.ok(existsSync(term), "zombie-only subset must not bypass TERM/KILL");
        if (denyKill) {
          assert.equal(result.reason, "cleanup_failure");
          assert.equal(result.cleanup, "failed");
          assert.ok(result.unresolvedResource);
          assert.equal(result.unresolvedResource.isSettled(), false);
          assert.equal(
            live(member.pid, member.start),
            true,
            "unproven KILL must not report settlement of the known live reader",
          );
        } else {
          assert.equal(result.cleanup, "settled");
          assert.equal(result.ok, true);
          for (let i = 0; i < 100 && live(member.pid, member.start); i++) await pause(20);
          assert.equal(
            live(member.pid, member.start),
            false,
            "TERM-ignoring PID/start must terminate under actual SIGKILL",
          );
        }
      } finally {
        if (member && live(member.pid, member.start)) process.kill(member.pid, "SIGKILL");
        const receipt = await pending;
        if (member) {
          for (let i = 0; i < 100 && live(member.pid, member.start); i++) await pause(20);
          assert.equal(
            live(member.pid, member.start),
            false,
            "fixture must be inactive before scratch removal",
          );
        } else {
          assert.ok(
            !receipt || receipt.cleanup !== "failed",
            "unknown fixture ownership: retain scratch",
          );
        }
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
}
