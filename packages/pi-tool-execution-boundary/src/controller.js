import { BoundaryError } from "./errors.js";
import { verifyLeaseBinding } from "./attestation.js";
import { BoundedD0AuditQueue } from "./d0-audit.js";
import { ByteString, deepFreeze } from "./util.js";

const TERMINAL_STATES = new Set([
  "TERMINAL_KNOWN",
  "TERMINAL_UNKNOWN",
  "TERMINAL_CANCELLED_KNOWN",
  "CANCELLED_PRE_EFFECT",
]);
const PROCESS_CELL_KINDS = new Set(["grep", "find", "exec"]);
const DURABLE_NONTERMINAL_STATES = new Set([
  "ADMITTED",
  "QUEUED",
  "STARTED",
  "CANCEL_REQUESTED",
]);

function defaultClock() {
  return { nowMs: () => Date.now() };
}

function requiresDescendantProof(operationKind) {
  return PROCESS_CELL_KINDS.has(operationKind);
}

function validatePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BoundaryError("INVALID_CONTROLLER_LIMIT", `${label} must be a positive safe integer`);
  }
  return value;
}

function dispositionForKnown(call, {
  success,
  outputCompleteness,
  workspaceMutation,
  workspaceGenerationAfter,
  cancelled = false,
}) {
  const d1 = call.admitted.durability === "D1-workspace-effect";
  return deepFreeze({
    processExit: call.processBacked ? "known" : "not-started",
    workspaceMutation,
    networkDispatch: "none",
    externalOutcome: "none",
    outputCompleteness,
    descendants: call.descendantsEmpty ? "empty" : "unknown",
    journal: d1 ? "durable" : "not-required",
    retrySafety:
      workspaceMutation === "none" && !d1
        ? "safe"
        : workspaceMutation === "none" && cancelled
          ? "safe"
          : "unsafe",
    success: Boolean(success),
    cancelled,
    workspaceGenerationBefore: call.admitted.workspaceGeneration,
    workspaceGenerationAfter,
    reasons: [],
  });
}

export class BoundaryController {
  #lease;
  #calls = new Map();
  #workspaceGeneration;
  #mutationOwner;
  #activeReaders = new Set();
  #d1Authority;
  #audit;
  #clock;
  #outputWindowBytes;
  #maxChunkBytes;
  #maxOutputBytes;

  constructor({
    attestedLease,
    expectedLeaseBinding,
    d1Authority,
    d0Audit,
    clock = defaultClock(),
    initialOutputCredits = 1_048_576,
    maxChunkBytes = 65_536,
  }) {
    this.#lease = verifyLeaseBinding(attestedLease, expectedLeaseBinding);
    this.#workspaceGeneration = Number(expectedLeaseBinding.workspaceGeneration ?? 1);
    if (!Number.isSafeInteger(this.#workspaceGeneration) || this.#workspaceGeneration < 1) {
      throw new BoundaryError("INVALID_WORKSPACE_GENERATION", "Initial workspace generation is invalid");
    }
    this.#outputWindowBytes = validatePositiveInteger(
      initialOutputCredits,
      "initialOutputCredits",
    );
    this.#maxChunkBytes = validatePositiveInteger(maxChunkBytes, "maxChunkBytes");
    if (this.#maxChunkBytes > this.#outputWindowBytes) {
      throw new BoundaryError(
        "INVALID_OUTPUT_WINDOW",
        "maxChunkBytes cannot exceed initialOutputCredits",
      );
    }
    this.#maxOutputBytes = validatePositiveInteger(
      expectedLeaseBinding.outputBytes ?? 33_554_432,
      "expectedLeaseBinding.outputBytes",
    );
    this.#d1Authority = d1Authority;
    this.#audit = d0Audit ?? new BoundedD0AuditQueue();
    this.#clock = clock;

