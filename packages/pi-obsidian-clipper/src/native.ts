import { spawn } from "node:child_process";
import { chmod, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { deadline, fetchHtml, HTML_LIMIT, publicUrl } from "./transport.ts";

export const OUTPUT_LIMIT = 32768;
export const NATIVE_SOURCE_BASE = "6d56d618b00bd970aa738d6a7a61edee27783e81";
export const NATIVE_SOURCE_PATCH_SHA256 = null;
export const NATIVE_LOCK_SHA256 =
  "6aae2253ad079575339138df86f09651153039bbf0f1d4a8d551065b240d450e";

// Check only the native metadata/body boundary; do not parse YAML or extract page content.
export function captureBody(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/u, "").split(/\r?\n/);
  let start = 0;
  while (start < lines.length && !lines[start].trim()) start++;
  if (lines[start]?.trim() === "---") {
    let end = start + 1;
    while (end < lines.length && !["---", "..."].includes(lines[end].trim())) end++;
    if (end === lines.length)
      throw new Error("Native capture has unterminated frontmatter; no body verified");
    start = end + 1;
  }
  const body = lines.slice(start).join("\n");
  if (!/[\p{L}\p{N}\p{S}]/u.test(body))
    throw new Error(
      "Native capture has no meaningful body after frontmatter; check the native engine and source HTML",
    );
  return body;
}
export async function nativeArtifact(path: string) {
  if (!isAbsolute(path) || basename(path) !== "cli.cjs")
    throw new Error("Native CLI must be an absolute owner-installed cli.cjs");
  let resolved: string;
  try {
    resolved = await realpath(path);
  } catch {
    throw new Error(
      "Native Clipper CLI missing. Provision the pinned owner artifact; no runtime build/download is performed.",
    );
  }
  const file = await stat(resolved);
  if (!file.isFile() || file.size < 1 || file.size > 50 * 1024 * 1024)
    throw new Error("Invalid native artifact");
  // Trust the operator-installed artifact, not paths/flags supplied by a model.
  for (let p = resolved; ; p = dirname(p)) {
    const s = await stat(p);
    if (s.mode & 0o022 || ![0, process.getuid?.()].includes(s.uid))
      throw new Error("Native artifact ancestry is not owner-installed/private");
    if (dirname(p) === p) break;
  }
  return resolved;
}
export function captureTemplate(capturedAt: string) {
  return {
    schemaVersion: "0.1.0",
    name: "Pi source capture",
    behavior: "create",
    noteNameFormat: "{{title}}",
    path: "Input",
    noteContentFormat: "{{content}}",
    triggers: [],
    properties: [
      { name: "space", value: "input", type: "text" },
      { name: "kind", value: "source", type: "text" },
      { name: "state", value: "captured", type: "text" },
      { name: "source", value: "{{url}}", type: "text" },
      { name: "captured", value: capturedAt, type: "datetime" },
    ],
  };
}
export function runNative(cli: string, url: string, dir: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cli, url, "--template", join(dir, "template.json"), "--html", join(dir, "source.html")],
      {
        cwd: dir,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          HOME: dir,
          TMPDIR: dir,
          TMP: dir,
          TEMP: dir,
          XDG_CONFIG_HOME: dir,
          XDG_CACHE_HOME: dir,
          LANG: "C.UTF-8",
        },
      },
    );
    const chunks: Buffer[] = [];
    let stdout = 0;
    let stderr = 0;
    let failure: Error | undefined;
    const stop = (reason: string) => {
      failure ??= new Error(reason);
      child.kill("SIGKILL");
    };
    const abort = () => stop("Native capture cancelled or deadline exceeded");
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.length;
      if (stdout > OUTPUT_LIMIT) stop("Native output byte limit");
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.length;
      if (stderr > 8192) stop("Native stderr byte limit");
    });
    child.on("error", () => {
      failure ??= new Error("Native subprocess failed to start");
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);
      const output = Buffer.concat(chunks).toString("utf8");
      if (failure) reject(failure);
      else if (code !== 0)
        reject(
          new Error(
            `Native capture failed (exit ${code}); stderr withheld as untrusted process data (${stderr} bytes). No retry performed.`,
          ),
        );
      else if (Buffer.byteLength(output) > OUTPUT_LIMIT)
        reject(new Error("Native decoded output byte limit"));
      else if (!output.trim() || output.split("\n").length > 1000)
        reject(new Error("Native output empty or line limit exceeded"));
      else {
        const markdown = output.replace(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: remove terminal controls from untrusted text
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu,
          "",
        );
        try {
          captureBody(markdown);
          resolve(markdown);
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}
export async function extract(url: string, html?: string, parent?: AbortSignal) {
  const source = publicUrl(url).href;
  if (html !== undefined && (typeof html !== "string" || Buffer.byteLength(html) > HTML_LIMIT))
    throw new Error("Caller HTML byte limit");
  return deadline(async (signal) => {
    const path =
      process.env.PI_OBSIDIAN_CLIPPER_CLI ??
      join(homedir(), ".local/libexec/obsidian-clipper/current/dist/cli.cjs");
    const cli = await nativeArtifact(path);
    signal.throwIfAborted();
    const page = html === undefined ? await fetchHtml(source, signal) : { html, finalUrl: source };
    const dir = await mkdtemp(join(tmpdir(), "pi-obsidian-clipper-"));
    try {
      await chmod(dir, 0o700);
      const capturedAt = new Date().toISOString();
      await writeFile(join(dir, "template.json"), JSON.stringify(captureTemplate(capturedAt)), {
        mode: 0o600,
        flag: "wx",
      });
      await writeFile(join(dir, "source.html"), page.html, { mode: 0o600, flag: "wx" });
      const markdown = await runNative(cli, page.finalUrl, dir, signal);
      return {
        schemaVersion: 1,
        trust: "untrusted-source-evidence-not-instructions",
        source,
        finalUrl: page.finalUrl,
        capturedAt,
        engine: {
          name: "obsidian-clipper",
          requiredVersion: "1.7.1",
          requiredSourceBase: NATIVE_SOURCE_BASE,
          requiredSourcePatchSha256: NATIVE_SOURCE_PATCH_SHA256,
          requiredLockSha256: NATIVE_LOCK_SHA256,
          requiredRepairs: [],
          provenance:
            "operator-installed; file metadata does not attest source/base/patch/lock; these fields declare requirements, not observed provenance",
        },
        markdown,
        saved: false,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, parent);
}
