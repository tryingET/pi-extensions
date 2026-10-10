import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { admitNative, nativeBoundary, permissionArgs } from "./closure.ts";
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
// Trust the operator-installed artifact and its whole dependency closure (AK6872 C1-C3),
// not paths/flags supplied by a model. Returns the resolved CLI path.
export async function nativeArtifact(path: string, signal?: AbortSignal) {
  return (await admitNative(path, signal)).cli;
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
// Re-admits the closure immediately before every spawn, then runs it under the read-only
// permission boundary (C4) with network denied by the runtime or the guard (C5).
export async function runNative(cli: string, url: string, dir: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const artifact = await admitNative(cli, signal);
  const permission = permissionArgs(artifact.root, dir);
  if (signal.aborted) throw new Error("Native capture cancelled or deadline exceeded");
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        ...permission.args,
        artifact.cli,
        url,
        "--template",
        join(dir, "template.json"),
        "--html",
        join(dir, "source.html"),
      ],
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
    // Refuse an unsupported boundary before any closure walk or page transport.
    const { boundary } = nativeBoundary();
    const cli = await admitNative(path, signal);
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
      const markdown = await runNative(cli.cli, page.finalUrl, dir, signal);
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
          boundary,
        },
        markdown,
        saved: false,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, parent);
}
