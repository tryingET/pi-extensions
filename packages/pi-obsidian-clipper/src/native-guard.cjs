"use strict";
// AK6872 contract C5: preloaded into the native child only on Node runtimes whose permission
// model cannot deny network (no --allow-net, e.g. Node 22-24). It locks every public Node
// network entry point it enumerates, including constructors that create native handles. It is a
// deny-list: in-process, NOT kernel-enforced, not an OS sandbox, and may miss an unenumerated
// path. The permission model (C4) separately denies process.binding, child processes, workers
// and addons.
const CODE = "ERR_PI_CLIPPER_NETWORK_DENIED";
function denied(api) {
  const error = new Error(`Outbound network denied for native capture (${api})`);
  error.code = CODE;
  return error;
}
const locked = new WeakSet();
function lock(target, name, api) {
  if (!target || !(name in target) || locked.has(target[name])) return;
  const value = function denyNetwork() {
    throw denied(api);
  };
  locked.add(value);
  // Throws (and so fails the capture closed) if a target cannot be redefined.
  Object.defineProperty(target, name, {
    configurable: false,
    enumerable: false,
    writable: false,
    value,
  });
}
function lockAll(target, pattern, api) {
  for (let o = target; o && o !== Object.prototype; o = Object.getPrototypeOf(o))
    for (const name of Object.getOwnPropertyNames(o))
      if (pattern.test(name) && typeof o[name] === "function") lock(target, name, api);
}
const net = require("node:net");
lock(net.Socket.prototype, "connect", "tcp");
for (const name of ["listen", "_listen2"]) lock(net.Server.prototype, name, "listen");
for (const name of ["connect", "createConnection", "_createServerHandle"]) lock(net, name, "tcp");
lock(require("node:tls"), "connect", "tls");
for (const name of ["http", "https"]) {
  const mod = require(`node:${name}`);
  for (const fn of ["request", "get", "WebSocket"]) lock(mod, fn, name);
}
lock(require("node:http2"), "connect", "http2");
const dgram = require("node:dgram");
// The dgram.Socket constructor creates a native UDP handle before bind/send (AK6872 review).
for (const name of ["createSocket", "Socket", "_createSocketHandle"]) lock(dgram, name, "udp");
for (const name of ["bind", "connect", "send"]) lock(dgram.Socket.prototype, name, "udp");
const DNS = /^(lookup|lookupService|resolve|reverse)/;
for (const dns of [require("node:dns"), require("node:dns").promises]) {
  lockAll(dns, DNS, "dns");
  lockAll(dns.Resolver.prototype, DNS, "dns");
}
lockAll(require("node:dns/promises"), DNS, "dns");
for (const name of ["fetch", "WebSocket", "EventSource"]) lock(globalThis, name, name);
try {
  lock(require("node:inspector"), "open", "inspector");
} catch {
  // The permission model may already refuse the inspector module.
}
require("node:module").syncBuiltinESMExports();
