#!/usr/bin/env python3
"""Python worker for pi-eval-kernel.

Disposable (default): one eval per process with host-persisted logical state.
Persistent (--persistent): a long-lived loop over many evals whose logical
state lives in-process across evals (no host state round-trip).
"""

import ast
import concurrent.futures
import contextlib
import io
import json
import math
import os
import queue
import signal
import sys
import threading
import time
import traceback
import uuid

# Mode selection: an argv flag (--persistent) selects the long-lived worker
# loop instead of an initial handshake frame. The host decides worker lifetime
# at spawn time, the loop structure must be fixed before the first eval frame,
# and a flag adds no round-trip while keeping the disposable one-shot path
# unchanged.
PERSISTENT = "--persistent" in sys.argv[1:]


def ignore_sigint(_signum, _frame):
    return

WRITE_LOCK = threading.Lock()
PENDING_LOCK = threading.Lock()
PENDING = {}
EVAL_QUEUE = queue.Queue()
FINALIZE_LOCK = threading.Lock()
FINALIZE_EVENT = threading.Event()
FINALIZE_ID = None
FINALIZE_TOKEN = None
STATE = {}
OUTPUT_LIMIT = 50 * 1024
MAX_STATE_BYTES = 1_000_000
MAX_PROTOCOL_BYTES = 2_000_000
PROTOCOL_OUT = os.fdopen(3, "w", buffering=1, closefd=False)


def encode(message):
    return json.dumps(message, ensure_ascii=False, default=safe_value)


def send(message):
    payload = encode(message)
    if len(payload.encode("utf-8")) + 1 > MAX_PROTOCOL_BYTES:
        raise ValueError("Kernel-to-host protocol frame exceeded the limit.")
    with WRITE_LOCK:
        PROTOCOL_OUT.write(payload + "\n")
        PROTOCOL_OUT.flush()


