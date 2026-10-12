#!/usr/bin/env python3
"""Opt-in real Pi TUI + real ASC child proof. Retains exact trace/receipts on any failure.
Deterministic controller provider only; actual child uses the explicitly selected real provider.
Run in an owned PTY, or inside isolated Ghostty for the Ghostty-backed assertion.
"""
import fcntl, glob, hashlib, json, os, pathlib, pty, select, signal, struct, subprocess, sys, termios, time

if os.environ.get("ASC_COCKPIT_LIVE") != "1":
    sys.exit("Refusing: set ASC_COCKPIT_LIVE=1 for explicit live provider trials")
root = pathlib.Path(os.environ["ASC_COCKPIT_PROOF_ROOT"]).resolve()
root.mkdir(parents=True, exist_ok=True)
if any(root.iterdir()):
    sys.exit("Refusing to reuse a proof root: no replay of previous attempts")
(root / "sessions").mkdir(mode=0o700, exist_ok=True)
fixture = pathlib.Path(__file__).with_name("cockpit-proof-extension.ts").resolve()
package = fixture.parent.parent.parent
source_files = sorted((package / "extensions/self").glob("subagent-cockpit*.ts")) + [
    package / "extensions/self/subagent-dashboard.ts", package / "extensions/self/subagent-control.ts",
    package / "extensions/self/subagent-spawn.ts", package / "extensions/self/subagent-spawn-args.ts", fixture]
helpers = os.environ.get("ASC_COCKPIT_PROOF_HELPERS_EXTENSION")
if helpers:
    helper_package = pathlib.Path(helpers).resolve().parent.parent
    guard = helper_package / "tests/ghostty-observer-tab-harness.mjs"
    subprocess.run(["node", "--input-type=module", "-e",
        "const m=await import(process.argv[1]); const reason=m.observerIsolationRefusal(); if(reason) throw new Error(reason);",
        guard.as_uri()], check=True)
    if os.environ.get("TERM_PROGRAM") != "ghostty": sys.exit("Real isolated Ghostty ancestor required")
    source_files += [helper_package / "extensions/sidequest.ts", helper_package / "src/ascExecutionObserver.ts",
        helper_package / "src/ascExecutionObserverProtocol.ts", helper_package / "extensions/sidequestLaunch.ts",
        helper_package / "extensions/sidequestGhostty.ts"]
def hashes():
    return {os.path.relpath(file, package): hashlib.sha256(file.read_bytes()).hexdigest() for file in source_files}
source_hashes = hashes()
mode = os.environ.get("ASC_COCKPIT_TUI_MODE", "fullscreen")
installed = os.environ.get("ASC_COCKPIT_PROOF_INSTALLED") == "1"
pid, fd = pty.fork()
if pid == 0:
    if helpers: os.environ["PI_ASC_OBSERVER_STATE_DIR"] = str(root / "observers")
    args = ["pi", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-mcp",
        "--no-context-files", "--extension", str(fixture), "--provider", "cockpit-proof", "--model", "controller",
        "--tui-mode", mode, "--session", str(root / "controller.jsonl")]
    if helpers: args += ["--extension", helpers]
    if installed:
        args.remove("--no-extensions")
        os.environ["PI_SUBAGENT_SESSIONS_DIR"] = str(root / "sessions")
        os.environ["PI_SELF_MEMORY_PATH"] = str(root / "self-memory.json")
        os.environ["PI_SUBAGENT_MODEL"] = os.environ["ASC_COCKPIT_PROOF_MODEL"]
    os.execvp("pi", args)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 46, 130, 0, 0))
log = open(root / "terminal.ansi", "wb", buffering=0)
buffer = bytearray()
checks = []
def pump(duration=0.1):
    end = time.monotonic() + duration
    while time.monotonic() < end:
        r, _, _ = select.select([fd], [], [], max(0, end - time.monotonic()))
        if r:
            try: data = os.read(fd, 65536)
            except OSError: return
            if not data: return
            log.write(data); buffer.extend(data)
            # Terminal capability probes are answered only in this test-owned PTY.
            if b"\x1b[6n" in data: os.write(fd, b"\x1b[1;1R")
            if b"\x1b[c" in data: os.write(fd, b"\x1b[?1;2c")
def send(text):
    os.write(fd, text.encode()); pump(0.35)
def until(predicate, label, seconds=120):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        pump(0.1)
        value = predicate()
        if value:
            checks.append(label); print("PASS", label, flush=True); return value
    raise AssertionError("Timed out: " + label)
def read(path):
    try: return json.loads(pathlib.Path(path).read_text())
    except (FileNotFoundError, json.JSONDecodeError): return None
def channel(name):
    for file in glob.glob(str(root / "sessions/.cockpit-*/channel.json")):
        value = read(file)
        if value and value.get("sessionName") == name: return value
    return None
def status(name): return read(root / "sessions" / (name + ".status.json"))
def kitty(character): send("\x1b[%d;8u" % ord(character))
def alive(pid):
    try: os.kill(pid, 0); return True
    except ProcessLookupError: return False
