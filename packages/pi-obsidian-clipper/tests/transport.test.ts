import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import test from "node:test";
import {
  abortable,
  deadline,
  fetchHtml,
  HTML_LIMIT,
  publicAddress,
  publicUrl,
} from "../src/transport.ts";
import { environment } from "./helpers.ts";

function transport(responses, addresses = [{ address: "93.184.216.34", family: 4 }]) {
  const requests = [];
  const lookups = [];
  return {
    requests,
    lookups,
    lookup: async (host, options) => {
      lookups.push({ host, options });
      return typeof addresses === "function" ? addresses(host) : addresses;
    },
    request: (url, options, callback) => {
      const req = new EventEmitter();
      requests.push({ url: url.href, options });
      req.destroy = () => req.emit("error", new Error("destroyed"));
      req.end = () =>
        queueMicrotask(() => {
          if (options.signal.aborted) {
            req.destroy();
            return;
          }
          const spec = responses.shift();
          if (!spec) {
            req.destroy();
            return;
          }
          const res = Readable.from(
            spec.chunks ?? [Buffer.from(spec.body ?? "<html>fixture</html>")],
          );
          res.statusCode = spec.status ?? 200;
          res.headers = spec.headers ?? { "content-type": "text/html; charset=utf-8" };
          callback(res);
        });
      return req;
    },
  };
}
const signal = () => new AbortController().signal;
test("deny private/reserved IPv4 and IPv6 including mapped, transition and metadata targets", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "0.0.0.0",
    "100.64.0.1",
    "169.254.169.254",
    "172.31.1.1",
    "192.168.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "ff00::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "64:ff9b::a00:1",
    "2001:db8::1",
    "2001::1",
    "2002:7f00:1::",
    "3fff::1",
    "garbage",
  ])
    assert.equal(publicAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    assert.equal(publicAddress(ip), true, ip);
});
test("URL admission is strict, including numeric IP normalization and credentials", () => {
  for (const url of [
    "http://example.com",
    "file:///etc/passwd",
    "https://localhost/",
    "https://localhost./",
    "https://foo.local/",
    "https://a.internal/",
    "https://a.onion/",
    "https://127.1/",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://user:secret@example.com/",
    "https://example.com:1234/",
    "https://example.com/#x",
    "https://example.com\\@127.0.0.1/",
    "https://example.com/\n",
    "https://example.com/\x00",
  ])
    assert.throws(() => publicUrl(url), undefined, url);
  assert.equal(publicUrl("https://example.com/page?q=1").hostname, "example.com");
  assert.equal(publicUrl("https://[2606:4700:4700::1111]/").protocol, "https:");
});
test("DNS all addresses checked before any connection, including mixed public/private", async () => {
  for (const addresses of [
    [],
    [{ address: "10.0.0.1", family: 4 }],
    [
      { address: "1.1.1.1", family: 4 },
      { address: "::1", family: 6 },
    ],
    Array(65).fill({ address: "1.1.1.1", family: 4 }),
  ]) {
    const deps = transport([], addresses);
    await assert.rejects(fetchHtml("https://example.com/", signal(), deps), /DNS/);
    assert.equal(deps.requests.length, 0);
  }
});
test("actual lookup is pinned; no proxy, cookies, auth or pooled connection", async () => {
  const deps = transport([{}]);
  const result = await fetchHtml("https://example.com/", signal(), deps);
  assert.match(result.html, /fixture/);
  const o = deps.requests[0].options;
  const address = await new Promise((resolve) =>
    o.lookup("example.com", {}, (err, ip, family) => resolve({ err, ip, family })),
  );
  assert.deepEqual(address, { err: null, ip: "93.184.216.34", family: 4 });
  assert.equal(o.agent, false);
  assert.equal(o.family, 4);
  assert.equal(o.method, "GET");
  assert.equal(o.headers["Accept-Encoding"], "identity");
  assert.equal(o.headers.Cookie, undefined);
  assert.equal(o.headers.Authorization, undefined);
  assert.deepEqual(deps.lookups[0].options, { all: true, verbatim: true });
});
test("unsafe TLS environment cannot disable certificate checks on any pinned redirect request", async () => {
  await environment({ NODE_TLS_REJECT_UNAUTHORIZED: "0" }, async () => {
    const deps = transport([{ status: 302, headers: { location: "/next" } }, {}]);
    const abortSignal = signal();
    await fetchHtml("https://example.com/", abortSignal, deps);
    assert.equal(deps.requests.length, 2);
    for (const { url, options } of deps.requests) {
      assert.equal(options.rejectUnauthorized, true);
      assert.equal(new URL(url).hostname, "example.com");
      assert.equal(options.checkServerIdentity, undefined); // retain Node's hostname verifier
      assert.equal(options.signal, abortSignal);
      assert.equal(options.agent, false);
      const pinned = await new Promise((resolve) =>
        options.lookup("example.com", {}, (error, address, family) =>
          resolve({ error, address, family }),
        ),
      );
      assert.deepEqual(pinned, { error: null, address: "93.184.216.34", family: 4 });
    }
  });
});
test("redirects revalidate URL and DNS; private/downward/credential redirects never connect", async () => {
  for (const location of [
    "https://127.0.0.1/",
    "http://example.com/",
    "https://secret@example.com/",
    "https://[::1]/",
  ]) {
    const deps = transport([{ status: 302, headers: { location } }]);
    await assert.rejects(fetchHtml("https://example.com/", signal(), deps));
    assert.equal(deps.requests.length, 1);
  }
  const deps = transport(
    [{ status: 302, headers: { location: "https://other.example/" } }],
    (host) => [{ address: host === "example.com" ? "1.1.1.1" : "192.168.0.1", family: 4 }],
  );
  await assert.rejects(fetchHtml("https://example.com/", signal(), deps), /DNS/);
  assert.equal(deps.requests.length, 1);
  const valid = transport([{ status: 301, headers: { location: "/next" } }, {}]);
  assert.equal(
    (await fetchHtml("https://example.com/", signal(), valid)).finalUrl,
    "https://example.com/next",
  );
  assert.equal(valid.lookups.length, 2);
  const many = transport(Array(4).fill({ status: 302, headers: { location: "/again" } }));
  await assert.rejects(fetchHtml("https://example.com/", signal(), many), /Redirect limit/);
  assert.equal(many.requests.length, 4);
});
test("transport rejects non-HTML, compression, status, missing redirect and oversized bytes", async () => {
  for (const response of [
    { status: 401 },
    { headers: { "content-type": "application/json" } },
    { headers: { "content-type": "text/html", "content-encoding": "gzip" } },
    { status: 302, headers: {} },
    { body: "x".repeat(HTML_LIMIT + 1) },
    { chunks: [Buffer.alloc(HTML_LIMIT, 255)] },
  ]) {
    await assert.rejects(fetchHtml("https://example.com/", signal(), transport([response])));
  }
  const chunks = Array(17).fill(Buffer.alloc(65536));
  await assert.rejects(
    fetchHtml("https://example.com/", signal(), transport([{ chunks }])),
    /byte limit/,
  );
});
test("abort and shared deadline bound stalled DNS without connection or retry", async () => {
  const c = new AbortController();
  const never = new Promise(() => {});
  const pending = abortable(never, c.signal);
  c.abort();
  await assert.rejects(pending, /cancelled/);
  const deps = transport([]);
  deps.lookup = () => never;
  await assert.rejects(
    deadline((s) => fetchHtml("https://example.com/", s, deps), undefined, 20),
    /deadline/,
  );
  assert.equal(deps.requests.length, 0);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(fetchHtml("https://example.com/", aborted.signal, deps));
});
