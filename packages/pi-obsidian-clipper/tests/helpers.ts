import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
export function contract() {
  return {
    schema_version: 1,
    authority: "workstation/lane-op",
    family: "baseline-text",
    surface: "canonical",
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    refresh_after_seconds: 3600,
    base_url: "http://127.0.0.1:1234/v1",
    health_url: "http://127.0.0.1:1234/health",
    models_url: "http://127.0.0.1:1234/v1/models",
    models: [
      {
        pi_model_id: "baseline-multimodal",
        input: ["text", "image"],
        context_window: 262144,
        max_tokens: 131072,
        upstream_model: "MUST-NOT-EXPORT",
      },
    ],
  };
}
export async function fixture() {
  const base = resolve(".scratch/tests");
  await mkdir(base, { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(join(base, "fixture-"));
  return { dir, dispose: () => rm(dir, { recursive: true, force: true }) };
}
// AK6872 layout: the returned dir is <root>/dist (holding only the test's cli.cjs) and
// <root>/package.json completes the admitted closure root.
export async function nativeFixture() {
  const f = await fixture();
  await writeFile(join(f.dir, "package.json"), '{"name":"fixture-native","private":true}', {
    mode: 0o600,
  });
  const dir = join(f.dir, "dist");
  await mkdir(dir, { mode: 0o700 });
  return { dir, dispose: f.dispose };
}
export async function environment(values: Record<string, string>, run: () => Promise<unknown>) {
  const before = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  Object.assign(process.env, values);
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
