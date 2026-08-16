/**
summary: "Validates, repairs, redacts, and hard-caps final compaction summaries."
read_when:
  - "Changing required summary sections, managed block assembly, or deterministic repair."
*/
import {
  countManagedBlocks,
  decodeManagedBlocks,
  stripManagedBlocks,
} from "./managed-block-codec.js";
import { containsPotentialSecret, sanitizeDisplayText } from "./redaction.js";

const ORIENTATION_HEADING_RE =
  /^##\s+(?:Self-contained continuation snapshot|Brief)\s*$/imu;
const NEXT_ACTION_HEADING_RE = /^##\s+(?:Next action|Immediate next steps)\s*$/imu;
const MANAGED_TYPE_PRIORITY = [
  "essential-prompts",
  "execution-receipts",
  "last-assistant",
  "file-activity",
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function stripLegacyManagedBlocks(value) {
  const summary = normalizeText(value);
  if (!summary) return "";
  const lines = summary.split(/\r?\n/u);
  const out = [];
  let skipMode;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (
      /^## Files touched(?: \(cumulative\))?$/iu.test(trimmed) ||
      /^## Essential user prompts \/ commands \+ arguments used$/iu.test(trimmed) ||
      /^### User prompts in this turn$/iu.test(trimmed) ||
      /^## Last assistant message \(verbatim\)$/iu.test(trimmed)
    ) {
      skipMode = /^## Last assistant message/iu.test(trimmed) ? "assistant" : "section";
      continue;
    }
    if (skipMode === "assistant") {
      if (
        /^## Files touched(?: \(cumulative\))?$/iu.test(trimmed) ||
        /^## Essential user prompts \/ commands \+ arguments used$/iu.test(trimmed) ||
        /^### User prompts in this turn$/iu.test(trimmed)
      ) {
        skipMode = "section";
      }
      continue;
    }
    if (skipMode === "section") {
      if (/^#{1,6}\s+/u.test(trimmed) || trimmed === "---") {
        skipMode = undefined;
        if (trimmed !== "---") out.push(lines[index]);
      }
      continue;
    }
    out.push(lines[index]);
  }

  return out.join("\n").replace(/\n{3,}/gu, "\n\n").trim();
}

export function cleanSummaryBody(value) {
  return stripLegacyManagedBlocks(stripManagedBlocks(value) ?? value);
}

function evidenceRefWarnings(summary) {
  const warnings = [];
  for (const match of normalizeText(summary).matchAll(/\bevidence=([^\s|]+)/giu)) {
    if (!/^[A-Za-z0-9._:-]+$/u.test(match[1])) {
      warnings.push(`Malformed evidence reference '${match[1]}'`);
    }
  }
  return warnings;
}

export function validateCompactionSummary(summary, options = {}) {
  const text = normalizeText(summary);
  const maxChars = Number.isFinite(options.maxChars)
    ? Math.max(0, Math.floor(options.maxChars))
    : 32_000;
  const errors = [];
  const warnings = [];

  if (!text) errors.push("Summary is empty");
  if (text.length > maxChars) {
    errors.push(`Summary exceeds hard cap (${text.length} > ${maxChars} characters)`);
  }
  if (!ORIENTATION_HEADING_RE.test(text)) {
    errors.push("Summary is missing its continuation-orientation section");
  }
  if (!NEXT_ACTION_HEADING_RE.test(text)) {
    errors.push("Summary is missing its next-action section");
  }
  if (containsPotentialSecret(text)) {
    errors.push("Summary contains a high-confidence credential shape");
  }

  const blocks = decodeManagedBlocks(text);
  const types = new Set(blocks.map((block) => block.type));
  for (const type of types) {
    const count = countManagedBlocks(text, type);
    if (count > 1) errors.push(`Summary contains ${count} managed '${type}' blocks`);
  }
  for (const block of blocks) {
    for (const record of block.records) {
      if (record.checksumValid !== true) {
        errors.push(`Managed record '${record.id ?? "unknown"}' failed checksum validation`);
      }
    }
  }
  warnings.push(...evidenceRefWarnings(text));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    chars: text.length,
    managedBlockTypes: [...types],
  };
}

export function fitTextToCharBudget(text, maxChars, options = {}) {
  const normalized = normalizeText(text);
  const limit = Math.max(0, Math.floor(maxChars));
  if (normalized.length <= limit) {
    return { text: normalized, truncated: false, originalChars: normalized.length };
  }
  if (limit === 0) {
    return { text: "", truncated: normalized.length > 0, originalChars: normalized.length };
  }
  const marker = options.marker ?? "\n\n[... body omitted to satisfy hard cap ...]\n\n";
  if (marker.length >= limit) {
    return { text: marker.slice(0, limit), truncated: true, originalChars: normalized.length };
  }
  const available = limit - marker.length;
  const tailChars = Math.floor(available * 0.25);
  const headChars = available - tailChars;
  return {
    text: `${normalized.slice(0, headChars)}${marker}${normalized.slice(
      normalized.length - tailChars,
    )}`,
    truncated: true,
    originalChars: normalized.length,
  };
}

