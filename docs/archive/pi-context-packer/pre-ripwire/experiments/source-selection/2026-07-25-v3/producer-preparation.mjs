import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import {
  BACKEND_PATH,
  BUN_PATH,
  EXPECTED_ARTIFACTS,
  EXPECTED_SCI_REVISION,
  GIT_PATH,
  GZIP_PATH,
  NODE_PATH,
  REPOSITORIES,
  SCI_DIST_CLI,
  SCI_OWNER_ROOT,
  SCI_PACKAGE,
  SCI_PATH,
  STRACE_PATH,
  TAR_PATH,
  WORK_ROOT,
} from "./experiment-config.mjs";
import {
  checked,
  commandVersion,
  fail,
  git,
  gitText,
  targetState,
  verifyArtifact,
} from "./experiment-runtime.mjs";

export async function materializeRepositories() {
  const roots = [];
  await mkdir(join(WORK_ROOT, "repos"), { recursive: true });
  for (const definition of REPOSITORIES) {
    const root = join(WORK_ROOT, "repos", definition.id);
    await checked(GIT_PATH, [
      "clone",
      "--quiet",
      "--no-local",
      "--no-hardlinks",
      definition.source,
      root,
    ]);
    await git(root, [
      "-c",
      "advice.detachedHead=false",
      "checkout",
      "--quiet",
      "--detach",
      definition.commit,
    ]);
    const state = await targetState(root);
    if (
      state.head !== definition.commit ||
      state.status !== "" ||
      !state.clean ||
      state.ontology !== "absent"
    ) {
      fail(`${definition.id}: detached materialization is not clean at the frozen commit`);
    }
    roots.push({ ...definition, root, materializedState: state });
  }
  return roots;
}

export async function verifyHostArtifacts() {
  const nodeVersion = await commandVersion(NODE_PATH, ["--version"]);
  const gitVersion = await commandVersion(GIT_PATH, ["--version"]);
  const gzipVersion = await commandVersion(GZIP_PATH, ["--version"], true);
  const bunVersion = await commandVersion(BUN_PATH, ["--version"]);
  const sciVersion = await commandVersion(SCI_PATH, ["--version"]);
  const backendVersion = await commandVersion(BACKEND_PATH, ["--version"]);
  const straceVersion = await commandVersion(STRACE_PATH, ["--version"], true);
  const tarVersion = await commandVersion(TAR_PATH, ["--version"], true);
  const sciRevision = await gitText(SCI_OWNER_ROOT, ["rev-parse", "HEAD"]);
  if (sciRevision !== EXPECTED_SCI_REVISION) fail("SCI revision differs from the executable pin");
  return {
    node: await verifyArtifact("node", NODE_PATH, nodeVersion, EXPECTED_ARTIFACTS.node),
    git: await verifyArtifact("git", GIT_PATH, gitVersion, EXPECTED_ARTIFACTS.git),
    gzip: await verifyArtifact("gzip", GZIP_PATH, gzipVersion, EXPECTED_ARTIFACTS.gzip),
    bun: await verifyArtifact("bun", BUN_PATH, bunVersion, EXPECTED_ARTIFACTS.bun),
    sci: await verifyArtifact(
      "semantic-code-intelligence",
      SCI_PATH,
      sciVersion,
      EXPECTED_ARTIFACTS.sci,
      { revision: sciRevision, resolvedPath: await realpath(SCI_PATH) },
    ),
    backend: await verifyArtifact(
      "ast-grep",
      BACKEND_PATH,
      backendVersion,
      EXPECTED_ARTIFACTS.backend,
    ),
    strace: await verifyArtifact("strace", STRACE_PATH, straceVersion, EXPECTED_ARTIFACTS.strace),
    tar: await verifyArtifact("tar", TAR_PATH, tarVersion, EXPECTED_ARTIFACTS.tar),
    sciDistCli: await verifyArtifact(
      "semantic-code-intelligence-dist-cli",
      SCI_DIST_CLI,
      null,
      EXPECTED_ARTIFACTS.sciDistCli,
    ),
    sciPackage: await verifyArtifact(
      "semantic-code-intelligence-package",
      SCI_PACKAGE,
      null,
      EXPECTED_ARTIFACTS.sciPackage,
    ),
  };
}
