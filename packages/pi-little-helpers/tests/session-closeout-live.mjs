// summary: opt-in real Pi TUI no-work canary; automation simulates operator input, not owner acceptance.
// Run: node tests/session-closeout-live.mjs /absolute/external-artifact-directory [--installed]
// Uses uv's isolated pexpect dependency; never run against an operator worktree/session.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { testGit } from "./session-closeout-git.mjs";

const artifact = process.argv[2];
const installed = process.argv[3] === "--installed";
if (!artifact || !isAbsolute(artifact)) throw new Error("Absolute artifact directory required");
mkdirSync(artifact, { recursive: true });
const repo = join(artifact, "empty-repo");
mkdirSync(repo); // fail instead of reusing an unknown checkout
testGit(["init", "-q", repo]);
testGit([
  "-C",
  repo,
  "-c",
  "user.name=Closeout canary",
  "-c",
  "user.email=canary@example.invalid",
  "commit",
  "--allow-empty",
  "-qm",
  "canary",
]);
const extension = resolve(
  fileURLToPath(new URL("../extensions/session-closeout.ts", import.meta.url)),
);
// Observe host lifecycle only; never replace the gate, its UI, or its readbacks.
const observer = join(artifact, "observer.ts");
writeFileSync(
  observer,
  `import { writeFileSync } from "node:fs";
export default function (pi) {
  pi.on("agent_settled", (_event, ctx) => {
    writeFileSync(${JSON.stringify(join(artifact, "registration.json"))}, JSON.stringify({
      commands: pi.getCommands().filter(c => c.name === "session-closeout" || c.name === "close-session"),
      tools: pi.getAllTools().filter(t => t.name === "session_closeout").map(t => ({name: t.name, sourceInfo: t.sourceInfo}))
    }, null, 2));
    if (ctx.isIdle()) ctx.ui.notify("CLOSEOUT_CANARY_SETTLED", "info");
  });
}`,
);
const script = String.raw`
import os,sys,time,json,pexpect
artifact,repo,extension,observer,installed=sys.argv[1:]
session=os.path.join(artifact,'live-session.jsonl')
prompt='Controlled live no-work closeout test in an empty disposable Git repository. Use ONLY session_closeout, one tool call per turn: open, freeze the empty inventory, check, seal. This is an explicitly empty test session: add no obligations, create no tasks, run no other tools. Operator UI is handled by the test driver. After the seal result, stop with a short completion statement. Never manufacture a verdict.'
loading=[] if installed=='true' else ['--no-extensions','-e',extension,'--no-prompt-templates']
# The installed fleet may keep heavy tools inactive. Exercise the real command activation path.
initial='/session-closeout status' if installed=='true' else prompt
args=loading+['-e',observer,'--no-skills','--no-builtin-tools','--tools','session_closeout','--session',session,'--thinking','minimal',initial]
child=pexpect.spawn('pi',args,cwd=repo,env={**os.environ,'TERM':'xterm-256color','PI_OFFLINE':'1'},encoding='utf-8',timeout=1800,dimensions=(45,140))
log=open(os.path.join(artifact,'tui.log'),'w'); child.logfile_read=log
def expect_during_run(pattern):
    if child.expect([pattern, 'CLOSEOUT_CANARY_SETTLED']) != 0:
        raise RuntimeError('Agent settled without expected gate UI: '+pattern)
try:
    if installed=='true':
        # Status activates the tool but refuses because no gate exists yet; it does not send the Vault procedure.
        child.expect("Open this exact session's closeout first", timeout=120)
        child.send(prompt+'\r')
    expect_during_run('Freeze session closeout inventory')
    time.sleep(0.5); child.send('\r')
    child.expect(r'Type exactly: approve ([0-9a-f]{12})')
    child.send('approve '+child.match.group(1)+'\r')
    expect_during_run('Independently certify safe-to-close declared scope')
    time.sleep(0.5); child.send('\r')
    child.expect(r'Type exactly: approve ([0-9a-f]{12})')
    child.send('approve '+child.match.group(1)+'\r')
    child.expect('SAFE_TO_CLOSE')
    child.expect('CLOSEOUT_CANARY_SETTLED')
    child.send('/reload\r')
    # Reload rebuilds the screen, dropping notifications from session_start.
    child.expect('Reloaded keybindings, extensions, skills, prompts, themes, and context files', timeout=120)
    child.send('/session-closeout check\r')
    child.expect(r'historicalReceiptMatches[^\r\n]*true', timeout=120)
    time.sleep(1)
    child.sendcontrol('c'); time.sleep(0.2); child.sendcontrol('c')
    child.expect(pexpect.EOF)
    print(json.dumps({'tui':'passed','reload_readback':'passed','installed':installed=='true','session':session,'operator_inputs':'test-driver simulation; not acceptance of real work'}))
finally:
    if child.isalive(): child.terminate(force=True)
    log.close()
`;
writeFileSync(join(artifact, "driver.py"), script);
const output = execFileSync(
  "uv",
  [
    "run",
    "--with",
    "pexpect",
    "python",
    join(artifact, "driver.py"),
    artifact,
    repo,
    extension,
    observer,
    String(installed),
  ],
  { encoding: "utf8", maxBuffer: 1024 * 1024 },
);
// Corroborate rendered text against host-persisted records; JSONL interpretation stays jq-only.
execFileSync("jq", [
  "-se",
  `
  .[0].id as $host |
  [.[] | select(.type == "custom" and .customType == "pi.session-closeout.v1")] as $journal |
  [.[] | select(.type == "custom_message" and .customType == "session-closeout-report") | .content[] | select(.type == "text") | .text | fromjson] as $reports |
  ($journal | length) == 3 and
  all($journal[]; .data.host.sessionId == $host and (.data.obligations | length) == 0) and
  $journal[-1].data.receipt.session == "SAFE_TO_CLOSE" and
  $reports[-1].historicalReceiptMatches == true and
  $reports[-1].session == "BLOCKED" and
  $reports[-1].digest == $journal[-1].data.receipt.digest
`,
  join(artifact, "live-session.jsonl"),
]);
writeFileSync(join(artifact, "result.json"), output);
console.log(output);
