// Unshipped bootstrap callback: adopt the real inherited OFD before SDK/config imports.
const { native } = await import(`${process.argv[3]}/native.js`);
native().adoptCustody();
const { appendFileSync, existsSync, readFileSync, writeFileSync } = await import("node:fs");
const { join } = await import("node:path");
const { zstdDecompressSync } = await import("node:zlib");
const { spawnSync } = await import("node:child_process");
const root = process.argv[2],
  dist = process.argv[3];
const config = JSON.parse(readFileSync(join(root, "fixture.json")));
const trace = (event, data = {}) =>
  appendFileSync(
    join(root, "host-trace.jsonl"),
    `${JSON.stringify({ event, at: Date.now(), ...data })}\n`,
  );
writeFileSync(
  join(root, "host-pid.json"),
  JSON.stringify({
    pid: process.pid,
    stat: readFileSync("/proc/self/stat", "utf8").split(") ")[1].split(" ")[19],
  }),
);
const wait = async (name) => {
  const deadline = Date.now() + 125000;
  while (!existsSync(join(root, name))) {
    if (Date.now() > deadline) throw Error("harness_checkpoint_timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
};
// Accidental ambient fetch is a hard negative; the only supported send port is captured below.
globalThis.fetch = async () => {
  trace("forbidden-fetch");
  throw Error("ambient_network_forbidden");
};
const { openAdoptedChannel } = await import(`${dist}/socket-channel.js`);
const { runHost } = await import(`${dist}/startup.js`);
const { interpretTaskSessionMessage } = await import(`${dist}/producer-adapter.js`);
const actual = openAdoptedChannel();
let sends = 0;
const channel = {
  async receive(deadline) {
    const value = await actual.receive(deadline);
    trace("receive", { value });
    if (value.kind === "ADMISSION_RESULT") {
      const { readdirSync, readlinkSync } = await import("node:fs");
      const held = readdirSync("/proc/self/fd").filter((fd) => {
        try {
          return readlinkSync(`/proc/self/fd/${fd}`) === config.lock;
        } catch {
          return false;
        }
      });
      const child = spawnSync(
        "/usr/bin/python3",
        [
          "-c",
          'import os,sys; print(any(os.path.exists("/proc/self/fd/"+f) and os.path.realpath("/proc/self/fd/"+f)==sys.argv[1] for f in os.listdir("/proc/self/fd")))',
          config.lock,
        ],
        { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } },
      );
      trace("fd-custody", {
        held: held.map((fd) => ({ fd, info: readFileSync(`/proc/self/fdinfo/${fd}`, "utf8") })),
        ordinaryExecExit: child.status,
        ordinaryExecLeaked: child.stdout.trim() !== "False",
      });
      await wait("allow-admission");
    }
    if (value.kind === "CLOSED") {
      await wait("allow-closed");
      if (config.scenario === "closed-loss") throw Error("injected_closed_loss");
    }
    return value;
  },
  async send(value, deadline) {
    trace("send", { value });
    if (value.kind === "T1_PUBLISHED") await wait("allow-t1");
    // Fault the real outgoing frame, never synthesize admission/worker results.
    if (value.kind === "PREPARED" && config.scenario === "envelope-mismatch")
      value = { ...value, binding: { ...value.binding, raw_envelope_digest: "0".repeat(64) } };
    return actual.send(value, deadline);
  },
  finish() {
    trace("channel-finish");
    actual.finish();
  },
};
const send = async (url, init) => {
  // This is the actual native serializer's fetch boundary, not a prompt/payload stub.
  const headers = new Headers(init.headers);
  const bytes =
    headers.get("content-encoding") === "zstd"
      ? zstdDecompressSync(init.body)
      : Buffer.from(init.body);
  const body = JSON.parse(bytes);
  sends++;
  const lockAvailable =
    spawnSync("/usr/bin/flock", ["-n", config.lock, "/usr/bin/true"]).status === 0;
  trace("fetch", {
    sends,
    url: String(url),
    model: body.model,
    reasoning: body.reasoning,
    stream: body.stream,
    lockAvailable,
    bodyKeys: Object.keys(body),
    // Synthetic inputs only; never record bearer tokens or full provider request bodies.
    accountMatches: headers.get("chatgpt-account-id") === "synthetic-account",
    authorizationMatches: headers.get("authorization") === `Bearer ${config.syntheticAccess}`,
    hasObjective: JSON.stringify(body.input).includes(config.objective),
    hasToolResult: JSON.stringify(body.input).includes("function_call_output"),
  });
  if (config.scenario === "domain-after-send") {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(root, "other-git"));
    writeFileSync(join(config.checkout, ".git", "commondir"), `${join(root, "other-git")}\n`);
  }
  const args = JSON.stringify({
    path: join(config.checkout, "src", "proof.txt"),
    content: "task5513 native SDK proof",
  });
  const item = {
    type: "function_call",
    id: "fc_native",
    call_id: "call_native",
    name: "write",
    arguments: args,
  };
  const events =
    sends === 1
      ? [
          { type: "response.output_item.added", output_index: 0, item: { ...item, arguments: "" } },
          {
            type: "response.function_call_arguments.delta",
            item_id: item.id,
            output_index: 0,
            delta: args,
          },
          { type: "response.output_item.done", output_index: 0, item },
        ]
      : [];
  events.push({
    type: "response.completed",
    response: { status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1 } },
  });
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
};
const result = await runHost(channel, config.locator, { send }, interpretTaskSessionMessage);
trace("result", { result, sends });
writeFileSync(join(root, "host-result.json"), JSON.stringify({ ...result, sends }));
if (!result.closedVerified) await wait("release-owned-host");
native().closeCustody();
trace("custody-closed");
// A denied channel can retain a Node socket handle after the custody fd closes.
process.exit(0);
