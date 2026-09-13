// summary: correlate a real Fleet Phase-3 launch receipt with a live TUI process, clean session, ACK and final.
// read_when:
//   - verifying the standing-agent Ghostty path after an explicitly supervised dogfood (never launches or retries).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(",")}}`;
}

test("standing-agent receipt matches a real clean Ghostty TUI with first-action ACK and final", (t) => {
  const receiptPath = process.env.PI_STANDING_AGENT_LIVE_RECEIPT;
  const sessionFile = process.env.PI_STANDING_AGENT_LIVE_SESSION;
  if (!receiptPath && !sessionFile) {
    t.skip(
      "set PI_STANDING_AGENT_LIVE_RECEIPT and PI_STANDING_AGENT_LIVE_SESSION after supervised dogfood; this test never launches",
    );
    return;
  }
  assert.ok(receiptPath && sessionFile && process.env.XDG_RUNTIME_DIR && process.env.NIRI_SOCKET);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const { receiptSha256, ...facts } = receipt;
  assert.equal(digest(canonical(facts)), receiptSha256);
  assert.equal(receipt.phase, "fleet_phase_3");
  assert.equal(receipt.transport.launchMode, "tab");
  assert.equal(receipt.launch.admission, "transport_admitted");
  assert.equal(
    receipt.launch.ack,
    "unproven",
    "immutable admission must not retroactively claim ACK",
  );
  assert.ok(
    Object.entries(receipt.observation)
      .filter(([k]) => k.endsWith("Stable"))
      .every(([, v]) => v === true),
  );

  // JSONL is interpreted only through jq. This is a fresh, linear dogfood session, not a general context reconstructor.
  const session = JSON.parse(
    execFileSync(
      "jq",
      [
        "-s",
        `
    def texts: if type=="string" then . else map(select(.type=="text")|.text)|join("\\n") end;
    {header: .[0],
     duplicateIds: ([.[1:][]|.id]|group_by(.)|map(select(length>1))),
     linear: (.[1:] as $e | all(range(0;($e|length)); . as $i | $e[$i].parentId == (if $i==0 then null else $e[$i-1].id end))),
     forks: [.[] | select(.type=="compaction" or .type=="branch_summary")],
     users: [.[]|select(.type=="message" and .message.role=="user")|.message.content|texts],
     models: [.[]|select(.type=="model_change")|{provider,modelId}],
     thinking: [.[]|select(.type=="thinking_level_change")|.thinkingLevel],
     calls: [.[]|select(.type=="message" and .message.role=="assistant")|.message.content[]?|select(.type=="toolCall")|{id,name,arguments}],
     results: [.[]|select(.message.role=="toolResult")|{id:.message.toolCallId,error:.message.isError}],
     lastStop: ([.[]|select(.message.role=="assistant")|.message.stopReason]|last)}
  `,
        sessionFile,
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    ),
  );
  assert.equal(session.header.parentSession, undefined);
  assert.deepEqual(session.duplicateIds, []);
  assert.equal(
    session.linear,
    true,
    "fresh dogfood must have a unique ordered parent chain, not branches/cycles",
  );
  assert.deepEqual(session.forks, []);
  assert.equal(session.users.length, 1);
  assert.equal(digest(session.users[0]), receipt.launch.promptSha256);
  assert.equal(session.header.cwd, receipt.launch.cwd);
  assert.ok(session.users[0].includes(`Exact AK-${receipt.task.id} bounded read-only objective`));
  assert.equal(session.lastStop, "stop");
  assert.ok(session.calls.every((call) => ["read", "bash", "intercom"].includes(call.name)));
  const first = session.calls[0];
  assert.equal(first.name, "intercom");
  const reports = session.calls.filter((call) => call.name === "intercom");
  assert.equal(reports.length, 2);
  assert.equal(session.calls.at(-1).id, reports[1].id, "no further tool call may follow FINAL");
  assert.equal(new Set(session.calls.map((call) => call.id)).size, session.calls.length);
  for (const [index, tag] of ["PEER_ACK", "PEER_FINAL"].entries()) {
    const call = reports[index];
    assert.equal(call.arguments.action, "send");
    assert.equal(call.arguments.to, receipt.launch.parentPeerTarget);
    assert.ok(call.arguments.message.startsWith(`${tag} peer_run_id=${receipt.launch.runId}:`));
    assert.equal(session.results.filter((r) => r.id === call.id && r.error !== true).length, 1);
  }

  const presenceDir = join(process.env.XDG_RUNTIME_DIR, "pi-session-presence");
  const records = readdirSync(presenceDir)
    .filter((name) => /^\d+\.json$/.test(name))
    .flatMap((name) => {
      try {
        return [JSON.parse(readFileSync(join(presenceDir, name), "utf8"))];
      } catch {
        return [];
      }
    })
    .filter((record) => record.sessionId === session.header.id);
  assert.equal(records.length, 1);
  const presence = records[0];
  assert.equal(presence.terminalBound, true);
  assert.equal(presence.sessionFile, sessionFile);
  assert.equal(presence.cwd, receipt.launch.cwd);
  assert.equal(readlinkSync(`/proc/${presence.pid}/fd/0`), presence.tty);
  // Pi sets process.title, overwriting its own cmdline. The still-live launcher shell retains
  // literal argv: bind it through this exact Pi process's PPID and the same controlling TTY.
  const procStat = readFileSync(`/proc/${presence.pid}/stat`, "utf8");
  const parentPid = Number(procStat.slice(procStat.lastIndexOf(")") + 2).split(" ")[1]);
  assert.ok(Number.isSafeInteger(parentPid) && parentPid > 1);
  assert.equal(readlinkSync(`/proc/${parentPid}/fd/0`), presence.tty);
  const parentArgs = readFileSync(`/proc/${parentPid}/cmdline`, "utf8").split("\0").filter(Boolean);
  assert.equal(parentArgs[3], "sidequest-pi");
  const args = parentArgs.slice(4);
  const arg = (flag) => args[args.indexOf(flag) + 1];
  for (const flag of ["--offline", "--no-extensions", "--no-skills", "--no-prompt-templates"])
    assert.ok(args.includes(flag));
  for (const flag of ["--fork", "--continue", "--resume", "--print", "-p"])
    assert.equal(args.includes(flag), false);
  assert.equal(arg("--tools"), receipt.agent.effectiveTools.join(","));
  assert.equal(digest(arg("--system-prompt")), receipt.agent.composedSystemPromptSha256);
  assert.equal(
    arg("--thinking"),
    receipt.agent.thinking,
    "requested thinking, not a claim of unclamped effective level",
  );
  const model = session.models.at(-1);
  assert.equal(arg("--model"), `${model.provider}/${model.modelId}`);
  assert.equal(digest(args.at(-1)), receipt.launch.promptSha256);
  const extensions = args.flatMap((v, i) => (v === "--extension" ? [args[i + 1]] : []));
  assert.deepEqual(
    extensions,
    receipt.bootstrap.map((binding) => binding.entry),
  );
  const env = readFileSync(`/proc/${presence.pid}/environ`, "utf8").split("\0");
  assert.ok(
    env.includes(
      `PI_PROVENANCE_STANDING_AGENT_VISIBLE_LAUNCH=${receipt.launch.runId}:ak-${receipt.task.id}:${receipt.agent.name}`,
    ),
  );
  assert.ok(env.includes(`GHOSTTY_SURFACE_ID=${presence.ghosttySurfaceId}`));
  const windows = JSON.parse(execFileSync("niri", ["msg", "-j", "windows"], { encoding: "utf8" }));
  const matches = windows.filter(
    (window) => window.title === presence.windowTitle && window.app_id === "com.mitchellh.ghostty",
  );
  // A tab may no longer be selected: never steal operator focus or equate lack of foreground
  // title with lack of a real TUI. Independently prove its live Ghostty process ancestry/window.
  let ancestorPid = parentPid;
  let ghosttyPid;
  for (let depth = 0; depth < 12 && ancestorPid > 1; depth += 1) {
    if (readFileSync(`/proc/${ancestorPid}/comm`, "utf8").trim() === "ghostty") {
      ghosttyPid = ancestorPid;
      break;
    }
    const stat = readFileSync(`/proc/${ancestorPid}/stat`, "utf8");
    ancestorPid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
  }
  assert.ok(ghosttyPid, "exact TUI process must descend from a live Ghostty process");
  const ownerWindows = windows.filter(
    (window) => window.pid === ghosttyPid && window.app_id === "com.mitchellh.ghostty",
  );
  assert.ok(ownerWindows.length > 0, "that Ghostty process owns real compositor windows");
  t.diagnostic(
    JSON.stringify({
      runId: receipt.launch.runId,
      sessionId: presence.sessionId,
      pid: presence.pid,
      tty: presence.tty,
      surfaceId: presence.ghosttySurfaceId,
      ghosttyPid,
      ghosttyExecutable: readlinkSync(`/proc/${ghosttyPid}/exe`),
      foregroundWindowId: matches[0]?.id ?? null,
      placement:
        matches.length === 1 ? "foreground_title_observed" : "live_tab_foreground_not_observed",
      model,
      requestedThinking: arg("--thinking"),
      effectiveThinking: session.thinking.at(-1),
      toolCalls: session.calls.length,
      ack: 1,
      final: 1,
    }),
  );
});
