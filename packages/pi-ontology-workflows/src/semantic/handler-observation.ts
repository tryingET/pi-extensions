import { createHash } from "node:crypto";
import { appendSemanticPreflightBlock } from "../adapters/semantic-preflight-format.ts";
import { jcsBytes } from "./prepared-runtime.ts";

export const HANDLER_OBSERVATION_SCHEMA =
  "pi-ontology-workflows.prompt-chain-handler-observation.v0" as const;
export const HANDLER_OBSERVATION_PROTOCOL_REVISION =
  "pi-ontology-workflows-handler-observation-v0-r4" as const;

const REPOSITORY_ID = "pi-extensions" as const;
const COMPONENT_ID = "pi-ontology-workflows" as const;
const PACKAGE_NAME = "@tryinget/pi-ontology-workflows" as const;
const INPUT_DOMAIN = "pi-ontology-workflows.handler-input.v0";
const CONTRIBUTION_DOMAIN = "pi-ontology-workflows.handler-contribution.v0";
const OUTPUT_DOMAIN = "pi-ontology-workflows.handler-output.v0";
const RECORD_DOMAIN = "pi-ontology-workflows.handler-observation-record.v0";

export interface HandlerObservationRecord {
  readonly schema: typeof HANDLER_OBSERVATION_SCHEMA;
  readonly protocol_revision: typeof HANDLER_OBSERVATION_PROTOCOL_REVISION;
  readonly repository_id: typeof REPOSITORY_ID;
  readonly component_id: typeof COMPONENT_ID;
  readonly package_name: typeof PACKAGE_NAME;
  readonly input_prompt_byte_length: number;
  readonly input_prompt_digest: string;
  readonly contribution_byte_length: number;
  readonly contribution_digest: string;
  readonly prepared_return_prompt_byte_length: number;
  readonly prepared_return_prompt_digest: string;
  readonly contribution_start_byte_offset: number;
  readonly contribution_end_byte_offset: number;
  readonly observation_outcome: "package_handler_return_prepared";
  readonly claim_scope: "extension_local_pre_return_only";
  readonly host_acceptance_observed: false;
  readonly host_assignment_observed: false;
  readonly provider_transmission_observed: false;
  readonly model_input_observed: false;
  readonly callback_settlement_observed: false;
  readonly record_digest: string;
}

export interface PromptMeasurement {
  readonly byteLength: number;
  readonly digest: string;
}

export function measurePreparedPrompt(value: string): PromptMeasurement {
  const bytes = utf8Bytes(value);
  return { byteLength: bytes.byteLength, digest: rawDigest(OUTPUT_DOMAIN, bytes) };
}

export function buildHandlerObservationRecord(
  input: Readonly<{
    input: string;
    contribution: string;
    output: string;
  }>,
): HandlerObservationRecord {
  if (
    typeof input.input !== "string" ||
    typeof input.contribution !== "string" ||
    typeof input.output !== "string"
  )
    throw new TypeError("handler observation values must be strings");

  const inputBytes = utf8Bytes(input.input);
  const contributionBytes = utf8Bytes(input.contribution);
  const outputBytes = utf8Bytes(input.output);
  if (contributionBytes.byteLength === 0) throw new Error("handler contribution must be nonempty");
  const expectedOutput = input.input + input.contribution;
  const expectedOutputBytes = utf8Bytes(expectedOutput);
  if (input.output !== expectedOutput || !outputBytes.equals(expectedOutputBytes))
    throw new Error("handler output is not an exact append");

  const recordWithoutDigest = {
    schema: HANDLER_OBSERVATION_SCHEMA,
    protocol_revision: HANDLER_OBSERVATION_PROTOCOL_REVISION,
    repository_id: REPOSITORY_ID,
    component_id: COMPONENT_ID,
    package_name: PACKAGE_NAME,
    input_prompt_byte_length: inputBytes.byteLength,
    input_prompt_digest: rawDigest(INPUT_DOMAIN, inputBytes),
    contribution_byte_length: contributionBytes.byteLength,
    contribution_digest: rawDigest(CONTRIBUTION_DOMAIN, contributionBytes),
    prepared_return_prompt_byte_length: outputBytes.byteLength,
    prepared_return_prompt_digest: rawDigest(OUTPUT_DOMAIN, outputBytes),
    contribution_start_byte_offset: inputBytes.byteLength,
    contribution_end_byte_offset: outputBytes.byteLength,
    observation_outcome: "package_handler_return_prepared" as const,
    claim_scope: "extension_local_pre_return_only" as const,
    host_acceptance_observed: false as const,
    host_assignment_observed: false as const,
    provider_transmission_observed: false as const,
    model_input_observed: false as const,
    callback_settlement_observed: false as const,
  };
  const record = {
    ...recordWithoutDigest,
    record_digest: digest(
      Buffer.concat([
        Buffer.from(RECORD_DOMAIN, "utf8"),
        Buffer.from([0]),
        jcsBytes(recordWithoutDigest),
      ]),
    ),
  };
  return deepFreeze(record);
}

