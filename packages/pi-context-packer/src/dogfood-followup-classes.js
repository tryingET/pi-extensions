/**
summary: "Define omission follow-up classifications and their calibration guidance."
read_when:
  - "You change dogfood follow-up categories, contrary signals, or suggested actions."
*/

const classEntry = ({ classification, userSelectable, contrary, nextAction }) =>
  Object.freeze({ classification, userSelectable, contrary, nextAction });

export const DOGFOOD_OMISSION_FOLLOWUP_CLASS_REGISTRY = Object.freeze([
  classEntry({
    classification: "useful_omission",
    userSelectable: true,
    contrary: false,
    nextAction:
      "Treat useful-omission follow-ups as healthy omission signals, not missing adapter proof.",
  }),
  classEntry({
    classification: "residual_probe",
    userSelectable: true,
    contrary: true,
    nextAction: "Review residual-probe follow-ups for ranking, budget, or packet-shape gaps.",
  }),
  classEntry({
    classification: "validation_activity",
    userSelectable: true,
    contrary: false,
    nextAction:
      "Keep validation activity separate from context-probe counts when comparing usefulness.",
  }),
  classEntry({
    classification: "legacy_missingness",
    userSelectable: true,
    contrary: false,
    nextAction:
      "Prefer structured follow-up objects in future receipts to reduce legacy ambiguity.",
  }),
  classEntry({
    classification: "provenance_source_owner_followup",
    userSelectable: true,
    contrary: true,
    nextAction:
      "Route provenance/source-owner follow-ups to the owning surface; context-packer only recorded the packet-local calibration label.",
  }),
  classEntry({
    classification: "true_missing_capability",
    userSelectable: true,
    contrary: true,
    nextAction:
      "Review repeated true-missing-capability follow-ups before adding provider adapters or ranking scope.",
  }),
  classEntry({
    classification: "legacy_unspecified",
    userSelectable: false,
    contrary: true,
    nextAction:
      "Prefer structured follow-up objects in future receipts to reduce legacy ambiguity.",
  }),
  classEntry({
    classification: "other",
    userSelectable: true,
    contrary: true,
    nextAction: "Review 'other' follow-ups manually before tuning ranking or providers.",
  }),
]);

export const DOGFOOD_OMISSION_FOLLOWUP_CLASSES = Object.freeze(
  DOGFOOD_OMISSION_FOLLOWUP_CLASS_REGISTRY.map((entry) => entry.classification),
);

export const DOGFOOD_USER_OMISSION_FOLLOWUP_CLASSES = Object.freeze(
  DOGFOOD_OMISSION_FOLLOWUP_CLASS_REGISTRY.filter((entry) => entry.userSelectable).map(
    (entry) => entry.classification,
  ),
);

export const DOGFOOD_CONTRARY_OMISSION_FOLLOWUP_CLASSES = Object.freeze(
  DOGFOOD_OMISSION_FOLLOWUP_CLASS_REGISTRY.filter((entry) => entry.contrary).map(
    (entry) => entry.classification,
  ),
);

export const DOGFOOD_OMISSION_FOLLOWUP_CLASS_NEXT_ACTIONS = Object.freeze(
  Object.fromEntries(
    DOGFOOD_OMISSION_FOLLOWUP_CLASS_REGISTRY.map((entry) => [
      entry.classification,
      entry.nextAction,
    ]),
  ),
);

export const DOGFOOD_OMISSION_FOLLOWUP_CLASS_GUIDANCE = `optionally use objects with provider, reason, and classification (${DOGFOOD_USER_OMISSION_FOLLOWUP_CLASSES.join(", ")})`;
