// summary: resolve only approved explicit entrypoints from installed local package manifests, never caller paths.
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { sha256Hex } from "./dispatch-receipt.ts";

export interface TrustedVisibleLaunchBootstrap {
  extensions: string[];
  bindings: { package: string; entry: string; manifestSha256: string; entrySha256: string }[];
  /** Re-observe package manifests and entry bytes at the admission/observation boundaries. */
  verify(): Promise<boolean>;
}
export type TrustedVisibleLaunchBootstrapResolver = (
  model: string,
) => Promise<TrustedVisibleLaunchBootstrap | undefined>;

// Provider-extension aliases are deliberately NOT inferred. An owner-approved provider bootstrap
// must extend this policy, not inherit ambient extensions or accept PI_SUBAGENT_EXTENSIONS paths.
// Installed Pi 0.84.4 natively supplies zai/glm-5.3; no ambient provider extension is needed.
// Operator models.json/auth remain configured inputs, not a whole-runtime integrity claim.
const BUILTIN_PROVIDERS = new Set(["anthropic", "openai", "openai-codex", "google", "zai"]);
const APPROVED = [
  ["@tryinget/pi-peer-messaging", "extensions/intercom.ts"],
  ["@tryinget/pi-little-helpers", "extensions/session-presence.ts"],
] as const;

export const resolveTrustedVisibleLaunchBootstrap: TrustedVisibleLaunchBootstrapResolver = async (
  model,
) => {
  if (!BUILTIN_PROVIDERS.has(model.split("/")[0]) || !model.includes("/")) return undefined;
  const configured = process.env.PI_CODING_AGENT_DIR;
  const agentDir = configured
    ? resolve(configured === "~" ? homedir() : configured)
    : join(homedir(), ".pi", "agent");
  try {
    const settings = JSON.parse(await readFile(join(agentDir, "settings.json"), "utf8"));
    if (!Array.isArray(settings.packages)) return undefined;
    const bindings: TrustedVisibleLaunchBootstrap["bindings"] = [];
    const captured: { path: string; sha256: string }[] = [];
    for (const [name, entry] of APPROVED) {
      const matches: { root: string; manifest: Buffer }[] = [];
      for (const installed of settings.packages) {
        const source = typeof installed === "string" ? installed : installed?.source;
        if (
          typeof source !== "string" ||
          !(isAbsolute(source) || /^\.\.?\//u.test(source) || source.startsWith("~/"))
        )
          continue;
        const root = await realpath(
          source.startsWith("~/") ? join(homedir(), source.slice(2)) : resolve(agentDir, source),
        ).catch(() => undefined);
        if (!root) continue;
        const manifest = await readFile(join(root, "package.json")).catch(() => undefined);
        if (!manifest) continue;
        const parsed = JSON.parse(manifest.toString("utf8"));
        if (parsed.name !== name) continue;
        if (
          !Array.isArray(parsed.pi?.extensions) ||
          !parsed.pi.extensions.some((p: unknown) => p === entry || p === `./${entry}`)
        )
          return undefined;
        // Complex/glob settings filters have no approval proof in this slice.
        if (
          typeof installed === "object" &&
          (installed.autoload === false || installed.extensions !== undefined)
        )
          return undefined;
        matches.push({ root, manifest });
      }
      if (matches.length !== 1) return undefined;
      const { root, manifest } = matches[0];
      const path = await realpath(join(root, entry));
      if (relative(root, path).startsWith("..") || !(await stat(path)).isFile()) return undefined;
      const entrySha256 = sha256Hex(await readFile(path));
      const manifestSha256 = sha256Hex(manifest);
      bindings.push({ package: name, entry: path, manifestSha256, entrySha256 });
      captured.push(
        { path: join(root, "package.json"), sha256: manifestSha256 },
        { path, sha256: entrySha256 },
      );
    }
    return {
      extensions: bindings.map((b) => b.entry),
      bindings,
      async verify() {
        try {
          return (
            await Promise.all(
              captured.map(async (file) => sha256Hex(await readFile(file.path)) === file.sha256),
            )
          ).every(Boolean);
        } catch {
          return false;
        }
      },
    };
  } catch {
    return undefined;
  }
};
