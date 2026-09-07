import { digest, refuse } from "./json.js";
/** Allocated before any SDK construction. Never clears denial, even after SDK error conversion. */
export class DispatchGuard {
  #denial: string | undefined;
  #phase = "locked";
  #deadline = 0;
  #started = false;
  #incarnation: string;
  #profile: string;
  constructor(incarnation: string, profile: string) {
    this.#incarnation = incarnation;
    this.#profile = profile;
  }
  deny(reason: string): never {
    this.#denial ??= reason;
    this.#phase = "denied";
    return refuse(this.#denial);
  }
  stop(reason = "stopped"): void {
    this.#denial ??= reason;
    this.#phase = "denied";
  }
  prepared(): void {
    if (this.#phase !== "locked" || this.#denial) this.deny("invalid_prepare");
    this.#phase = "prepared";
  }
  admitted(deadline: number): void {
    if (
      this.#phase !== "prepared" ||
      this.#denial ||
      !Number.isSafeInteger(deadline) ||
      deadline <= Date.now()
    )
      this.deny("invalid_admission");
    this.#deadline = deadline;
    this.#phase = "admitted_pending_close";
  }
  closed(): void {
    if (this.#phase !== "admitted_pending_close" || this.#denial) this.deny("invalid_closed");
    this.#phase = "closed";
  }
  begin(): void {
    if (this.#phase !== "closed" || this.#started || this.#denial) this.deny("invalid_ingress");
    this.#started = true;
    this.#phase = "active";
    this.assert();
  }
  assert(incarnation = this.#incarnation, profile = this.#profile): void {
    if (this.#denial || this.#phase !== "active" || !this.#started)
      this.deny(this.#denial ?? "dispatch_not_admitted");
    if (incarnation !== this.#incarnation || profile !== this.#profile)
      this.deny("dispatch_identity_drift");
    if (Date.now() >= this.#deadline) this.deny("dispatch_deadline");
  }
  get status() {
    return Object.freeze({
      phase: this.#phase,
      denial: this.#denial ?? null,
      started: this.#started,
      deadline: this.#deadline,
    });
  }
}
export function guardedExecution<Args extends unknown[], Result>(
  assertState: () => void,
  execute: (...args: Args) => Result,
): (...args: Args) => Result {
  return (...args: Args): Result => {
    assertState();
    return execute(...args);
  };
}
export function toolIdentity(
  tools: readonly { name: string; description: string; parameters: unknown }[],
): string {
  return digest(
    tools.map(({ name, description, parameters }) => ({
      name,
      description,
      parameters: JSON.parse(JSON.stringify(parameters)),
    })),
  );
}