try:
    until(lambda: read(root / "ready.json"), "native TUI session started", 30)
    assert read(root / "ready.json")["mode"] == "tui"
    send("STEER-PROOF\r")
    active = until(lambda: (c if (c := channel("steering-proof")) and c["phase"] == "open" and
        any(e.get("toolName") == "bash" for e in c["events"]) else None), "real child tool visible")
    identity = (active["dispatchId"], active["attemptId"], active["childPid"])
    send("/proof-draft\r")
    until(lambda: read(root / "main-draft-set.json"), "main draft set during awaited dispatch", 10)
    offset = len(buffer); kitty("s")
    until(lambda: b"Timeline" in buffer[offset:], "shortcut opened popup during awaited dispatch", 10)
    send("\r") # children -> timeline
    send("\x1b[F\r") # End selects live tool, Enter expands it
    until(lambda: b"sleep 40" in buffer[offset:], "tool arguments expanded in live popup", 10)
    send("\t") # timeline -> private draft
    send("For this proof, replace the final word ORIGINAL with STEERED_NATIVE_PROOF. No additional tools or file edits.")
    send("\x13") # Ctrl+S, explicit send
    until(lambda: any(r["status"] == "queued" for r in (channel("steering-proof") or {}).get("requests", [])), "guidance queued, not claimed delivered", 10)
    send("\x1b") # close popup while child tool still sleeping
    kitty("d")
    draft = until(lambda: read(root / "main-draft-read.json"), "main draft read after popup close", 10)
    assert draft["draft"] == "MAIN_DRAFT_MUST_SURVIVE", draft
    assert status("steering-proof")["status"] == "running", "closing popup must leave running child"
    checks.append("closing popup preserved main draft and running attempt")
    kitty("s")
    # Resize actual TUI/overlay, then restore without submitting any child input.
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 18, 38, 0, 0)); os.kill(pid, signal.SIGWINCH); pump(1)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 46, 130, 0, 0)); os.kill(pid, signal.SIGWINCH); pump(1)
    until(lambda: any(r["status"] == "delivered" for r in (channel("steering-proof") or {}).get("requests", [])), "guidance committed to native child context")
    ended = until(lambda: (s if (s := status("steering-proof")) and s["status"] != "running" else None), "steered child settled")
    assert ended["status"] == "done", ended
    assert "STEERED_NATIVE_PROOF" in ended.get("resultPreview", ""), ended
    assert (ended["dispatchId"], ended["attemptId"]) == identity[:2]
    assert channel("steering-proof")["childPid"] == identity[2], "steering must not restart child"
    checks.append("real provider followed guidance without child restart")
    send("\x1b"); pump(2.5)
    assert b"done=1" in buffer
    # Clear only this proof's owned main draft for the second explicit trial.
    send("\x15CANCEL-PROOF\r")
    active2 = until(lambda: (c if (c := channel("cancel-proof")) and c["phase"] == "open" and
        any(e.get("toolName") == "bash" for e in c["events"]) else None), "second exact child running for cancellation")
    kitty("s")
    send("\x1b[120;7u") # Ctrl+Alt+X
    until(lambda: b"Cancel this exact attempt" in buffer, "targeted cancellation confirmation visible", 10)
    send("\x1b[B\r")
    cancelled = until(lambda: (s if (s := status("cancel-proof")) and s["status"] != "running" else None), "confirmed selected child cancelled")
    assert cancelled["status"] == "aborted", cancelled
    assert status("steering-proof")["status"] == "done", "cancel must not affect first child"
    send("\x1b"); pump(2.5)
    assert b"aborted=1" in buffer
    checks.append("terminal count strip and targeted cancellation outcomes rendered")
    if helpers:
        observer_root = root / "observers"
        assert not observer_root.exists() or not list(observer_root.iterdir()), "default observation must not write or launch"
        offset = len(buffer); send("/subagent-observer status\r")
        until(lambda: b"idle" in buffer[offset:], "real slash command inspects observer without opening", 10)
        assert not observer_root.exists() or not list(observer_root.iterdir()), "status must remain effect-free"
        send("/subagent-observer\r")
        def observer_state():
            for file in observer_root.glob("*.session.json"):
                value = read(file)
                if value and value.get("observer", {}).get("launchStatus") == "launched": return value
            # Session generation filenames are deliberately owner-chosen, not assumed by the driver.
            for file in observer_root.glob("*.json"):
                value = read(file)
                if value and value.get("schema") == "pi.asc_execution_observer_session.v1" and value.get("observer", {}).get("launchStatus") == "launched": return value
            return None
        observed = until(observer_state, "real slash command has verified detached Ghostty renderer ACK", 20)
        assert observed["observer"].get("rendererPid")
        assert len(observed.get("groups", [])) == 2
        checks.append("default observer effect-free; explicit troubleshooting opens retained progress")
    assert hashes() == source_hashes, "source changed during proof"
    report = {"checks": checks, "sourceSha256": source_hashes, "installedExtensions": installed, "mode": mode, "controllerPid": pid, "realChildModel": os.environ["ASC_COCKPIT_PROOF_MODEL"],
        "steering": {"dispatchId": ended["dispatchId"], "attemptId": ended["attemptId"], "status": ended["status"]},
        "cancel": {"dispatchId": cancelled["dispatchId"], "attemptId": cancelled["attemptId"], "status": cancelled["status"]},
        "scope": "real Pi TUI and real ASC child provider; deterministic controller provider; no pixel/focus/placement proof"}
    (root / "proof.json").write_text(json.dumps(report, indent=2))
    print("PROOF", root / "proof.json", flush=True)
except BaseException as error:
    (root / "failure.json").write_text(json.dumps({"checks": checks, "error": str(error)}, indent=2))
    print("FAIL", str(error), "retained", root, flush=True)
    raise
finally:
    # Stop only the exact test-owned controller; ASC's existing parent-death containment owns child shutdown.
    if alive(pid): os.kill(pid, signal.SIGTERM)
    end = time.monotonic() + 10
    while time.monotonic() < end:
        pump(0.1)
        done, _ = os.waitpid(pid, os.WNOHANG)
        if done: break
    else:
        if alive(pid): os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
    log.close(); os.close(fd)