export function domainDigest(domain: string, value: unknown): string {
  return digest(Buffer.concat([Buffer.from(domain, "utf8"), Buffer.from([0]), jcsBytes(value)]));
}

function rawDigest(domain: string, bytes: Buffer): string {
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return digest(Buffer.concat([Buffer.from(domain, "utf8"), Buffer.from([0]), length, bytes]));
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function utf8Bytes(value: string): Buffer {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) throw new Error("invalid Unicode scalar");
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error("invalid Unicode scalar");
    }
  }
  return Buffer.from(value, "utf8");
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export interface PromptAppendResult {
  contribution: string;
  output: string;
}

export type PromptAppendProducer = (input: string, block: string) => Promise<unknown>;
export type ObservationBuilder = (
  input: Parameters<typeof buildHandlerObservationRecord>[0],
) => unknown;

export function validatePromptAppendResult(value: unknown): PromptAppendResult {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new TypeError("prompt append producer result must be an object");
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || !keys.includes("contribution") || !keys.includes("output"))
      throw new TypeError("prompt append producer result has invalid fields");
    const contribution = Object.getOwnPropertyDescriptor(value, "contribution");
    const output = Object.getOwnPropertyDescriptor(value, "output");
    if (
      !contribution ||
      !("value" in contribution) ||
      typeof contribution.value !== "string" ||
      !output ||
      !("value" in output) ||
      typeof output.value !== "string"
    )
      throw new TypeError("prompt append producer result fields must be string data properties");
    return { contribution: contribution.value, output: output.value };
  } catch (error) {
    throw new TypeError("prompt append producer result is malformed", { cause: error });
  }
}

export async function defaultPromptAppendProducer(
  input: string,
  block: string,
): Promise<PromptAppendResult> {
  const contribution = `\n\n${block}`;
  const output = appendSemanticPreflightBlock(input, block);
  return { contribution, output };
}

export function tryBuildRecord(
  builder: ObservationBuilder,
  input: string,
  result: PromptAppendResult,
): HandlerObservationRecord | undefined {
  try {
    const values = Object.freeze({
      input,
      contribution: result.contribution,
      output: result.output,
    });
    const expected = buildHandlerObservationRecord(values);
    const candidate = builder(values);
    return isExactCanonicalRecord(candidate, expected) ? expected : undefined;
  } catch {
    return undefined;
  }
}

function isExactCanonicalRecord(value: unknown, expected: HandlerObservationRecord): boolean {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !Object.isFrozen(value)
  )
    return false;
  const actualKeys = Reflect.ownKeys(value);
  const expectedKeys = Reflect.ownKeys(expected);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  )
    return false;
  return expectedKeys.every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor !== undefined &&
      "value" in descriptor &&
      descriptor.enumerable === true &&
      descriptor.configurable === false &&
      descriptor.writable === false &&
      Object.is(descriptor.value, expected[key as keyof HandlerObservationRecord])
    );
  });
}
