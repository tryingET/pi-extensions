// AK6872: real TLS handshakes and interrupted-response cancellation against a test-owned
// loopback HTTPS fixture. Mocked option assertions in transport.test.ts stay unchanged.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { deadline, fetchHtml } from "../src/transport.ts";
import { environment, fixture } from "./helpers.ts";
import {
  certificates,
  FIXTURE_HOST,
  httpsFixture,
  PINNED_PUBLIC,
  routedTransport,
  settledHandles,
  socketHandles,
  stalledTcpFixture,
} from "./tls-fixture.ts";

let f: Awaited<ReturnType<typeof fixture>>;
let certs: ReturnType<typeof certificates>;
before(async () => {
  f = await fixture();
  certs = certificates(f.dir);
});
after(() => f.dispose());
const url = (path: string) => `https://${FIXTURE_HOST}${path}`;
const live = () => new AbortController().signal;

test("control: CA-trusted certificate for the URL hostname completes a real TLS fetch", async () => {
  const server = await httpsFixture(certs.trusted);
  try {
    const deps = routedTransport(server.port, { ca: certs.ca });
    const result = await fetchHtml(url("/ok"), live(), deps);
    assert.match(result.html, /real tls fixture/);
    assert.equal(server.accepted, 1);
    const [{ options, pinned }] = deps.seen;
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.checkServerIdentity, undefined);
    assert.equal(options.agent, false);
    assert.deepEqual(pinned, { error: null, ...PINNED_PUBLIC });
  } finally {
    await server.close();
  }
});
test("real TLS rejects an untrusted self-signed certificate even with NODE_TLS_REJECT_UNAUTHORIZED=0", async () => {
  const server = await httpsFixture(certs.selfSigned);
  try {
    await environment({ NODE_TLS_REJECT_UNAUTHORIZED: "0" }, async () => {
      // No test CA: the adapter's default trust store must reject the handshake.
      await assert.rejects(
        fetchHtml(url("/ok"), live(), routedTransport(server.port)),
        /HTTPS transport failed/,
      );
    });
    assert.deepEqual(server.requests, []);
  } finally {
    await server.close();
  }
});
test("real TLS verifies the URL hostname, not the pinned address, for a CA-trusted wrong-host certificate", async () => {
  const server = await httpsFixture(certs.wrongHost);
  try {
    await assert.rejects(
      fetchHtml(url("/ok"), live(), routedTransport(server.port, { ca: certs.ca })),
      /HTTPS transport failed/,
    );
    assert.deepEqual(server.requests, []);
  } finally {
    await server.close();
  }
});
test("stalled TLS handshake is cancelled by the shared deadline and the socket is released", async () => {
  const server = await stalledTcpFixture();
  const baseline = socketHandles();
  try {
    const started = Date.now();
    await assert.rejects(
      deadline((s) => fetchHtml(url("/ok"), s, routedTransport(server.port)), undefined, 300),
      /cancelled|deadline|HTTPS transport failed/,
    );
    assert.ok(Date.now() - started < 5000);
    assert.equal(server.accepted, 1);
    assert.ok(await server.drained(), "server still holds the stalled connection");
    assert.ok(await settledHandles(baseline), "client socket handle leaked");
  } finally {
    await server.close();
  }
});
for (const [path, how] of [
  ["/stall-headers", "deadline"],
  ["/stall-body", "deadline"],
  ["/stall-headers", "parent"],
  ["/stall-body", "parent"],
] as const) {
  test(`${how} cancellation of ${path} rejects, never returns partial HTML, and releases sockets`, async () => {
    const server = await httpsFixture(certs.trusted);
    const baseline = socketHandles();
    try {
      const deps = routedTransport(server.port, { ca: certs.ca });
      const parent = new AbortController();
      const pending = deadline(
        (s) => fetchHtml(url(path), s, deps),
        how === "parent" ? parent.signal : undefined,
        how === "deadline" ? 400 : 20000,
      );
      if (how === "parent") {
        for (let i = 0; i < 400 && !server.requests.length; i++)
          await new Promise((r) => setTimeout(r, 10));
        await new Promise((r) => setTimeout(r, 50));
        parent.abort();
      }
      await assert.rejects(pending, /cancelled|deadline|HTTPS transport failed|interrupted|failed/);
      assert.deepEqual(server.requests, [path]);
      assert.ok(await server.drained(), "server connection not closed after cancellation");
      assert.ok(await settledHandles(baseline), "client socket handle leaked");
    } finally {
      await server.close();
    }
  });
}
for (const path of ["/interrupt-length", "/interrupt-chunked"]) {
  test(`peer interruption of ${path} rejects instead of returning truncated HTML`, async () => {
    const server = await httpsFixture(certs.trusted);
    const baseline = socketHandles();
    try {
      await assert.rejects(
        fetchHtml(url(path), live(), routedTransport(server.port, { ca: certs.ca })),
        /interrupted|failed/,
      );
      assert.ok(await server.drained());
      assert.ok(await settledHandles(baseline), "client socket handle leaked");
    } finally {
      await server.close();
    }
  });
}
