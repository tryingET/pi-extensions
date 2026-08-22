import { BoundaryError } from "./errors.js";
import {
  assertEnum,
  assertInteger,
  assertPlainObject,
  assertString,
  deepFreeze,
  rejectUnknownFields,
  stableUtf8Compare,
} from "./util.js";

const CONNECTOR_FIELDS = Object.freeze([
  "packageDigest",
  "tool",
  "operation",
  "effect",
  "target",
  "dataExposure",
]);
const RETENTION_FIELDS = Object.freeze(["mode", "maximumDays", "maximumBytes"]);

function normalizeRetention(value, label, fallback) {
  if (value === undefined) value = fallback;
  if (typeof value === "string") value = { mode: value };
  assertPlainObject(value, label);
  rejectUnknownFields(value, RETENTION_FIELDS, label);
  const mode = assertEnum(value.mode, `${label}.mode`, [
    "none",
    "session",
    "operator-policy",
    "bounded",
  ]);
  const maximumDays =
    value.maximumDays === undefined
      ? undefined
      : assertInteger(value.maximumDays, `${label}.maximumDays`, 0, 3650);
  const maximumBytes =
    value.maximumBytes === undefined
      ? undefined
      : assertInteger(value.maximumBytes, `${label}.maximumBytes`, 0, Number.MAX_SAFE_INTEGER);
  if (mode === "bounded" && maximumDays === undefined && maximumBytes === undefined) {
    throw new BoundaryError(
      "UNBOUNDED_RETENTION",
      `${label} mode bounded requires maximumDays or maximumBytes`,
    );
  }
  if (mode === "none" && ((maximumDays ?? 0) !== 0 || (maximumBytes ?? 0) !== 0)) {
    throw new BoundaryError(
      "CONTRADICTORY_RETENTION",
      `${label} mode none cannot retain days or bytes`,
    );
  }
  return deepFreeze({ mode, maximumDays, maximumBytes });
}

function normalizeConnectorGrant(value, index) {
  assertPlainObject(value, `hostConnectorGrants[${index}]`);
  rejectUnknownFields(value, CONNECTOR_FIELDS, `hostConnectorGrants[${index}]`);
  return deepFreeze({
    packageDigest: assertString(value.packageDigest, `hostConnectorGrants[${index}].packageDigest`, {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/u,
    }),
    tool: assertString(value.tool, `hostConnectorGrants[${index}].tool`, { min: 1, max: 128 }),
    operation: assertString(value.operation, `hostConnectorGrants[${index}].operation`, {
      min: 1,
      max: 128,
    }),
    effect: assertEnum(value.effect, `hostConnectorGrants[${index}].effect`, [
      "read",
      "workspace-write",
      "external-write",
    ]),
    target:
      value.target === undefined
        ? undefined
        : assertString(value.target, `hostConnectorGrants[${index}].target`, {
            min: 1,
            max: 1024,
          }),
    dataExposure: assertEnum(
      value.dataExposure ?? "metadata",
      `hostConnectorGrants[${index}].dataExposure`,
      ["none", "metadata", "content"],
    ),
  });
}

export function createDataExposure({
  modelProviderLocality = "unknown",
  modelProviderId,
  hostConnectorGrants = [],
  rawToolOutputRetention = { mode: "session" },
  changeSetRetention = { mode: "operator-policy" },
  quarantineRetention = { mode: "operator-policy" },
} = {}) {
  if (!Array.isArray(hostConnectorGrants)) {
    throw new BoundaryError("INVALID_CONNECTOR_GRANTS", "hostConnectorGrants must be an array");
  }
  if (hostConnectorGrants.length > 256) {
    throw new BoundaryError("TOO_MANY_CONNECTOR_GRANTS", "hostConnectorGrants exceeds 256 entries");
  }
  const grants = hostConnectorGrants.map(normalizeConnectorGrant);
  grants.sort((left, right) => {
    for (const field of ["packageDigest", "tool", "operation", "target"]) {
      const compared = stableUtf8Compare(String(left[field] ?? ""), String(right[field] ?? ""));
      if (compared !== 0) return compared;
    }
    return 0;
  });
  for (let index = 1; index < grants.length; index += 1) {
    const previous = grants[index - 1];
    const current = grants[index];
    if (
      previous.packageDigest === current.packageDigest &&
      previous.tool === current.tool &&
      previous.operation === current.operation &&
      previous.target === current.target
    ) {
      throw new BoundaryError("DUPLICATE_CONNECTOR_GRANT", "Duplicate host connector grant");
    }
  }
  return deepFreeze({
    schema: "pi-tool-boundary-data-exposure/v1",
    guestNetwork: "absent",
    controllerInjectedCredentials: "none",
    modelProviderLocality: assertEnum(modelProviderLocality, "modelProviderLocality", [
      "local",
      "remote",
      "unknown",
    ]),
    modelProviderId:
      modelProviderId === undefined
        ? undefined
        : assertString(modelProviderId, "modelProviderId", { min: 1, max: 256 }),
    hostConnectorGrants: grants,
    rawToolOutputRetention: normalizeRetention(
      rawToolOutputRetention,
      "rawToolOutputRetention",
      { mode: "session" },
    ),
    changeSetRetention: normalizeRetention(
      changeSetRetention,
      "changeSetRetention",
      { mode: "operator-policy" },
    ),
    quarantineRetention: normalizeRetention(
      quarantineRetention,
      "quarantineRetention",
      { mode: "operator-policy" },
    ),
    sourceMayContainSensitiveData: true,
    endToEndInformationFlowConfinement: false,
  });
}
