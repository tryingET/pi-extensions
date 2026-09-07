/**
 * summary: "builds the detached npm environment the release-check smoke tree installs and runs in."
 * read_when:
 *   - "changing how release checks isolate the smoke install from the developer's npm config."
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Variables the smoke tree is allowed to see. This is an allowlist, not a denylist, because the
 * tree is EXECUTED, not merely installed: release-check-package.mjs runs `node -e import(...)`
 * inside it. Subtracting the npm_config_* prefix would still hand third-party module top-level code
 * NODE_AUTH_TOKEN, NPM_TOKEN, GITHUB_TOKEN and every provider key in the developer's shell.
 * scripts/release-sandbox.sh passes exactly this set through `env -i`.
 */
const INHERITED_VARIABLES = ["PATH", "TMPDIR", "TMP", "TEMP"];

/**
 * Why this exists at all:
 *
 *   - ~/.npmrc carries the registry auth token. `--ignore-scripts` stops install hooks, not
 *     imports, so the token has to be out of reach of the tree rather than merely unused by it.
 *   - `min-release-age` quarantines versions published recently. When an upstream peer splits out
 *     a brand-new transitive package, that package's packument filters to nothing and the install
 *     dies with ENOVERSIONS -- a fact about someone else's release schedule, not about whether the
 *     package under test is publishable.
 */
export function createReleaseSmokeEnvironment({ tempDir, env = process.env }) {
  const sandboxHome = path.join(tempDir, "npm-home");
  // Two files, not one: npm refuses to load a single path as both user and global config
  // ("double-loading config ... as global, previously loaded as user") and exits before it
  // resolves anything at all.
  const userNpmrc = path.join(sandboxHome, "user.npmrc");
  const globalNpmrc = path.join(sandboxHome, "global.npmrc");
  const configHome = path.join(sandboxHome, ".config");
  const cacheHome = path.join(sandboxHome, ".cache");
  for (const directory of [sandboxHome, configHome, cacheHome]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(userNpmrc, "", { mode: 0o600 });
  fs.writeFileSync(globalNpmrc, "", { mode: 0o600 });

  // npm finds its PROJECT config by walking up from the cwd to the first directory holding a
  // package.json. An empty temp dir has none, so on a machine whose TMPDIR sits under $HOME the
  // walk escapes and lands on the developer's ~/.npmrc -- reported as `config prefix cannot be
  // changed from project config`, and enough to bring the quarantine back. Writing the manifest
  // here stops the walk in the temp dir, where the project config is an empty file. This function
  // is the only writer of that manifest, so nothing downstream may run `npm init` over it.
  const smokeManifest = {
    name: "pi-interaction-release-check-smoke",
    version: "0.0.0",
    private: true,
  };
  fs.writeFileSync(path.join(tempDir, ".npmrc"), "", { mode: 0o600 });
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    `${JSON.stringify(smokeManifest, null, 2)}\n`,
  );

  const smokeEnv = {};
  for (const name of INHERITED_VARIABLES) {
    if (env[name] !== undefined) smokeEnv[name] = env[name];
  }
  Object.assign(smokeEnv, {
    HOME: sandboxHome,
    USERPROFILE: sandboxHome,
    // XDG-aware tools ignore HOME, so these have to move too or the override is cosmetic.
    XDG_CONFIG_HOME: configHome,
    XDG_CACHE_HOME: cacheHome,
    npm_config_userconfig: userNpmrc,
    npm_config_globalconfig: globalNpmrc,
  });
  // The download cache is shared when the caller already has one: it is content-addressed and
  // holds no credentials, and a cold cache per package would cost more than it protects. When it
  // is unknown, npm picks its own platform default under the sandbox home rather than this code
  // guessing a POSIX path that would be wrong on Windows.
  if (env.npm_config_cache !== undefined) smokeEnv.npm_config_cache = env.npm_config_cache;

  return { sandboxHome, userNpmrc, globalNpmrc, configHome, cacheHome, env: smokeEnv };
}

export const RELEASE_SMOKE_INHERITED_VARIABLES = Object.freeze([...INHERITED_VARIABLES]);
