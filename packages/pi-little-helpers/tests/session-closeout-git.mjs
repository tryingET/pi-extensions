// summary: disposable test Git must never inherit an operator index, hooks or signing configuration.
import { execFileSync } from "node:child_process";

export function testGit(args, inherited = process.env) {
  const env = Object.fromEntries(
    Object.entries(inherited).filter(([key]) => !key.startsWith("GIT_")),
  );
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  });
  return execFileSync(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "init.templateDir=",
      "-c",
      "commit.gpgSign=false",
      "-c",
      "tag.gpgSign=false",
      ...args,
    ],
    { env, encoding: "utf8" },
  );
}
