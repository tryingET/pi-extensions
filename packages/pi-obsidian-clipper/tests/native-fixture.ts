// AK6872 native closure/process fixtures. An artifact root mirrors the installed layout:
// <root>/package.json, <root>/dist/cli.cjs and optional <root>/node_modules/**.
import { createSocket } from "node:dgram";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { dirname, join } from "node:path";

export async function artifactRoot(base: string, cli: string, files: Record<string, string> = {}) {
  const root = join(base, "artifact");
  await mkdir(join(root, "dist"), { recursive: true, mode: 0o700 });
  await writeFile(join(root, "package.json"), '{"name":"fixture-native","private":true}', {
    mode: 0o600,
  });
  await writeFile(join(root, "dist", "cli.cjs"), cli, { mode: 0o600 });
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(root, path), text, { mode: 0o600 });
  }
  return { root, cli: join(root, "dist", "cli.cjs") };
}
// Test-owned loopback observers: count every TCP connection and UDP datagram that arrives.
export async function observers() {
  const sockets = new Set<Socket>();
  let tcp = 0;
  let udp = 0;
  const server = createServer((socket) => {
    tcp++;
    sockets.add(socket);
    socket.on("error", () => {}); // probes reset connections; the count is the observation
    socket.on("close", () => sockets.delete(socket));
    socket.end("observer\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const datagrams = createSocket("udp4");
  datagrams.on("message", () => udp++);
  await new Promise<void>((resolve) => datagrams.bind(0, "127.0.0.1", resolve));
  const tcpAddress = server.address();
  if (!tcpAddress || typeof tcpAddress !== "object") throw new Error("observer address");
  return {
    ports: { tcp: tcpAddress.port, udp: datagrams.address().port },
    get tcp() {
      return tcp;
    },
    get udp() {
      return udp;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      datagrams.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
// A fake native CLI that tries every outbound and ambient-authority path it can reach, then
// prints a JSON report as its Markdown body. Ports come from a file inside its own closure.
export const probeCli = String.raw`
const fs = require('node:fs'); const path = require('node:path');
const ports = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ports.json'), 'utf8'));
const report = {};
const denied = (e) => 'denied:' + String((e && (e.code || (e.cause && e.cause.code) || e.message)) || e).slice(0, 60);
const attempt = (name, run) => new Promise((resolve) => {
  const timer = setTimeout(() => { report[name] = report[name] || 'timeout'; resolve(); }, 1500);
  const done = (value) => { if (!report[name]) report[name] = value; clearTimeout(timer); resolve(); };
  try { run(done); } catch (e) { done(denied(e)); }
});
Promise.all([
  attempt('tcp', (done) => { const s = require('node:net').connect(ports.tcp, '127.0.0.1');
    s.on('connect', () => { s.destroy(); done('connected'); }); s.on('error', (e) => done(denied(e))); }),
  attempt('tls', (done) => { const s = require('node:tls').connect(ports.tcp, '127.0.0.1', { rejectUnauthorized: false });
    s.on('connect', () => { s.destroy(); done('connected'); }); s.on('error', (e) => done(denied(e))); }),
  attempt('http', (done) => { const r = require('node:http').get('http://127.0.0.1:' + ports.tcp + '/', () => done('connected'));
    r.on('socket', (s) => s.on('connect', () => { r.destroy(); done('connected'); })); r.on('error', (e) => done(denied(e))); }),
  attempt('fetch', (done) => { fetch('http://127.0.0.1:' + ports.tcp + '/').then(() => done('connected'), (e) => done(denied(e))); }),
  attempt('udp', (done) => { const s = require('node:dgram').createSocket('udp4');
    s.on('error', (e) => done(denied(e))); s.send('probe', ports.udp, '127.0.0.1', (e) => { s.close(); done(e ? denied(e) : 'sent'); }); }),
  attempt('dns', (done) => require('node:dns').lookup('localhost', (e) => done(e ? denied(e) : 'resolved'))),
  attempt('child', (done) => { require('node:child_process').execFileSync(process.execPath, ['-e', '0']); done('spawned'); }),
  attempt('outsideRead', (done) => { fs.readFileSync(path.join(__dirname, '..', '..', 'outside', 'secret.txt')); done('read'); }),
  attempt('outsideWrite', (done) => { fs.writeFileSync(path.join(__dirname, '..', '..', 'outside', 'written.txt'), 'x'); done('written'); }),
]).then(() => { process.stdout.write('Probe report ' + JSON.stringify(report) + '\n'); });
`;
