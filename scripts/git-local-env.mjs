// summary: Removes the Git environment that relocates a repository (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...) so test processes and their git fixtures never act on an inherited repository; caller GIT_CONFIG_* settings are kept.
// read_when:
//   - starting test processes or git fixture commands from hooks, gates, or the package test runner.
import { spawnSync } from "node:child_process";

// `git rev-parse --local-env-vars` of Git 2.x; used only when git cannot be asked.
export const GIT_LOCAL_ENV_FALLBACK = Object.freeze([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE", "GIT_NO_REPLACE_OBJECTS", "GIT_REPLACE_REF_BASE", "GIT_PREFIX",
  "GIT_SHALLOW_FILE", "GIT_COMMON_DIR",
]);

// Configuration, not location: the gates pass caller and gate settings (GIT_CONFIG_COUNT pairs) on.
const isConfig = (name) => name.startsWith("GIT_CONFIG");

let cached;

// The repository-locating subset of Git's local environment.
export function gitLocalEnvVars() {
  if (cached) return cached;
  const env = { ...process.env };
  for (const name of GIT_LOCAL_ENV_FALLBACK) if (!isConfig(name)) delete env[name];
  const result = spawnSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8", env, cwd: "/" });
  const names = result.status === 0 ? result.stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  cached = Object.freeze((names.length > 0 ? names : [...GIT_LOCAL_ENV_FALLBACK]).filter((name) => !isConfig(name)));
  return cached;
}

export function withoutGitLocalEnv(env = process.env) {
  const clean = { ...env };
  for (const name of new Set([...gitLocalEnvVars(), ...GIT_LOCAL_ENV_FALLBACK.filter((name) => !isConfig(name))])) {
    delete clean[name];
  }
  return clean;
}