def safe_value(value, depth=0, seen=None):
    if seen is None:
        seen = set()
    if value is None or isinstance(value, (int, bool)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        return value[:OUTPUT_LIMIT]
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")[:OUTPUT_LIMIT]
    if depth >= 12:
        return "[depth limit]"
    identity = id(value)
    if identity in seen:
        return "[circular]"
    seen.add(identity)
    try:
        if isinstance(value, (list, tuple, set)):
            return [
                safe_value(entry, depth + 1, seen) for entry in list(value)[:2000]
            ]
        if isinstance(value, dict):
            return {
                str(key): safe_value(entry, depth + 1, seen)
                for key, entry in list(value.items())[:2000]
            }
        return repr(value)[:OUTPUT_LIMIT]
    finally:
        seen.discard(identity)


def serialize_state():
    try:
        payload = json.dumps(STATE, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    except (TypeError, ValueError) as error:
        raise ValueError(f"state must be JSON-compatible: {error}") from error
    if len(payload.encode("utf-8")) > MAX_STATE_BYTES:
        raise ValueError(
            f"state exceeds the {MAX_STATE_BYTES}-byte limit; state was not committed."
        )
    return json.loads(payload)


def bounded_text(value, max_bytes=None):
    limit = OUTPUT_LIMIT if max_bytes is None else max(0, int(max_bytes))
    encoded = str(value).encode("utf-8")
    return encoded[:limit].decode("utf-8", errors="ignore")


class BoundedText(io.TextIOBase):
    def __init__(self, limit):
        self.limit = max(0, int(limit))
        self.parts = []
        self.bytes = 0
        self.truncated = False

    def writable(self):
        return True

    def write(self, text):
        text = str(text)
        if self.truncated:
            return len(text)
        encoded = text.encode("utf-8")
        remaining = self.limit - self.bytes
        if len(encoded) <= remaining:
            self.parts.append(text)
            self.bytes += len(encoded)
            return len(text)
        self.parts.append(encoded[: max(0, remaining)].decode("utf-8", errors="ignore"))
        self.bytes = self.limit
        self.truncated = True
        return len(text)

    def getvalue(self):
        value = "".join(self.parts)
        return value + ("\n[worker output truncated]" if self.truncated else "")


class PendingCall:
    def __init__(self):
        self.event = threading.Event()
        self.ok = False
        self.value = None
        self.error = None


class ToolBridge:
    def __init__(self):
        self.eval_id = None
        self.catalog = []

    def configure(self, eval_id, catalog):
        self.eval_id = eval_id
        self.catalog = list(catalog or [])

    def list(self):
        return [dict(entry) for entry in self.catalog]

    def call(self, name, input=None):
        if not self.eval_id:
            raise RuntimeError("No Python eval is active.")
        if not isinstance(name, str) or not name:
            raise ValueError("tool.call name must be a non-empty string.")
        call_id = str(uuid.uuid4())
        pending = PendingCall()
        with PENDING_LOCK:
            PENDING[call_id] = pending
        try:
            send(
                {
                    "type": "capability_call",
                    "evalId": self.eval_id,
                    "callId": call_id,
                    "name": name,
                    "input": safe_value({} if input is None else input),
                }
            )
            pending.event.wait()
            if not pending.ok:
                raise RuntimeError(pending.error or f"Capability {name} failed.")
            return pending.value
        finally:
            with PENDING_LOCK:
                PENDING.pop(call_id, None)

    def parallel(self, calls, max_workers=4):
        if not isinstance(calls, list):
            raise ValueError("tool.parallel calls must be a list.")
        if not isinstance(max_workers, int) or max_workers < 1 or max_workers > 32:
            raise ValueError("tool.parallel max_workers must be an integer from 1 to 32.")

        def invoke(call):
            if isinstance(call, dict):
                name = call.get("name")
                input_value = call.get("input", {})
            elif isinstance(call, (list, tuple)) and len(call) == 2:
                name, input_value = call
            else:
                raise ValueError("Each parallel call must be {name, input} or (name, input).")
            return self.call(name, input_value)

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=min(max_workers, max(1, len(calls)))
        ) as pool:
            return list(pool.map(invoke, calls))

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return lambda input=None: self.call(name, {} if input is None else input)


TOOL = ToolBridge()


def reader():
    global FINALIZE_TOKEN
    for line in sys.stdin:
        try:
            message = json.loads(line)
        except Exception as error:  # noqa: BLE001 - protocol boundary
            sys.__stderr__.write(f"Invalid host protocol JSON: {error}\n")
            sys.__stderr__.flush()
            continue
        message_type = message.get("type")
        if message_type == "eval":
            EVAL_QUEUE.put(message)
            continue
        if message_type == "finalize":
            with FINALIZE_LOCK:
                if (
                    message.get("id") == FINALIZE_ID
                    and isinstance(message.get("token"), str)
                ):
                    FINALIZE_TOKEN = message.get("token")
                    FINALIZE_EVENT.set()
            continue
        if message_type == "capability_result":
            with PENDING_LOCK:
                pending = PENDING.get(message.get("callId"))
            if pending:
                pending.ok = bool(message.get("ok"))
                pending.value = message.get("value")
                pending.error = message.get("error")
                pending.event.set()


def execute_code(code):
    globals_for_eval = {
        "__name__": "__pi_eval_kernel__",
        "state": STATE,
        "tool": TOOL,
    }
    tree = ast.parse(code, mode="exec")
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        prefix = ast.Module(body=tree.body[:-1], type_ignores=[])
        if prefix.body:
            exec(compile(prefix, "<pi-eval-kernel>", "exec"), globals_for_eval, globals_for_eval)
        expression = ast.Expression(body=tree.body[-1].value)
        return eval(
            compile(expression, "<pi-eval-kernel>", "eval"),
            globals_for_eval,
            globals_for_eval,
        )
    exec(compile(tree, "<pi-eval-kernel>", "exec"), globals_for_eval, globals_for_eval)
    return None


def execute_eval(message):
    global OUTPUT_LIMIT
    interrupt_handled = False

    def handle_eval_sigint(_signum, _frame):
        nonlocal interrupt_handled
        interrupt_handled = True
        signal.signal(signal.SIGINT, ignore_sigint)
        raise KeyboardInterrupt

    def finalize(result):
        global FINALIZE_ID, FINALIZE_TOKEN
        with FINALIZE_LOCK:
            FINALIZE_ID = result.get("id")
            FINALIZE_TOKEN = None
            FINALIZE_EVENT.clear()
        payload = encode(result)
        if len(payload.encode("utf-8")) > MAX_PROTOCOL_BYTES:
            payload = encode(
                {
                    "type": "eval_result",
                    "id": result.get("id"),
                    "ok": False,
                    "error": "Serialized eval result exceeded the protocol limit; state was not committed.",
                    "stdout": "",
                    "stderr": "",
                    "elapsedMs": result.get("elapsedMs"),
                }
            )
        with WRITE_LOCK:
            PROTOCOL_OUT.write(payload + "\n")
            PROTOCOL_OUT.flush()
        FINALIZE_EVENT.wait()
        with FINALIZE_LOCK:
            token = FINALIZE_TOKEN
        send({"type": "eval_complete", "id": result.get("id"), "token": token})
    started_at = time.monotonic()
    OUTPUT_LIMIT = max(0, int(message.get("outputLimitBytes") or 50 * 1024))
    stdout = BoundedText(OUTPUT_LIMIT)
    stderr = BoundedText(OUTPUT_LIMIT)
    # Disposable workers replace in-process state with the host's committed copy
    # each eval. Persistent workers keep state in-process across evals, so the
    # host never sends or reads back state.
    if not PERSISTENT:
        STATE.clear()
        incoming_state = message.get("state")
        if isinstance(incoming_state, dict):
            STATE.update(incoming_state)
    TOOL.configure(message.get("id"), message.get("capabilities", []))
    if PERSISTENT:
        signal.signal(signal.SIGINT, handle_eval_sigint)
    try:
        os.chdir(message.get("cwd") or os.getcwd())
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            value = execute_code(message.get("code", ""))
        result = {
            "type": "eval_result",
            "id": message.get("id"),
            "ok": True,
            "value": safe_value(value),
            "stdout": stdout.getvalue(),
            "stderr": stderr.getvalue(),
            "elapsedMs": round((time.monotonic() - started_at) * 1000),
        }
        if PERSISTENT:
            signal.signal(signal.SIGINT, ignore_sigint)
            result["interruptHandled"] = interrupt_handled
        else:
            result["state"] = serialize_state()
        finalize(result)
    except BaseException as error:  # noqa: BLE001 - user code boundary
        if PERSISTENT:
            signal.signal(signal.SIGINT, ignore_sigint)
        result = {
            "type": "eval_result",
            "id": message.get("id"),
            "ok": False,
            "error": bounded_text(error),
            "stdout": stdout.getvalue(),
            "stderr": bounded_text(stderr.getvalue() + traceback.format_exc()),
            "elapsedMs": round((time.monotonic() - started_at) * 1000),
        }
        if PERSISTENT:
            result["interruptHandled"] = interrupt_handled
        finalize(result)
    finally:
        if PERSISTENT:
            signal.signal(signal.SIGINT, ignore_sigint)
        TOOL.configure(None, [])


if PERSISTENT:
    signal.signal(signal.SIGINT, ignore_sigint)
threading.Thread(target=reader, name="pi-eval-kernel-protocol", daemon=True).start()
send({"type": "ready", "runtime": "python"})
if PERSISTENT:
    while True:
        execute_eval(EVAL_QUEUE.get())
else:
    execute_eval(EVAL_QUEUE.get())
