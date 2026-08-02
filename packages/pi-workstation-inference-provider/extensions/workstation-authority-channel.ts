import { read, write } from "node:fs";
import {
  type AuthorityDisposition,
  authorityMessage,
  canonicalAuthorityJson,
  DISPATCH_PERMIT_MAX_AGE_MS,
  type DispatchPermit,
  exactCanonicalAuthorityEcho,
  type JsonRecord,
  parseArmBinding,
  parseDispatchPermit,
  type TerminalProviderClass,
  verifyWorkbenchAuthoritySchemaDigest,
  WORKBENCH_AUTHORITY_FD_ENV,
  WORKBENCH_AUTHORITY_SCHEMA,
  type WorkbenchTurnBinding,
} from "./workstation-authority-contract.ts";

export {
  type AuthorityDisposition,
  DISPATCH_PERMIT_MAX_AGE_MS,
  type DispatchPermit,
  deriveDispatchPermitId,
  type TerminalProviderClass,
  verifyWorkbenchAuthoritySchemaDigest,
  WORKBENCH_AUTHORITY_FD_ENV,
  WORKBENCH_AUTHORITY_SCHEMA,
  WORKBENCH_AUTHORITY_SCHEMA_DIGEST,
  WORKBENCH_AUTHORITY_SCHEMA_ID,
  WORKBENCH_BROKER_PROTOCOL,
  WORKBENCH_BROKER_SCHEMA_DIGEST,
  WORKBENCH_MODEL_ID,
  WORKBENCH_PROFILE_ID,
  WORKBENCH_PROVIDER_ID,
  WORKBENCH_STEP_ID,
  type WorkbenchTurnBinding,
} from "./workstation-authority-contract.ts";

const MAX_AUTHORITY_PACKET_BYTES = 4096;
const DEFAULT_ACKNOWLEDGEMENT_TIMEOUT_MS = 5_000;
const AUTHORITY_DISPOSITIONS = new Set<AuthorityDisposition>(
  WORKBENCH_AUTHORITY_SCHEMA.messages.report_disposition.dispositions,
);
const TERMINAL_PROVIDER_CLASSES = new Set<TerminalProviderClass>(
  WORKBENCH_AUTHORITY_SCHEMA.messages.report_disposition.terminal_provider_classes,
);

export type InheritedAuthorityTransport = {
  /** Receive broker-supplied arm_turn and acknowledge it with the same canonical frame. */
  receiveArm(): Promise<Readonly<JsonRecord>>;
  /** Exchange one canonical request for its owner-defined acknowledgement or permit. */
  exchange(message: Readonly<JsonRecord>): Promise<Readonly<JsonRecord>>;
};

type AuthorityClock = {
  wallNowMs(): number;
  monotonicNowMs(): number;
};

function withAcknowledgementDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("inherited authority acknowledgement deadline expired")),
      timeoutMs,
    );
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * One-turn, non-reconnectable authority membrane for a broker-owned Pi child.
 * It consumes owner-issued permits but exposes no scheduler or lifecycle operation.
 */
export class WorkbenchInheritedAuthorityChannel {
  readonly #transport: InheritedAuthorityTransport;
  readonly #acknowledgementTimeoutMs: number;
  readonly #clock: AuthorityClock;
  #binding?: WorkbenchTurnBinding;
  #permit?: DispatchPermit;
  #permitIssuedAtMs?: number;
  #permitExpiresAtMs?: number;
  #permitReceivedMonotonicMs?: number;
  #permitMonotonicDeadlineMs?: number;
  #state: "idle" | "armed" | "permitted" | "expired" | "dispatched" | "blocked" | "reported" =
    "idle";
  #dispatchCount = 0;

