// Unshipped isolation only: redirect OS account home, prohibit all subprocess/provider calls.
// No producer/task checks or profile semantics are replaced.

import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";

const actual = os.userInfo();
if (!process.env.TEST_PROFILE_HOME) throw Error("synthetic_home_required");
os.userInfo = () => ({ ...actual, homedir: process.env.TEST_PROFILE_HOME });
for (const name of ["exec", "execFile", "spawn", "fork", "execSync", "execFileSync", "spawnSync"])
  cp[name] = () => {
    throw Error("unexpected_process_effect");
  };
globalThis.fetch = () => {
  throw Error("unexpected_provider_effect");
};
syncBuiltinESMExports();
