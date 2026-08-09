// ---
// summary: "Executes selected Pi host canary scenarios and applies lifecycle abort and summary semantics."
// read_when:
//   - "Changing scenario execution, lifecycle error projection, abort behavior, or run summaries."
// ---
import { errorMessage, isIntegrityError } from "./integrity.mjs";
import { ensureScenarioHost, restoreScenarioHost } from "./host-lifecycle.mjs";
import {
  commandToString,
  verifyAlignedTargetState,
  verifyScenarioCwdIdentity,
} from "./host-state.mjs";
import { resolveProfileHost, selectScenarios } from "./manifest.mjs";
import {
  printHostContract,
  scenarioFields,
  scenarioHostResult,
} from "./payloads.mjs";
import { spawnWithNeutralNpmEnv } from "./process.mjs";
import { recoverInterruptedRun, recoveryStatus } from "./recovery.mjs";
import {
  beginMutationSession,
  ConcurrentCanaryError,
  RecoveryRequiredError,
} from "./state-store.mjs";

function buildDryRunResult(scenario, host, hostPreparation) {
  const restoration = { status: "not-run", changed: false, packages: [] };
  return {
    ...scenarioFields(scenario),
    status: "dry-run",
    exitCode: 0,
    elapsedMs: 0,
    host: scenarioHostResult(host, hostPreparation, restoration),
  };
}

async function spawnScenario(scenario, host, options, mutationSession) {
  const startedAt = Date.now();
  const preparationTracker = { packages: [] };
  let hostPreparation;
  let execution = null;
  let preparationException;
  let scenarioException;
  let integrityFailure = false;
  let restoration = { status: "skipped", changed: false, packages: [], errors: [] };

  try {
    hostPreparation = await ensureScenarioHost(
      host,
      scenario,
      options,
      preparationTracker,
      mutationSession,
    );
    integrityFailure ||= hostPreparation.integrityFailed === true;
    if (hostPreparation.status !== "failed" && !options.dryRun) {
      for (const entry of preparationTracker.packages) {
        verifyAlignedTargetState(entry, host);
        mutationSession.validateEntryMetadata(entry);
      }
      const scenarioCwd = verifyScenarioCwdIdentity(scenario);
      for (const entry of preparationTracker.packages) entry.mayNeedCleanup = true;
      mutationSession.recordScenarioIntent();
      execution = await spawnWithNeutralNpmEnv(
        scenario.command[0],
        scenario.command.slice(1),
        {
          cwd: scenarioCwd,
          baseEnv: {
            ...process.env,
            PI_HOST_COMPAT_PROFILE: options.profile,
            PI_HOST_COMPAT_SCENARIO: scenario.id,
            PI_HOST_VERSION: host.version,
            PI_HOST_COMPAT_REVIEW_ANCHOR: host.reviewAnchor,
          },
          stdio: options.json ? ["ignore", "pipe", "pipe"] : "inherit",
          beforeRelease: (identity) => mutationSession.recordScenarioChild(identity),
        },
      );
      if (!execution.effectMayBeActive) mutationSession.clearChild();
      integrityFailure ||= execution.integrityFailure === true;
    }
  } catch (error) {
    integrityFailure ||= isIntegrityError(error);
    if (!hostPreparation) preparationException = errorMessage(error);
    else scenarioException = errorMessage(error);
  }

  if (!hostPreparation) {
    hostPreparation = {
      status: "failed",
      changed: preparationTracker.packages.some((entry) => entry.changed),
      packages: preparationTracker.packages,
      error: preparationException ?? "Host preparation failed",
    };
  }

  if (
    !options.dryRun &&
    preparationTracker.packages.length > 0 &&
    !mutationSession.hasRecordedChild()
  ) {
    try {
      restoration = await restoreScenarioHost(
        host,
        preparationTracker,
        options,
        mutationSession,
      );
      if (restoration.status !== "failed") mutationSession.completeScenario();
    } catch (error) {
      restoration = {
        status: "failed",
        changed: true,
        packages: [],
        errors: [{ phase: "restoration", operation: "unexpected-exception", message: errorMessage(error) }],
        error: errorMessage(error),
      };
    }
  }

  if (options.dryRun && hostPreparation.status !== "failed") {
    return buildDryRunResult(scenario, host, hostPreparation);
  }

  const preparationFailed = hostPreparation.status === "failed";
  const executionFailed = scenarioException || (execution && !execution.ok);
  const executionMissing = !preparationFailed && !options.dryRun && !execution;
  const restorationFailed = restoration.status === "failed";
  const failureMessages = [
    preparationFailed ? hostPreparation.error : undefined,
    scenarioException,
    executionFailed && execution ? execution.error ?? `Scenario command failed for ${scenario.id}` : undefined,
    executionMissing ? `Scenario command did not run for ${scenario.id}` : undefined,
    restorationFailed ? `restore failed: ${restoration.error}` : undefined,
  ].filter(Boolean);
  const status = failureMessages.length > 0 ? "failed" : "passed";
  const lifecycleErrors = {
    ...(integrityFailure ? { integrity: "identity or path integrity verification failed" } : {}),
    ...(preparationFailed ? { preparation: hostPreparation.error } : {}),
    ...(scenarioException ? { scenarioException } : {}),
    ...(executionFailed && execution
      ? {
          scenario: {
            exitCode: execution.exitCode,
            signal: execution.signal,
            ...(execution.error ? { error: execution.error } : {}),
          },
        }
      : {}),
    ...(restorationFailed ? { restoration: restoration.errors } : {}),
  };

  return {
    ...scenarioFields(scenario),
    status,
    exitCode: execution?.exitCode ?? 1,
    signal: execution?.signal ?? null,
    elapsedMs: Date.now() - startedAt,
    ...(failureMessages.length > 0 ? { error: failureMessages.join("; ") } : {}),
    ...(Object.keys(lifecycleErrors).length > 0 ? { lifecycleErrors } : {}),
    ...(restorationFailed ? { restorationFailed: true } : {}),
    ...(integrityFailure ? { integrityFailed: true } : {}),
    host: scenarioHostResult(host, hostPreparation, restoration),
    ...(options.json && execution ? { stdout: execution.stdout, stderr: execution.stderr } : {}),
  };
}

