import { mean } from "./source-selection-experiment-utils.js";

const ARMS = ["paths", "source_list", "structural", "fusion"];

function summarize(cases, arm) {
  const unnecessary = cases.reduce(
    (total, entry) => total + entry.arms[arm].metrics.unnecessary.length,
    0,
  );
  const omissions = cases.reduce(
    (total, entry) => total + entry.arms[arm].metrics.omittedTruth.length,
    0,
  );
  return {
    caseCount: cases.length,
    macroPrecision: mean(cases.map((entry) => entry.arms[arm].metrics.precision)),
    macroRecall: mean(cases.map((entry) => entry.arms[arm].metrics.recall)),
    unnecessary,
    unnecessaryPerCase: cases.length === 0 ? null : unnecessary / cases.length,
    omissions,
    omissionsPerCase: cases.length === 0 ? null : omissions / cases.length,
  };
}

function delta(paths, treatment) {
  return {
    macroPrecision: treatment.macroPrecision - paths.macroPrecision,
    macroRecall: treatment.macroRecall - paths.macroRecall,
    unnecessary: treatment.unnecessary - paths.unnecessary,
    unnecessaryReductionRate:
      paths.unnecessary === 0
        ? null
        : (paths.unnecessary - treatment.unnecessary) / paths.unnecessary,
    omissions: treatment.omissions - paths.omissions,
    unnecessaryPerCase: treatment.unnecessaryPerCase - paths.unnecessaryPerCase,
    omissionsPerCase: treatment.omissionsPerCase - paths.omissionsPerCase,
  };
}

function groupByRepository(cases, repositoryIds) {
  return new Map(
    repositoryIds.map((repositoryId) => [
      repositoryId,
      cases.filter((entry) => entry.repositoryId === repositoryId),
    ]),
  );
}

function equalRepositoryMacro(perRepository, arms) {
  const included = Object.values(perRepository).filter(({ caseCount }) => caseCount > 0);
  const armResults = Object.fromEntries(
    arms.map((arm) => [
      arm,
      {
        macroPrecision: mean(included.map((entry) => entry.arms[arm].macroPrecision)),
        macroRecall: mean(included.map((entry) => entry.arms[arm].macroRecall)),
        meanRepositoryUnnecessaryPerCase: mean(
          included.map((entry) => entry.arms[arm].unnecessaryPerCase),
        ),
        meanRepositoryOmissionsPerCase: mean(
          included.map((entry) => entry.arms[arm].omissionsPerCase),
        ),
      },
    ]),
  );
  return {
    repositoryCount: included.length,
    caseCount: included.reduce((total, entry) => total + entry.caseCount, 0),
    arms: armResults,
  };
}

function equalDelta(equalMacro, treatment) {
  if (equalMacro.repositoryCount === 0) return null;
  return {
    macroPrecision:
      equalMacro.arms[treatment].macroPrecision - equalMacro.arms.paths.macroPrecision,
    macroRecall: equalMacro.arms[treatment].macroRecall - equalMacro.arms.paths.macroRecall,
    meanRepositoryUnnecessaryPerCase:
      equalMacro.arms[treatment].meanRepositoryUnnecessaryPerCase -
      equalMacro.arms.paths.meanRepositoryUnnecessaryPerCase,
    meanRepositoryOmissionsPerCase:
      equalMacro.arms[treatment].meanRepositoryOmissionsPerCase -
      equalMacro.arms.paths.meanRepositoryOmissionsPerCase,
  };
}

function pairedAggregate(cases, repositoryIds, treatment) {
  const eligible = cases.filter(
    (entry) => entry.arms.paths.eligible && entry.arms[treatment].eligible,
  );
  const available = eligible.filter(
    (entry) => entry.arms.paths.available && entry.arms[treatment].available,
  );
  const grouped = groupByRepository(available, repositoryIds);
  const perRepository = Object.fromEntries(
    repositoryIds.map((repositoryId) => {
      const entries = grouped.get(repositoryId);
      const paths = summarize(entries, "paths");
      const treatmentSummary = summarize(entries, treatment);
      return [
        repositoryId,
        {
          caseIds: entries.map(({ id }) => id),
          caseCount: entries.length,
          arms: { paths, [treatment]: treatmentSummary },
          deltaFromPaths: entries.length === 0 ? null : delta(paths, treatmentSummary),
        },
      ];
    }),
  );
  const equalMacro = equalRepositoryMacro(perRepository, ["paths", treatment]);
  return {
    population: "paths_and_treatment_available_intersection",
    treatment,
    caseIds: available.map(({ id }) => id),
    denominators: {
      eligibleRepositoryCount: new Set(eligible.map(({ repositoryId }) => repositoryId)).size,
      availableRepositoryCount: equalMacro.repositoryCount,
      eligibleCaseCount: eligible.length,
      availableCaseCount: available.length,
    },
    perRepository,
    equalRepositoryMacro: equalMacro,
    deltaFromPaths: equalDelta(equalMacro, treatment),
  };
}

function allFourAggregate(cases, repositoryIds) {
  const eligible = cases.filter((entry) => ARMS.every((arm) => entry.arms[arm].eligible));
  const available = eligible.filter((entry) => ARMS.every((arm) => entry.arms[arm].available));
  const grouped = groupByRepository(available, repositoryIds);
  const perRepository = Object.fromEntries(
    repositoryIds.map((repositoryId) => {
      const entries = grouped.get(repositoryId);
      const arms = Object.fromEntries(ARMS.map((arm) => [arm, summarize(entries, arm)]));
      return [
        repositoryId,
        {
          caseIds: entries.map(({ id }) => id),
          caseCount: entries.length,
          arms,
          deltasFromPaths: Object.fromEntries(
            ARMS.slice(1).map((arm) => [
              arm,
              entries.length === 0 ? null : delta(arms.paths, arms[arm]),
            ]),
          ),
        },
      ];
    }),
  );
  const equalMacro = equalRepositoryMacro(perRepository, ARMS);
  return {
    population: "all_four_eligible_and_available_intersection",
    caseIds: available.map(({ id }) => id),
    denominators: {
      eligibleRepositoryCount: new Set(eligible.map(({ repositoryId }) => repositoryId)).size,
      availableRepositoryCount: equalMacro.repositoryCount,
      eligibleCaseCount: eligible.length,
      availableCaseCount: available.length,
    },
    perRepository,
    equalRepositoryMacro: equalMacro,
    deltasFromPaths: Object.fromEntries(
      ARMS.slice(1).map((arm) => [arm, equalDelta(equalMacro, arm)]),
    ),
  };
}

export function aggregateExperiment(cases, repositories) {
  const repositoryIds = [...repositories.keys()];
  const availability = Object.fromEntries(
    ARMS.map((arm) => {
      const eligible = cases.filter((entry) => entry.arms[arm].eligible);
      return [
        arm,
        {
          eligible: eligible.length,
          available: eligible.filter((entry) => entry.arms[arm].available).length,
          unavailable: eligible.filter((entry) => !entry.arms[arm].available).length,
        },
      ];
    }),
  );
  return {
    availability,
    pairwise: Object.fromEntries(
      ARMS.slice(1).map((treatment) => [
        treatment,
        pairedAggregate(cases, repositoryIds, treatment),
      ]),
    ),
    allFour: allFourAggregate(cases, repositoryIds),
  };
}