    if (this.#d1Authority) {
      const persisted = this.#d1Authority.registerLease({
        leaseId: this.#lease.leaseId,
        attestationDigest: this.#lease.attestationDigest,
        semanticPlanDigest: this.#lease.semanticPlanDigest,
        effectivePolicyDigest: this.#lease.effectivePolicyDigest,
        tcbGenerationDigest: this.#lease.tcbGenerationDigest,
        workspaceGeneration: this.#workspaceGeneration,
      });
      if (persisted.workspaceGeneration !== this.#workspaceGeneration) {
        throw new BoundaryError(
          "LEASE_GENERATION_MISMATCH",
          "Persisted lease generation does not match the requested controller generation",
          {
            expected: this.#workspaceGeneration,
            persisted: persisted.workspaceGeneration,
          },
        );
      }
      if (persisted.state !== "READY") {
        this.#lease = deepFreeze({ ...this.#lease, state: persisted.state });
      }
    }
  }

  get status() {
    return deepFreeze({
      schema: "pi-tool-boundary-controller-status/v1",
      leaseId: this.#lease.leaseId,
      leaseState: this.#leaseState(),
      workspaceGeneration: this.#workspaceGeneration,
      mutationOwner: this.#mutationOwner ?? null,
      activeReaders: this.#activeReaders.size,
      calls: this.#calls.size,
      d0Audit: this.#audit.snapshot(),
      backendAttested: true,
      realExecutionEnabled: false,
    });
  }

  admit(admitted) {
    this.#assertLeaseReady();
    if (admitted.leaseId !== this.#lease.leaseId) {
      throw new BoundaryError("LEASE_ID_MISMATCH", "Call is bound to a different lease");
    }

    const inMemory = this.#calls.get(admitted.callId);
    if (inMemory) {
      if (inMemory.admitted.requestDigest !== admitted.requestDigest) {
        throw new BoundaryError(
          "CALL_DUPLICATE_MISMATCH",
          `Call ${admitted.callId} already exists with a different digest`,
        );
      }
      return this.#snapshot(inMemory);
    }

    if (admitted.durability === "D1-workspace-effect") {
      if (!this.#d1Authority) {
        throw new BoundaryError(
          "D1_AUTHORITY_UNAVAILABLE",
          "D1 operations require durable authority; no fallback is permitted",
        );
      }
      const durable = this.#d1Authority.admitD1(admitted);
      if (durable.requestDigest !== admitted.requestDigest) {
        throw new BoundaryError(
          "D1_AUTHORITY_MISMATCH",
          "Durable authority returned a mismatched call",
        );
      }
      if (durable.created === false) {
        if (DURABLE_NONTERMINAL_STATES.has(durable.state)) {
          throw new BoundaryError(
            "D1_RECOVERY_REQUIRED",
            `Durable call ${admitted.callId} is ${durable.state}; recovery must run before reuse`,
          );
        }
        const restored = this.#restoreDurableCall(admitted, durable);
        this.#calls.set(admitted.callId, restored);
        return this.#snapshot(restored);
      }
    } else if (admitted.workspaceGeneration !== this.#workspaceGeneration) {
      throw new BoundaryError(
        "WORKSPACE_STALE",
        "Call was admitted against a stale workspace generation",
        {
          admitted: admitted.workspaceGeneration,
          current: this.#workspaceGeneration,
        },
      );
    }

    if (admitted.workspaceGeneration !== this.#workspaceGeneration) {
      throw new BoundaryError(
        "WORKSPACE_STALE",
        "Call was admitted against a stale workspace generation",
        {
          admitted: admitted.workspaceGeneration,
          current: this.#workspaceGeneration,
        },
      );
    }

    const call = this.#createCallState(admitted);
    this.#calls.set(admitted.callId, call);
    return this.#snapshot(call);
  }

  queue(callId) {
    const call = this.#requireCall(callId);
    if (call.state === "QUEUED") return this.#snapshot(call);
    if (call.state !== "ADMITTED") {
      throw new BoundaryError(
        "INVALID_CALL_TRANSITION",
        `Cannot queue ${callId} from ${call.state}`,
      );
    }
    if (call.admitted.durability === "D1-workspace-effect") {
      this.#d1Authority.markQueued(callId);
    }
    call.state = "QUEUED";
    return this.#snapshot(call);
  }

  start(callId) {
    this.#assertLeaseReady();
    const call = this.#requireCall(callId);
    if (call.state === "STARTED") return this.#snapshot(call);
    if (call.state !== "ADMITTED" && call.state !== "QUEUED") {
      throw new BoundaryError(
        "INVALID_CALL_TRANSITION",
        `Cannot start ${callId} from ${call.state}`,
      );
    }
    if (call.admitted.expectedWorkspaceGeneration !== this.#workspaceGeneration) {
      throw new BoundaryError(
        "WORKSPACE_STALE",
        "Workspace changed while the call was queued",
        {
          expected: call.admitted.expectedWorkspaceGeneration,
          current: this.#workspaceGeneration,
        },
      );
    }

    if (call.admitted.effect === "read") {
      if (this.#mutationOwner) {
        throw new BoundaryError(
          "WORKSPACE_MUTATION_BUSY",
          `Workspace mutation token is owned by ${this.#mutationOwner}`,
        );
      }
    } else {
      if (this.#mutationOwner && this.#mutationOwner !== callId) {
        throw new BoundaryError(
          "WORKSPACE_MUTATION_BUSY",
          `Workspace mutation token is owned by ${this.#mutationOwner}`,
        );
      }
      if (this.#activeReaders.size > 0) {
        throw new BoundaryError(
          "WORKSPACE_READS_ACTIVE",
          "A mutation cannot start while workspace reads are active",
          { activeReaders: [...this.#activeReaders] },
        );
      }
    }

    if (call.admitted.durability === "D1-workspace-effect") {
      this.#d1Authority.markStarted(callId);
    }
    if (call.admitted.effect === "read") this.#activeReaders.add(callId);
    else this.#mutationOwner = callId;

    call.state = "STARTED";
    call.startedAtMs = this.#clock.nowMs();
    call.descendantsEmpty = !call.processBacked;
    return this.#snapshot(call);
  }

  noteDescendantsEmpty(callId) {
    const call = this.#requireCall(callId);
    if (call.state !== "STARTED" && call.state !== "CANCEL_REQUESTED") {
      throw new BoundaryError(
        "INVALID_CALL_TRANSITION",
        "Descendant proof requires a started or cancelling call",
      );
    }
    if (!call.processBacked) {
      throw new BoundaryError(
        "DESCENDANT_PROOF_NOT_APPLICABLE",
        "This operation has no process cell",
      );
    }
    call.descendantsEmpty = true;
    return this.#snapshot(call);
  }

  emitOutput(callId, stream, bytes) {
    const call = this.#requireCall(callId);
    if (call.state !== "STARTED" && call.state !== "CANCEL_REQUESTED") {
      throw new BoundaryError(
        "INVALID_CALL_TRANSITION",
        "Output requires a started or cancelling call",
      );
    }
    this.#assertStream(stream);
    const chunk = Buffer.from(bytes);
    if (chunk.length < 1 || chunk.length > this.#maxChunkBytes) {
      throw new BoundaryError(
        "OUTPUT_CHUNK_TOO_LARGE",
        `Output chunk must be within 1..${this.#maxChunkBytes} bytes`,
      );
    }
    if (chunk.length > call.outputCredits[stream]) {
      throw new BoundaryError(
        "OUTPUT_CREDIT_EXHAUSTED",
        `No ${stream} output credits remain`,
      );
    }
    const totalOutput = call.outputBytes.stdout + call.outputBytes.stderr;
    if (totalOutput + chunk.length > call.maxOutputBytes) {
      call.outputTruncated = true;
      throw new BoundaryError(
        "CALL_OUTPUT_LIMIT_EXCEEDED",
        `Call output exceeds ${call.maxOutputBytes} bytes`,
      );
    }

    const sequence = call.nextOutputSequence[stream];
    call.nextOutputSequence[stream] += 1;
    call.outputCredits[stream] -= chunk.length;
    call.outputBytes[stream] += chunk.length;
    call.pendingOutput[stream].set(sequence, chunk.length);
    return deepFreeze({
      schema: "pi-tool-boundary-output-chunk/v1",
      callId,
      stream,
      sequence,
      data: new ByteString(chunk),
      truncated: false,
    });
  }

  grantOutputCredit(callId, stream, additionalBytes, throughSequence) {
    const call = this.#requireCall(callId);
    if (call.state !== "STARTED" && call.state !== "CANCEL_REQUESTED") {
      throw new BoundaryError(
        "INVALID_CALL_TRANSITION",
        "Output acknowledgement requires a started or cancelling call",
      );
    }
    this.#assertStream(stream);
    if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0) {
      throw new BoundaryError(
        "INVALID_OUTPUT_CREDIT",
        "additionalBytes must be non-negative",
      );
    }
    if (!Number.isSafeInteger(throughSequence) || throughSequence < 1) {
      throw new BoundaryError(
        "INVALID_OUTPUT_ACK",
        "throughSequence must be a positive integer",
      );
    }

    const last = call.lastAcknowledgement[stream];
    if (throughSequence === last.sequence) {
      if (additionalBytes === last.additionalBytes) return this.#snapshot(call);
      throw new BoundaryError(
        "OUTPUT_ACK_REPLAY_MISMATCH",
        "Repeated acknowledgement changed its credit amount",
      );
    }
    if (throughSequence < last.sequence) {
      throw new BoundaryError(
        "OUTPUT_ACK_OUT_OF_ORDER",
        "Output acknowledgements must be monotonic",
      );
    }

    const emittedThrough = call.nextOutputSequence[stream] - 1;
    if (throughSequence > emittedThrough) {
      throw new BoundaryError(
        "INVALID_OUTPUT_ACK",
        `Cannot acknowledge sequence ${throughSequence}; emitted through ${emittedThrough}`,
      );
    }

    let releasable = 0;
    const acknowledgedSequences = [];
    for (const [sequence, length] of call.pendingOutput[stream]) {
      if (sequence <= throughSequence) {
        releasable += length;
        acknowledgedSequences.push(sequence);
      }
    }
    if (releasable < 1 || additionalBytes > releasable) {
      throw new BoundaryError(
        "OUTPUT_ACK_CREDIT_MISMATCH",
        `Acknowledgement may release at most ${releasable} bytes`,
        { throughSequence, additionalBytes, releasable },
      );
    }
    for (const sequence of acknowledgedSequences) {
      call.pendingOutput[stream].delete(sequence);
    }
    call.outputCredits[stream] += additionalBytes;
    if (call.outputCredits[stream] > this.#outputWindowBytes) {
      throw new BoundaryError(
        "OUTPUT_WINDOW_INVARIANT",
        "Output credits exceeded the configured window",
      );
    }
    call.lastAcknowledgement[stream] = {
      sequence: throughSequence,
      additionalBytes,
    };
    return this.#snapshot(call);
  }

  finishKnown(callId, {
    success = true,
    outputCompleteness,
  } = {}) {
    const call = this.#requireCall(callId);
    if (call.state === "TERMINAL_KNOWN") return this.#snapshot(call);
    if (call.state !== "STARTED") {
      throw new BoundaryError(
        "INVALID_CALL_TRANSITION",
        `Cannot finish ${callId} from ${call.state}`,
      );
    }
    this.#requireCleanupProof(call);

    const completeness =
      outputCompleteness ?? (call.outputTruncated ? "partial" : "complete");
    if (completeness !== "complete" && completeness !== "partial") {
      throw new BoundaryError(
        "INVALID_OUTPUT_COMPLETENESS",
        "Output completeness is invalid",
      );
    }

    const workspaceMutation =
      call.admitted.effect === "read" ? "none" : "known";
    const generationAfter =
      workspaceMutation === "known"
        ? this.#workspaceGeneration + 1
        : this.#workspaceGeneration;
    const disposition = dispositionForKnown(call, {
      success,
      outputCompleteness: completeness,
      workspaceMutation,
      workspaceGenerationAfter: generationAfter,
    });

    if (call.admitted.durability === "D1-workspace-effect") {
      this.#d1Authority.finishKnown(callId, { generationAfter, disposition });
    }
    this.#workspaceGeneration = generationAfter;
    this.#releaseOwnership(call);
    call.state = "TERMINAL_KNOWN";
    call.terminalAtMs = this.#clock.nowMs();
    call.disposition = disposition;
    this.#recordD0Audit(call, success);
    return this.#snapshot(call);
  }

  cancel(callId) {
    const call = this.#requireCall(callId);
    if (TERMINAL_STATES.has(call.state)) return this.#snapshot(call);
    if (call.state === "CANCEL_REQUESTED") return this.#snapshot(call);

    if (call.state === "STARTED") {
      if (call.admitted.durability === "D1-workspace-effect") {
        this.#d1Authority.markCancelRequested(callId);
      }
      call.state = "CANCEL_REQUESTED";
      return this.#snapshot(call);
    }

    if (call.state !== "ADMITTED" && call.state !== "QUEUED") {
      throw new BoundaryError(
        "INVALID_CALL_TRANSITION",
        `Cannot cancel ${callId} from ${call.state}`,
      );
    }
    const disposition = deepFreeze({
      processExit: "not-started",
      workspaceMutation: "none",
      networkDispatch: "none",
      externalOutcome: "none",
      outputCompleteness: "complete",
      descendants: "empty",
      journal:
        call.admitted.durability === "D1-workspace-effect"
          ? "durable"
          : "not-required",
      retrySafety: "safe",
      workspaceGenerationBefore: call.admitted.workspaceGeneration,
      workspaceGenerationAfter: this.#workspaceGeneration,
      reasons: ["cancelled-pre-effect"],
    });
    if (call.admitted.durability === "D1-workspace-effect") {
      this.#d1Authority.cancelPreEffect(callId, disposition);
    }
    call.state = "CANCELLED_PRE_EFFECT";
    call.terminalAtMs = this.#clock.nowMs();
    call.disposition = disposition;
    return this.#snapshot(call);
  }

  finishCancelledKnown(callId, {
    workspaceMutation,
    outputCompleteness,
  } = {}) {
    const call = this.#requireCall(callId);
    if (call.state === "TERMINAL_CANCELLED_KNOWN") {
      return this.#snapshot(call);
    }
    if (call.state !== "CANCEL_REQUESTED") {
      throw new BoundaryError(
        "INVALID_CALL_TRANSITION",
        `Cannot finish cancellation for ${callId} from ${call.state}`,
      );
    }
    this.#requireCleanupProof(call);

    const allowedMutation =
      call.admitted.effect === "read"
        ? ["none"]
        : ["none", "known"];
    const mutation = workspaceMutation ?? (call.admitted.effect === "read" ? "none" : "known");
    if (!allowedMutation.includes(mutation)) {
      throw new BoundaryError(
        "INVALID_WORKSPACE_MUTATION_DISPOSITION",
        `Cancellation mutation disposition must be one of: ${allowedMutation.join(", ")}`,
      );
    }
    const completeness =
      outputCompleteness ?? (call.outputTruncated ? "partial" : "complete");
    if (completeness !== "complete" && completeness !== "partial") {
      throw new BoundaryError(
        "INVALID_OUTPUT_COMPLETENESS",
        "Output completeness is invalid",
      );
    }
    const generationAfter =
      mutation === "known"
        ? this.#workspaceGeneration + 1
        : this.#workspaceGeneration;
    const disposition = dispositionForKnown(call, {
      success: false,
      outputCompleteness: completeness,
      workspaceMutation: mutation,
      workspaceGenerationAfter: generationAfter,
      cancelled: true,
    });

    if (call.admitted.durability === "D1-workspace-effect") {
      this.#d1Authority.finishCancelledKnown(callId, {
        generationAfter,
        disposition,
      });
    }
    this.#workspaceGeneration = generationAfter;
    this.#releaseOwnership(call);
    call.state = "TERMINAL_CANCELLED_KNOWN";
    call.terminalAtMs = this.#clock.nowMs();
    call.disposition = disposition;
    this.#recordD0Audit(call, false);
    return this.#snapshot(call);
  }

  finishUnknown(callId, reason = "backend-outcome-unknown") {
    const call = this.#requireCall(callId);
    if (call.state === "TERMINAL_UNKNOWN") return this.#snapshot(call);
    if (call.state === "ADMITTED" || call.state === "QUEUED") {
      return this.cancel(callId);
    }
    if (call.state !== "STARTED" && call.state !== "CANCEL_REQUESTED") {
      throw new BoundaryError(
        "INVALID_CALL_TRANSITION",
        `Cannot mark ${callId} unknown from ${call.state}`,
      );
    }

    const effectful = call.admitted.effect !== "read";
    const cleanupUnknown = call.processBacked && !call.descendantsEmpty;
    const disposition = deepFreeze({
      processExit: call.processBacked ? "unknown" : "not-started",
      workspaceMutation: effectful ? "unknown" : "none",
      networkDispatch: "none",
      externalOutcome: "none",
      outputCompleteness: "unknown",
      descendants: cleanupUnknown ? "unknown" : "empty",
      journal:
        call.admitted.durability === "D1-workspace-effect"
          ? "durable"
          : "not-required",
      retrySafety: effectful ? "operator-decision" : "safe",
      workspaceGenerationBefore: call.admitted.workspaceGeneration,
      reasons: [String(reason)],
    });
    if (call.admitted.durability === "D1-workspace-effect") {
      this.#d1Authority.finishUnknown(callId, disposition);
    }
    if (effectful || cleanupUnknown) {
      this.#lease = deepFreeze({ ...this.#lease, state: "QUARANTINED" });
    }
    this.#releaseOwnership(call);
    call.state = "TERMINAL_UNKNOWN";
    call.terminalAtMs = this.#clock.nowMs();
    call.disposition = disposition;
    this.#recordD0Audit(call, false);
    return this.#snapshot(call);
  }

  getCall(callId) {
    const call = this.#calls.get(callId);
    return call ? this.#snapshot(call) : undefined;
  }

  #createCallState(admitted) {
    const processBacked = requiresDescendantProof(admitted.operation.kind);
    const maxOutputBytes = admitted.effectiveLimits?.outputBytes ?? this.#maxOutputBytes;
    validatePositiveInteger(maxOutputBytes, "admitted.effectiveLimits.outputBytes");
    return {
      admitted,
      state: "ADMITTED",
      admittedAtMs: this.#clock.nowMs(),
      startedAtMs: undefined,
      terminalAtMs: undefined,
      processBacked,
      nextOutputSequence: { stdout: 1, stderr: 1 },
      outputCredits: {
        stdout: this.#outputWindowBytes,
        stderr: this.#outputWindowBytes,
      },
      pendingOutput: {
        stdout: new Map(),
        stderr: new Map(),
      },
      lastAcknowledgement: {
        stdout: { sequence: 0, additionalBytes: 0 },
        stderr: { sequence: 0, additionalBytes: 0 },
      },
      outputBytes: { stdout: 0, stderr: 0 },
      outputTruncated: false,
      maxOutputBytes,
      descendantsEmpty: !processBacked,
      disposition: undefined,
    };
  }

  #restoreDurableCall(admitted, durable) {
    const call = this.#createCallState(admitted);
    call.state = durable.state;
    call.disposition = durable.disposition;
    call.descendantsEmpty = durable.disposition?.descendants === "empty";
    call.terminalAtMs = this.#clock.nowMs();
    return call;
  }

  #recordD0Audit(call, success) {
    if (call.admitted.durability !== "D0-replay-safe-read") return;
    this.#audit.record({
      operation: call.admitted.operation.kind,
      result: success ? "success" : "failure",
      durationMs:
        call.startedAtMs === undefined
          ? 0
          : call.terminalAtMs - call.startedAtMs,
      requestBytes: 0,
      responseBytes: call.outputBytes.stdout + call.outputBytes.stderr,
    });
  }

  #releaseOwnership(call) {
    this.#activeReaders.delete(call.admitted.callId);
    if (this.#mutationOwner === call.admitted.callId) {
      this.#mutationOwner = undefined;
    }
  }

  #requireCleanupProof(call) {
    if (call.processBacked && !call.descendantsEmpty) {
      throw new BoundaryError(
        "CELL_CLEANUP_UNPROVEN",
        "A process-backed call cannot finish until descendant emptiness is proven",
      );
    }
  }

  #assertStream(stream) {
    if (stream !== "stdout" && stream !== "stderr") {
      throw new BoundaryError(
        "INVALID_OUTPUT_STREAM",
        `Unknown output stream: ${stream}`,
      );
    }
  }

  #leaseState() {
    return this.#lease.state ?? "READY";
  }

  #assertLeaseReady() {
    if (this.#leaseState() !== "READY") {
      throw new BoundaryError(
        "LEASE_NOT_READY",
        `Lease ${this.#lease.leaseId} is ${this.#leaseState()}`,
      );
    }
  }

  #requireCall(callId) {
    const call = this.#calls.get(callId);
    if (!call) {
      throw new BoundaryError("CALL_NOT_FOUND", `Call not found: ${callId}`);
    }
    return call;
  }

  #snapshot(call) {
    return deepFreeze({
      schema: "pi-tool-boundary-call-state/v1",
      callId: call.admitted.callId,
      requestDigest: call.admitted.requestDigest,
      operationKind: call.admitted.operation.kind,
      effect: call.admitted.effect,
      durability: call.admitted.durability,
      state: call.state,
      processBacked: call.processBacked,
      workspaceGenerationBefore: call.admitted.workspaceGeneration,
      workspaceGenerationCurrent: this.#workspaceGeneration,
      outputCredits: { ...call.outputCredits },
      outputBytes: { ...call.outputBytes },
      outputTruncated: call.outputTruncated,
      descendantsEmpty: call.descendantsEmpty,
      disposition: call.disposition,
    });
  }
}
