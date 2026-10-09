// summary: governed runtime npm user config (split from governed-runtime-npm-policy.ts, AK6828).
// read_when:
//   - changing the npm configuration operators materialize the governed runtime with.

import {
  GOVERNED_RUNTIME_NPM_MIN_RELEASE_AGE_DAYS,
  GOVERNED_RUNTIME_NPM_REGISTRY,
  GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS,
} from "./governed-runtime-constants.ts";

/**
 * An npm user config that meets this policy exactly: the release-age floor, the governed exclusions
 * and nothing else, the public registry, online resolution. Materialize with npm_config_userconfig
 * pointing at it when the operator's own npmrc exempts more than the governed host line; npm keeps
 * its default cache, where the active Pi's install left the host tarballs (AK6828).
 */
export function governedRuntimeNpmUserConfig(): string {
  return [
    `min-release-age=${GOVERNED_RUNTIME_NPM_MIN_RELEASE_AGE_DAYS}`,
    ...GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS.map(
      (entry) => `min-release-age-exclude[]=${entry}`,
    ),
    `registry=${GOVERNED_RUNTIME_NPM_REGISTRY}`,
    "offline=false",
    "prefer-offline=false",
    "force=false",
    "",
  ].join("\n");
}