  constructor(
    transport: InheritedAuthorityTransport,
    options: {
      acknowledgementTimeoutMs?: number;
      wallNowMs?: () => number;
      monotonicNowMs?: () => number;
    } = {},
  ) {
    verifyWorkbenchAuthoritySchemaDigest();
    const timeoutMs = options.acknowledgementTimeoutMs ?? DEFAULT_ACKNOWLEDGEMENT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 5_000) {
      throw new Error("inherited authority acknowledgement timeout is invalid");
    }
    this.#transport = transport;
    this.#acknowledgementTimeoutMs = timeoutMs;
    this.#clock = {
      wallNowMs: options.wallNowMs ?? Date.now,
      monotonicNowMs: options.monotonicNowMs ?? (() => performance.now()),
    };
  }

  get state(): string {
    return this.#state;
  }

  get binding(): Readonly<WorkbenchTurnBinding> | undefined {
    return this.#binding;
  }

  get dispatchCount(): number {
    return this.#dispatchCount;
  }

  async arm(): Promise<Readonly<WorkbenchTurnBinding>> {
    if (this.#state !== "idle") throw new Error("inherited authority turn is not armable");
    this.#state = "blocked";
    let message: Readonly<JsonRecord>;
    try {
      message = await withAcknowledgementDeadline(
        this.#transport.receiveArm(),
        this.#acknowledgementTimeoutMs,
      );
    } catch {
      throw new Error("turn arm outcome is indeterminate; retry is forbidden");
    }
    const binding = parseArmBinding(message);
    this.#binding = binding;
    this.#state = "armed";
    return binding;
  }

  async authorizeDispatch(): Promise<void> {
    if (this.#state !== "armed" || !this.#binding) {
      throw new Error("inherited authority turn is not armed");
    }
    const request = authorityMessage(this.#binding, "authorize_dispatch");
    this.#state = "blocked";
    let response: Readonly<JsonRecord>;
    try {
      response = await withAcknowledgementDeadline(
        this.#transport.exchange(request),
        this.#acknowledgementTimeoutMs,
      );
    } catch {
      throw new Error("dispatch authorization outcome is indeterminate; dispatch is forbidden");
    }
    const parsed = parseDispatchPermit(response, this.#binding);
    const wallNowMs = this.#clock.wallNowMs();
    const monotonicNowMs = this.#clock.monotonicNowMs();
    if (
      !Number.isFinite(wallNowMs) ||
      !Number.isFinite(monotonicNowMs) ||
      wallNowMs < parsed.issuedAtMs ||
      wallNowMs >= parsed.expiresAtMs
    ) {
      throw new Error("dispatch permit is stale or future-dated");
    }
    const remainingMs = parsed.expiresAtMs - wallNowMs;
    this.#permit = parsed.permit;
    this.#permitIssuedAtMs = parsed.issuedAtMs;
    this.#permitExpiresAtMs = parsed.expiresAtMs;
    this.#permitReceivedMonotonicMs = monotonicNowMs;
    this.#permitMonotonicDeadlineMs =
      monotonicNowMs + Math.min(DISPATCH_PERMIT_MAX_AGE_MS, remainingMs);
    this.#state = "permitted";
  }

  consumeDispatchPermitAtProviderWrite(): void {
    if (
      this.#state !== "permitted" ||
      !this.#permit ||
      this.#permitIssuedAtMs === undefined ||
      this.#permitExpiresAtMs === undefined ||
      this.#permitReceivedMonotonicMs === undefined ||
      this.#permitMonotonicDeadlineMs === undefined ||
      this.#dispatchCount !== 0
    ) {
      throw new Error("provider dispatch permit is not consumable");
    }
    const wallNowMs = this.#clock.wallNowMs();
    const monotonicNowMs = this.#clock.monotonicNowMs();
    if (
      !Number.isFinite(wallNowMs) ||
      !Number.isFinite(monotonicNowMs) ||
      wallNowMs < this.#permitIssuedAtMs ||
      wallNowMs >= this.#permitExpiresAtMs ||
      monotonicNowMs < this.#permitReceivedMonotonicMs ||
      monotonicNowMs >= this.#permitMonotonicDeadlineMs
    ) {
      this.#state = "expired";
      throw new Error("provider dispatch permit expired at the provider write boundary");
    }
    this.#dispatchCount = 1;
    this.#state = "dispatched";
  }

  async reportDisposition(
    disposition: AuthorityDisposition,
    terminalProviderClass: TerminalProviderClass,
  ): Promise<void> {
    if (
      !AUTHORITY_DISPOSITIONS.has(disposition) ||
      !TERMINAL_PROVIDER_CLASSES.has(terminalProviderClass)
    ) {
      this.#state = "blocked";
      throw new Error("inherited authority disposition is invalid");
    }
    if (!this.#binding || !["armed", "permitted", "expired", "dispatched"].includes(this.#state)) {
      throw new Error("inherited authority disposition is not reportable");
    }
    if (disposition === "not_dispatched" ? this.#dispatchCount !== 0 : this.#dispatchCount !== 1) {
      this.#state = "blocked";
      throw new Error("inherited authority disposition contradicts dispatch count");
    }
    if (
      (disposition === "not_dispatched" && terminalProviderClass !== "none") ||
      (disposition !== "not_dispatched" && terminalProviderClass === "none")
    ) {
      this.#state = "blocked";
      throw new Error("terminal provider class contradicts disposition");
    }
    const request = {
      ...this.#binding,
      kind: "report_disposition",
      disposition,
      dispatch_count: this.#dispatchCount,
      terminal_provider_class: terminalProviderClass,
    };
    this.#state = "blocked";
    let response: Readonly<JsonRecord>;
    try {
      response = await withAcknowledgementDeadline(
        this.#transport.exchange(request),
        this.#acknowledgementTimeoutMs,
      );
    } catch {
      throw new Error("disposition report outcome is indeterminate; retry is forbidden");
    }
    exactCanonicalAuthorityEcho(response, request);
    this.#state = "reported";
  }
}

function rejectDuplicateTopLevelKeys(text: string): void {
  const keys = new Set<string>();
  let depth = 0;
  let expectRootKey = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      let end = index + 1;
      for (; end < text.length; end += 1) {
        if (text[end] === "\\") {
          end += 1;
        } else if (text[end] === '"') {
          break;
        }
      }
      if (end >= text.length) throw new Error("inherited authority JSON string is unterminated");
      if (depth === 1 && expectRootKey) {
        const key = JSON.parse(text.slice(index, end + 1));
        if (typeof key !== "string" || keys.has(key)) {
          throw new Error("inherited authority JSON contains a duplicate key");
        }
        keys.add(key);
        let colon = end + 1;
        while (/\s/.test(text[colon] ?? "")) colon += 1;
        if (text[colon] !== ":") throw new Error("inherited authority JSON key lacks a colon");
        expectRootKey = false;
      }
      index = end;
      continue;
    }
    if (character === "{") {
      depth += 1;
      if (depth === 1) expectRootKey = true;
    } else if (character === "}") {
      depth -= 1;
    } else if (character === "," && depth === 1) {
      expectRootKey = true;
    }
  }
}

