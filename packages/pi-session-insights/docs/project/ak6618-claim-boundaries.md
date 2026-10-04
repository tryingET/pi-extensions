---
summary: "AK6618 root-cause analysis, v2 claim boundaries, and synthetic red-green evidence."
read_when:
  - "Adopting the v2 session-insights output or assessing what its tests actually establish."
---

# AK6618 — preserve uncertainty across extraction and synthesis

## Scope and incident distinction

The motivating conversation mixed generated and unresolved-origin user-role records with human input, then offered overly strong behavioral advice. It also implied requested research was applied despite failed retrievals. That conversation used ad-hoc analysis, not this package. This package is a prevention surface with a reproduced analogous attribution defect, not the demonstrated cause of that incident.

Task: AK6618. Candidate base: `ab27dc016`. Only `packages/pi-session-insights/**` is in mutation scope. ASC, AK runtime, synthesis engines, installation, publication, and canonical checkout movement are not changed.

## First principles and five whys

The strength of a claim must not exceed its evidence. A message role is a transport category, not proof of human authorship. An assistant assertion is evidence that the assertion was made, not evidence that the asserted work occurred. A tool return is not proof that a research objective was fulfilled.

1. Why did unsupported human attribution appear? User-role text was named `latest_operator_message`.
2. Why did generated text reach that field? Known boot patterns were excluded, but unmatched text was treated as operator input.
3. Why was exclusion treated as verification? The contract did not distinguish user role from verified authorship; tests encoded the same assumption.
4. Why could a completion assertion appear without contrary observations? Assistant text had no claim-status label, while structural tool failures were absent.
5. Why was a larger conclusion possible? Extraction and synthesis lacked an explicit boundary between observations, unknowns, and accepted conclusions. This candidate corrects the extraction contract; it does not enforce arbitrary downstream prose.

This is a design diagnosis supported by synthetic reproduction. It is not a causal psychological diagnosis of an operator.

## Second-order analysis

| Tempting fix | Immediate effect | Downstream harm | Chosen response |
|---|---|---|---|
| Add more generated-prompt regexes | Removes familiar examples | New generated forms still become human; genuine pasted text gets lost | Preserve existing selection but label all selected user text unknown |
| Remove all uncertain text | Avoids false attribution | Destroys useful evidence and debugging context | Retain bounded text under the role-accurate name |
| Treat no reported tool error as completion | Simplifies status | Empty, irrelevant, partial, or unexamined returns become research proof | Report structural status; completion remains not established |
| Let a later non-error return erase failure | Shows a clean final state | Conceals partial coverage and failed attempts | Count both observations without inferring final fulfillment |
| Emit all tool output to justify status | Makes errors inspectable inline | Leaks private payloads and inflates context | Metadata-only counts and bounded entry references |
| Keep the misleading v1 alias forever | Avoids consumer migration | Old readers preserve the original unsupported attribution | Explicit v2 schema and documented breaking rename |
| Declare the whole problem solved after unit tests | Creates a simple closeout | Hides ungoverned ad-hoc analysis and synthesis | Limit the claim to this extractor and leave adoption explicit |

## Contract decisions

- Emit `pi.session-insights.v2`; remove `latest_operator_message` rather than silently redefine v1.
- Emit `latest_user_message` with `authorship: "unknown"`. No phrase, cwd, role, or arbitrary in-message field establishes authenticated human input.
- Mark session roles `heuristic_not_authorship`.
- Mark assistant text `unverified_assistant_text`.
- Emit `research_completion: "not_established"`. This is an extractor limitation, not a finding that research failed or cannot be verified elsewhere.
- Observe only structural `isError` status on persisted active-branch tool results: explicit true, explicit false, missing, invalid. jq `//` must not convert false to absence.
- Count all results in that view, emit the last 128 capped entry references, and disclose truncation. Exclude retained-tail copies and abandoned branches; retain malformed-chain uncertainties.
- Never expose result bodies/details or parse them for task IDs. This also corrects a pre-existing mismatch between the documented tool-output exclusion and task-reference extraction.

## Executable Gherkin-style checks

`tests/claim-boundaries.test.mjs` runs synthetic Given/When/Then scenarios through the real Node CLI and jq extractor. No extra BDD dependency or LLM is required.

```gherkin
Scenario: Unknown origin is not human attribution
  Given a generated or ordinary user-role record without authenticated authorship
  When the extractor selects it
  Then its bounded text remains available
  And authorship is unknown
  And no operator-message alias is emitted

Scenario: A research assertion is not fulfillment evidence
  Given a tool result with an explicit error
  And assistant text claiming completed web and Vault research
  When extraction runs
  Then the error observation remains visible
  And assistant text is labelled unverified
  And research completion is not established

Scenario: A later return does not erase a failed attempt
  Given an error result followed by a non-error result
  When extraction runs
  Then both status counts remain
  And neither count becomes a fulfillment verdict
```

Additional cases cover false/missing/null/string status fields, error-looking text, missing results, abandoned branches, compaction copies, retained user/assistant text, output limits, errors outside displayed references, and cyclic/missing-parent coverage.

## Observed verification

- Initial 12 new scenarios: **12 failed before the implementation**, then **12 passed** after it.
- Six additional counterexample/boundary regressions were added after the first green run.
- Final package `npm run check`: **18 new + 13 existing = 31 passing tests**, structure/lint/file-budget checks passed. Typecheck and packaging are declared skips for this private JavaScript/jq package.
- Independent work-product inspection: `dispatch-1791081100159` found no blocking defect in the bounded correction. It independently ran the then-current 28-test suite and extra boundary probes. The final three added cases preserve those suggested probes and malformed-chain checks; they were run by the controller, not that inspection pass.
- Tracked-file search outside this package found narrative v1 references in context-corpus/context-overlay documentation, not executable consumers under the searched names. This is not proof of no external consumers.

## Adoption and remaining limits

This is a candidate, not a live deployment. Consumers must check `schema`, not the unchanged private package version `0.1.0`. The owner-attribution input remains v1 because its meaning is unchanged. Existing source snapshots and old outputs remain readable by their existing readers; no session or stored data migration is performed. Rolling back the CLI also rolls back its output contract, so readers must fail explicitly on unexpected schemas rather than silently restore v1 human-attribution assumptions.

The package cannot authenticate a real human, prove source quality/usage, classify tool-specific research from anonymous status counters, deduplicate forked histories, redact private text repeated in user/assistant messages, or prevent an LLM from ignoring its evidence labels. The existing retained-tail first-user-text exclusion remains lossy and documented. No universal answer checker, automatic retry, destructive rollback, or machine-wide pause is introduced.
