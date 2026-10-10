// Real loopback TLS fixture for AK6872. Certificates are generated per run by the local
// `openssl` CLI into a private package-local fixture directory; no key material is tracked.
// The routed transport keeps the adapter's real `https.request` options (TLS verification,
// pinned lookup, signal, agent) and only redirects the already-pinned public address to a
// test-owned 127.0.0.1 port. No other network target is contacted.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpsServer, request } from "node:https";
import { createServer as createTcpServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const FIXTURE_HOST = "clipper-fixture.example";
export const PINNED_PUBLIC = { address: "93.184.216.34", family: 4 };

function openssl(dir: string, args: string[]) {
  try {
    execFileSync("openssl", args, {
      cwd: dir,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 20000,
    });
  } catch (error) {
    throw new Error(
      `Real TLS fixture requires the openssl CLI; it is a declared test prerequisite, not skipped: ${String(error).slice(0, 200)}`,
    );
  }
}
function leaf(dir: string, name: string, san: string, ca: boolean) {
  const ext = join(dir, `${name}.ext`);
  writeFileSync(
    ext,
    `subjectAltName=DNS:${san}\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n`,
    { mode: 0o600 },
  );
  const key = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes"];
  if (ca) {
    openssl(dir, [
      "req",
      ...key,
      "-keyout",
      `${name}.key`,
      "-out",
      `${name}.csr`,
      "-subj",
      `/CN=${san}`,
    ]);
    openssl(dir, [
      "x509",
      "-req",
      "-in",
      `${name}.csr`,
      "-CA",
      "ca.crt",
      "-CAkey",
      "ca.key",
      "-set_serial",
      String(Math.floor(Math.random() * 1e9) + 2),
      "-days",
      "2",
      "-out",
      `${name}.crt`,
      "-extfile",
      ext,
    ]);
  } else {
    openssl(dir, [
      "req",
      "-x509",
      ...key,
      "-keyout",
      `${name}.key`,
      "-out",
      `${name}.crt`,
      "-days",
      "2",
      "-subj",
      `/CN=${san}`,
      "-addext",
      `subjectAltName=DNS:${san}`,
    ]);
  }
  return {
    key: readFileSync(join(dir, `${name}.key`)),
    cert: readFileSync(join(dir, `${name}.crt`)),
  };
}
export function certificates(dir: string) {
  openssl(dir, [
    "req",
    "-x509",
    "-newkey",
    "ec",
    "-pkeyopt",
    "ec_paramgen_curve:P-256",
    "-nodes",
    "-keyout",
    "ca.key",
    "-out",
    "ca.crt",
    "-days",
    "2",
    "-subj",
    "/CN=AK6872 throwaway test CA",
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "keyUsage=critical,keyCertSign",
  ]);
  return {
    ca: readFileSync(join(dir, "ca.crt")),
    trusted: leaf(dir, "trusted", FIXTURE_HOST, true),
    wrongHost: leaf(dir, "wrong-host", "other-host.example", true),
    selfSigned: leaf(dir, "self-signed", FIXTURE_HOST, false),
  };
}

type Tracked = { server: Server; sockets: Set<Socket>; accepted: number; requests: string[] };
function track(server: Server, t: Tracked, event: string) {
  server.on(event, (socket: Socket) => {
    t.accepted++;
    t.sockets.add(socket);
    socket.on("close", () => t.sockets.delete(socket));
  });
}
async function listen(t: Tracked) {
  await new Promise<void>((resolve) => t.server.listen(0, "127.0.0.1", resolve));
  const address = t.server.address();
  assert.ok(address && typeof address === "object");
  return {
    server: t.server,
    sockets: t.sockets,
    requests: t.requests,
    get accepted() {
      return t.accepted;
    },
    port: address.port,
    async close() {
      for (const socket of t.sockets) socket.destroy();
      await new Promise<void>((resolve) => t.server.close(() => resolve()));
    },
    async drained(ms = 3000) {
      for (const end = Date.now() + ms; Date.now() < end; ) {
        if (!t.sockets.size) return true;
        await sleep(10);
      }
      return t.sockets.size === 0;
    },
  };
}
// Paths select deterministic server behaviour; the fixture never forwards anything.
export async function httpsFixture(identity: { key: Buffer; cert: Buffer }) {
  const t = { sockets: new Set<Socket>(), accepted: 0, requests: [] as string[] } as Tracked;
  t.server = createHttpsServer(identity, (req, res) => {
    t.requests.push(req.url ?? "");
    const html = { "content-type": "text/html; charset=utf-8" };
    if (req.url === "/ok") res.writeHead(200, html).end("<html><p>real tls fixture</p></html>");
    else if (req.url === "/stall-headers") return;
    else if (req.url === "/stall-body") {
      res.writeHead(200, { ...html, "content-length": "100000" });
      res.write("<html><p>partial");
    } else if (req.url === "/interrupt-length") {
      res.writeHead(200, { ...html, "content-length": "1000" });
      res.write("<html><p>truncated", () => setTimeout(() => req.socket.destroy(), 20));
    } else if (req.url === "/interrupt-chunked") {
      res.writeHead(200, html);
      res.write("<html><p>truncated", () => setTimeout(() => req.socket.destroy(), 20));
    } else res.writeHead(404).end();
  }) as unknown as Server;
  track(t.server, t, "secureConnection");
  return listen(t);
}
// Accepts TCP and never speaks TLS: a stalled handshake.
export async function stalledTcpFixture() {
  const t = { sockets: new Set<Socket>(), accepted: 0, requests: [] as string[] } as Tracked;
  // Read (and discard) bytes so a client close is observed; never answer the ClientHello.
  t.server = createTcpServer((socket) => socket.resume());
  track(t.server, t, "connection");
  return listen(t);
}
export function routedTransport(port: number, extra: Record<string, unknown> = {}) {
  const seen: { url: string; options: Record<string, unknown>; pinned?: unknown }[] = [];
  return {
    seen,
    lookup: async () => [PINNED_PUBLIC],
    request: (url: URL, options: Record<string, unknown>, callback: (res: unknown) => void) => {
      const entry: (typeof seen)[number] = { url: url.href, options };
      seen.push(entry);
      const pinned = options.lookup as (
        h: string,
        o: unknown,
        cb: (e: Error | null, a: string, f: number) => void,
      ) => void;
      return request(
        url,
        {
          ...options,
          ...extra,
          port,
          lookup: (
            host: string,
            opts: unknown,
            cb: (e: Error | null, a: string, f: number) => void,
          ) =>
            pinned(host, opts, (error, address, family) => {
              entry.pinned = { error, address, family };
              // Redirect only the adapter-pinned public address to the loopback fixture.
              if (error || address !== PINNED_PUBLIC.address)
                cb(new Error("unexpected pin"), "", 4);
              else cb(null, "127.0.0.1", 4);
            }),
        },
        callback,
      );
    },
  };
}
export function socketHandles() {
  return process
    .getActiveResourcesInfo()
    .filter((name) => name === "TLSWrap" || name === "TCPSocketWrap").length;
}
export async function settledHandles(baseline: number, ms = 3000) {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (socketHandles() <= baseline) return true;
    await sleep(10);
  }
  return socketHandles() <= baseline;
}
