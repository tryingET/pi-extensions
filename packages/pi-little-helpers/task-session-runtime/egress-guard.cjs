// summary: Preloaded into the two online npm steps: a TCP connection may reach only the public registry, so a redirect to another host fails before it connects.
// read_when:
//   - "A locked fetch or lock update fails with task_session_egress_refused."
"use strict";
const net = require("node:net");

// No proxy: through one, the guard would see only the proxy and never the host it tunnels to, so
// isolatedNpm removes the proxy variables and npm connects directly.
const ALLOWED = "registry.npmjs.org";

// Every TCP and TLS connection, from http, https or undici alike, goes through Socket#connect.
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options =
    first !== null && typeof first === "object"
      ? first
      : { port: first, host: typeof args[1] === "string" ? args[1] : "localhost" };
  // Node's own rule: a truthy path is a local socket, anything else is TCP (https passes path: null).
  if (!options.path) {
    const host = String(options.host ?? options.hostname ?? "localhost")
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
    if (host !== ALLOWED) {
      const error = new Error(`task_session_egress_refused: ${host || "(empty host)"}`);
      error.code = "TASK_SESSION_EGRESS_REFUSED";
      throw error;
    }
  }
  return connect.apply(this, args);
};