function orderedManagedBlocks(blocks) {
  const list = (Array.isArray(blocks) ? blocks : [])
    .filter((block) => normalizeText(block?.text))
    .map((block) => ({
      type: block.type ?? "unknown",
      text: normalizeText(block.text),
      priority: Number.isFinite(block.priority)
        ? block.priority
        : Math.max(0, MANAGED_TYPE_PRIORITY.length - MANAGED_TYPE_PRIORITY.indexOf(block.type)),
      required: block.required === true,
    }));
  return list.sort((left, right) => {
    const leftIndex = MANAGED_TYPE_PRIORITY.indexOf(left.type);
    const rightIndex = MANAGED_TYPE_PRIORITY.indexOf(right.type);
    const normalizedLeft = leftIndex < 0 ? MANAGED_TYPE_PRIORITY.length : leftIndex;
    const normalizedRight = rightIndex < 0 ? MANAGED_TYPE_PRIORITY.length : rightIndex;
    return (
      Number(right.required) - Number(left.required) ||
      normalizedLeft - normalizedRight ||
      right.priority - left.priority
    );
  });
}

function selectManagedBlocks(blocks, availableChars) {
  const selected = [];
  const omitted = [];
  let usedChars = 0;
  for (const block of orderedManagedBlocks(blocks)) {
    const cost = block.text.length + 2;
    if (usedChars + cost <= availableChars) {
      selected.push(block);
      usedChars += cost;
    } else {
      omitted.push(block.type);
    }
  }
  return { selected, omitted, usedChars };
}

function candidateBody(modelBody, fallbackBody, maxBodyChars) {
  const sanitizedModel = sanitizeDisplayText(cleanSummaryBody(modelBody), {
    maxChars: maxBodyChars * 2,
  }).text;
  const modelValidation = validateCompactionSummary(sanitizedModel, {
    maxChars: maxBodyChars,
  });
  if (modelValidation.ok) return { body: sanitizedModel, mode: "model" };

  const sanitizedFallback = sanitizeDisplayText(cleanSummaryBody(fallbackBody), {
    maxChars: maxBodyChars,
  }).text;
  const fallbackValidation = validateCompactionSummary(sanitizedFallback, {
    maxChars: maxBodyChars,
  });
  if (fallbackValidation.ok) return { body: sanitizedFallback, mode: "deterministic_fallback" };

  const fitted = fitTextToCharBudget(sanitizedFallback, maxBodyChars);
  return {
    body: fitted.text,
    mode: "deterministic_fallback_truncated",
  };
}

export function assembleBoundedSummary(input = {}) {
  const maxChars = Number.isFinite(input.maxChars)
    ? Math.max(512, Math.floor(input.maxChars))
    : 32_000;
  const blocks = orderedManagedBlocks(input.managedBlocks);
  const managedDemand = blocks.reduce((sum, block) => sum + block.text.length + 2, 0);
  const maximumManagedShare = Math.floor(maxChars * 0.48);
  const reservedManagedChars = Math.min(managedDemand, maximumManagedShare);
  const maxBodyChars = Math.max(384, maxChars - reservedManagedChars - 2);
  let selectedBody = candidateBody(input.modelBody, input.fallbackBody, maxBodyChars);

  if (selectedBody.body.length > maxBodyChars) {
    selectedBody = candidateBody(undefined, input.fallbackBody, maxBodyChars);
  }
  const managed = selectManagedBlocks(blocks, Math.max(0, maxChars - selectedBody.body.length - 2));
  let summary = [selectedBody.body, ...managed.selected.map((block) => block.text)]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (summary.length > maxChars) {
    selectedBody = candidateBody(
      undefined,
      input.fallbackBody,
      Math.max(384, maxChars - managed.usedChars - 2),
    );
    summary = [selectedBody.body, ...managed.selected.map((block) => block.text)]
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  return {
    summary,
    mode: selectedBody.mode,
    omittedManagedBlocks: managed.omitted,
    selectedManagedBlocks: managed.selected.map((block) => block.type),
  };
}


function minimalEmergencyBody() {
  return [
    "## Self-contained continuation snapshot",
    "- Guarded compaction could not preserve a validated detailed body.",
    "- Treat this checkpoint as continuity context only; verify all current state from retained context and owner sources.",
    "",
    "## Next action",
    "1. Read the retained recent context.",
    "2. Verify current git, task, and validation state.",
    "3. Continue only from observed evidence.",
  ].join("\n");
}

export function repairAndValidateSummary(input = {}) {
  const assembled = assembleBoundedSummary(input);
  let validation = validateCompactionSummary(assembled.summary, {
    maxChars: input.maxChars,
  });
  if (validation.ok) return { ...assembled, validation };

  const fallbackOnly = assembleBoundedSummary({
    ...input,
    modelBody: undefined,
  });
  validation = validateCompactionSummary(fallbackOnly.summary, {
    maxChars: input.maxChars,
  });
  if (validation.ok) {
    return {
      ...fallbackOnly,
      mode: "deterministic_repair",
      validation,
    };
  }

  const emergency = assembleBoundedSummary({
    ...input,
    modelBody: minimalEmergencyBody(),
    fallbackBody: minimalEmergencyBody(),
  });
  const emergencyValidation = validateCompactionSummary(emergency.summary, {
    maxChars: input.maxChars,
  });
  return {
    ...emergency,
    mode: emergencyValidation.ok ? "minimal_emergency_repair" : "minimal_emergency_invalid",
    validation: emergencyValidation,
  };
}
