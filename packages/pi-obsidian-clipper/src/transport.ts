import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export const HTML_LIMIT = 1024 * 1024;
export function publicAddress(address: string) {
  if (!ipaddr.isValid(address)) return false;
  const ip = ipaddr.parse(address);
  if (ip.range() !== "unicast") return false;
  // Only ordinary global IPv6 unicast; exclude transition/special-purpose prefixes.
  if (ip.kind() === "ipv6")
    return (
      ip.match(ipaddr.parse("2000::"), 3) &&
      !ip.match(ipaddr.parse("2001::"), 23) &&
      !ip.match(ipaddr.parse("2002::"), 16) &&
      !ip.match(ipaddr.parse("3fff::"), 20)
    );
  return true;
}
export function publicUrl(text: string): URL {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: reject URL control characters
  if (typeof text !== "string" || text.length > 2048 || /[\s\\\u0000-\u001f\u007f]/u.test(text))
    throw new Error("Invalid public URL");
  const u = new URL(text);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (u.protocol !== "https:" || u.username || u.password || u.hash || (u.port && u.port !== "443"))
    throw new Error("Only credential-free public HTTPS on port 443 is allowed");
  if (isIP(host)) {
    if (!publicAddress(host)) throw new Error("Non-public IP denied");
  } else if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(host)
  )
    throw new Error("Non-public hostname denied");
  return u;
}
export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let cancel = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(new Error("Operation cancelled or deadline exceeded"));
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
export async function deadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
  ms = 30000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  try {
    signal.throwIfAborted();
    return await run(signal);
  } finally {
    clearTimeout(timer);
  }
}
const defaults = { lookup, request };
export async function fetchHtml(text: string, signal: AbortSignal, deps = defaults) {
  let u = publicUrl(text);
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal.throwIfAborted();
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await abortable(deps.lookup(host, { all: true, verbatim: true }), signal);
    if (
      !addresses.length ||
      addresses.length > 64 ||
      addresses.some((a) => !publicAddress(a.address))
    )
      throw new Error("DNS contains non-public addresses");
    const chosen = addresses[0];
    const result = await new Promise<{ html?: string; redirect?: string }>((resolve, reject) => {
      const req = deps.request(
        u,
        {
          method: "GET",
          agent: false,
          rejectUnauthorized: true,
          family: chosen.family,
          lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family),
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "Accept-Encoding": "identity",
            "User-Agent": "pi-obsidian-clipper/0.1.0",
          },
          signal,
          maxHeaderSize: 16384,
        },
        (res) => {
          res.on("error", () => reject(new Error("HTML response failed")));
          if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
            const redirect = res.headers.location;
            res.destroy();
            if (!redirect) reject(new Error("Redirect without Location"));
            else resolve({ redirect });
            return;
          }
          if (
            res.statusCode !== 200 ||
            !/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(
              res.headers["content-type"] ?? "",
            ) ||
            (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")
          ) {
            res.destroy();
            reject(new Error("Expected uncompressed HTML response with status 200"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > HTML_LIMIT) {
              reject(new Error("HTML response byte limit"));
              req.destroy();
            } else chunks.push(chunk);
          });
          res.on("aborted", () => reject(new Error("HTML response interrupted")));
          res.on("end", () => {
            const html = Buffer.concat(chunks).toString("utf8");
            if (Buffer.byteLength(html) > HTML_LIMIT) reject(new Error("Decoded HTML byte limit"));
            else resolve({ html });
          });
        },
      );
      req.on("error", () => reject(new Error("HTTPS transport failed or cancelled")));
      req.end();
    });
    if (result.html !== undefined) return { html: result.html, finalUrl: u.href };
    if (redirects === 3) throw new Error("Redirect limit");
    u = publicUrl(new URL(result.redirect as string, u).href);
  }
  throw new Error("Redirect limit");
}
