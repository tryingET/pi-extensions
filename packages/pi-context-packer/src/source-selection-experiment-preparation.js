import { decodeBase64Evidence } from "./source-selection-experiment-raw.js";
import {
  parseTrackedPathEvidence,
  validateTrackedPaths,
} from "./source-selection-experiment-source-list.js";
import {
  boundedText,
  exactKeys,
  invariant,
  isCommit,
  isDigest,
  sha256Digest,
} from "./source-selection-experiment-utils.js";

export const SOURCE_LIST_PREPARATION_SCHEMA =
  "pi-context-packer.source_list_preparation_observation.v1";

export function validateSourceListPreparation(observation, repositoryCommit, artifact, payload) {
  exactKeys(
    observation,
    [
      "schema",
      "repositoryCommit",
      "rawArtifactSha256",
      "sourceListExecutable",
      "command",
      "commandDigest",
      "exitCode",
      "targetState",
      "trackedPathInventory",
      "observationDigest",
    ],
    [],
    "sourceListPreparation",
  );
  invariant(
    observation.schema === SOURCE_LIST_PREPARATION_SCHEMA,
    "source-list preparation schema mismatch",
  );
  const { observationDigest: _ignored, ...body } = observation;
  invariant(
    observation.observationDigest === sha256Digest(body),
    "source-list preparation observationDigest mismatch",
  );
  invariant(
    observation.repositoryCommit === repositoryCommit,
    "source-list preparation commit mismatch",
  );
  invariant(
    observation.rawArtifactSha256 === artifact.rawSha256,
    "source-list preparation artifact binding mismatch",
  );
  exactKeys(
    observation.sourceListExecutable,
    ["nodePath", "path", "revision", "artifactSha256"],
    [],
    "sourceListPreparation.sourceListExecutable",
  );
  const executable = observation.sourceListExecutable;
  invariant(
    boundedText(executable.nodePath, 4096, true) && executable.nodePath.startsWith("/"),
    "source-list Node executable path is invalid",
  );
  invariant(
    boundedText(executable.path, 4096, true) && executable.path.startsWith("/"),
    "source-list executable path is invalid",
  );
  invariant(isCommit(executable.revision), "source-list revision pin is invalid");
  invariant(isDigest(executable.artifactSha256), "source-list artifact pin is invalid");
  const expectedCommand = [
    executable.nodePath,
    executable.path,
    "--repo",
    ".",
    "--full-list",
    "--json",
  ];
  invariant(
    JSON.stringify(observation.command) === JSON.stringify(expectedCommand),
    "source-list command must use the exact full-list JSON argv",
  );
  invariant(
    observation.commandDigest === sha256Digest(observation.command),
    "source-list commandDigest mismatch",
  );
  invariant(observation.exitCode === 0, "source-list preparation command failed");
  exactKeys(
    observation.targetState,
    ["headBefore", "headAfter", "statusBefore", "statusAfter", "cleanBefore", "cleanAfter"],
    [],
    "sourceListPreparation.targetState",
  );
  const state = observation.targetState;
  invariant(
    state.headBefore === repositoryCommit &&
      state.headAfter === repositoryCommit &&
      state.statusBefore === "" &&
      state.statusAfter === "" &&
      state.cleanBefore === true &&
      state.cleanAfter === true,
    "source-list preparation target was not clean and commit-stable",
  );
  const tracked = observation.trackedPathInventory;
  exactKeys(
    tracked,
    ["command", "commandDigest", "stdoutBase64", "stdoutSha256", "exitCode"],
    [],
    "sourceListPreparation.trackedPathInventory",
  );
  const expectedTrackedCommand = [
    "git",
    "-C",
    ".",
    "--literal-pathspecs",
    "ls-files",
    "--cached",
    "--stage",
    "-z",
    "--",
  ];
  invariant(
    JSON.stringify(tracked.command) === JSON.stringify(expectedTrackedCommand),
    "tracked-path evidence command mismatch",
  );
  invariant(
    tracked.commandDigest === sha256Digest(tracked.command),
    "tracked-path commandDigest mismatch",
  );
  invariant(tracked.exitCode === 0, "tracked-path evidence command failed");
  const bytes = decodeBase64Evidence(
    tracked.stdoutBase64,
    tracked.stdoutSha256,
    "tracked-path stdout",
  );
  const entries = parseTrackedPathEvidence(bytes);
  validateTrackedPaths(payload, entries);
  return { trackedPathCount: entries.length };
}