export function decodeWorkbenchAuthorityPacket(text: string): Readonly<JsonRecord> {
  if (!text || Buffer.byteLength(text) > MAX_AUTHORITY_PACKET_BYTES) {
    throw new Error("inherited authority packet is missing or oversized");
  }
  rejectDuplicateTopLevelKeys(text);
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("inherited authority packet is not an object");
  }
  return value as JsonRecord;
}

function readPacket(fd: number): Promise<Readonly<JsonRecord>> {
  return new Promise((resolve, reject) => {
    const packet = Buffer.alloc(MAX_AUTHORITY_PACKET_BYTES + 1);
    read(fd, packet, 0, packet.length, null, (error, bytesRead) => {
      if (error || bytesRead <= 0 || bytesRead > MAX_AUTHORITY_PACKET_BYTES) {
        reject(error ?? new Error("inherited authority packet is missing or oversized"));
        return;
      }
      try {
        const text = packet.subarray(0, bytesRead).toString("utf8");
        resolve(decodeWorkbenchAuthorityPacket(text));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function writePacket(fd: number, message: Readonly<JsonRecord>): Promise<void> {
  const packet = Buffer.from(canonicalAuthorityJson(message));
  if (packet.length > MAX_AUTHORITY_PACKET_BYTES) {
    return Promise.reject(new Error("inherited authority packet exceeds maximum"));
  }
  return new Promise((resolve, reject) => {
    write(fd, packet, 0, packet.length, (error, bytesWritten) => {
      if (error || bytesWritten !== packet.length) {
        reject(error ?? new Error("inherited authority packet write is incomplete"));
      } else {
        resolve();
      }
    });
  });
}

export function inheritedAuthorityTransportFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): InheritedAuthorityTransport {
  const raw = env[WORKBENCH_AUTHORITY_FD_ENV]?.trim();
  if (!raw || !/^(?:[3-9]|[1-9]\d+)$/.test(raw)) {
    throw new Error("broker-owned inherited authority descriptor is unavailable");
  }
  const fd = Number(raw);
  if (!Number.isSafeInteger(fd)) {
    throw new Error("broker-owned inherited authority descriptor is invalid");
  }
  return {
    async receiveArm() {
      const message = await readPacket(fd);
      parseArmBinding(message);
      await writePacket(fd, message);
      return message;
    },
    async exchange(message) {
      await writePacket(fd, message);
      return readPacket(fd);
    },
  };
}