export async function runPayload(manifest, options) {
  const selection = selectScenarios(manifest, options);
  const host = resolveProfileHost(manifest, selection.profile);
  const results = [];
  let aborted = false;
  let abortReason;
  let mutationSession;

  if (options.dryRun) {
    const state = recoveryStatus(manifest);
    if (state.status === "active") throw new ConcurrentCanaryError("an active canary mutation blocks dry-run");
    if (state.recoveryRequired) throw new RecoveryRequiredError("unresolved canary recovery state blocks dry-run");
  } else {
    await recoverInterruptedRun(manifest, { apply: false, json: options.json });
    mutationSession = beginMutationSession(manifest, selection.profile);
  }

  try {
    for (const scenario of selection.scenarios) {
      if (!options.json) {
        console.log(`==> ${scenario.id} (${selection.profile})`);
        console.log(`    title: ${scenario.title}`);
        console.log(`    packages: ${scenario.packages.join(", ")}`);
        console.log(`    upstream_surfaces: ${scenario.upstreamSurfaces.join(", ")}`);
        console.log(`    cwd: ${scenario.cwd}`);
        console.log(`    command: ${commandToString(scenario.command)}`);
        console.log(`    host_version: ${host.version}`);
        console.log(`    review_anchor: ${host.reviewAnchor}`);
      }

      const result = await spawnScenario(
        scenario,
        host,
        {
          dryRun: options.dryRun,
          json: options.json,
          profile: selection.profile,
        },
        mutationSession,
      );
      results.push(result);

      if (!options.json) {
        console.log(
          `    result: ${result.status} (exit=${result.exitCode}, elapsed=${result.elapsedMs}ms)`,
        );
        console.log("");
      }

      if (result.restorationFailed || result.integrityFailed) {
        aborted = true;
        abortReason = result.integrityFailed ? "integrity-failed" : "restoration-failed";
        break;
      }
      if (result.status === "failed" && options.failFast) break;
    }
  } finally {
    mutationSession?.finalize();
  }

  const summary = {
    selected: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    dryRun: results.filter((result) => result.status === "dry-run").length,
  };

  return {
    manifestPath: manifest.manifestPath,
    hostPackage: manifest.hostPackage,
    hostCompanionPackages: manifest.hostCompanionPackages,
    trackedChangelog: manifest.trackedChangelog,
    profile: selection.profile,
    host,
    dryRun: options.dryRun,
    aborted,
    ...(abortReason ? { abortReason } : {}),
    results,
    summary,
  };
}

export function printRunSummary(payload) {
  console.log(`# Pi host compatibility canary run\n\n- profile: ${payload.profile}`);
  printHostContract(payload);
  for (const name of ["selected", "passed", "failed", "dryRun"]) {
    console.log(`- ${name === "dryRun" ? "dry_run" : name}: ${payload.summary[name]}`);
  }
}
