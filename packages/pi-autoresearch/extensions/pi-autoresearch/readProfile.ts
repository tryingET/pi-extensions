// ---
// summary: "Enforces the autoresearch read profile by rejecting writes, apply requests, and unavailable tool actions."
// read_when:
//   - "Changing read-only effect boundaries, allowed actions, projection persistence, or rejection diagnostics."
// ---
export type AutoresearchExtensionEffectProfile = "unrestricted" | "read";

export type AutoresearchEffectProfileOptions = {
  effectProfile?: AutoresearchExtensionEffectProfile;
};

export function assertReadProfileAllowsAction(
  options: AutoresearchEffectProfileOptions,
  input: {
    toolName: string;
    action: string;
    allowedActions: readonly string[];
    apply?: boolean;
    persistProjection?: boolean;
  },
): void {
  if (options.effectProfile !== "read") return;
  if (input.persistProjection === true) {
    throw new Error(
      `${input.toolName} action=${input.action} persistProjection=true is unavailable in the autoresearch read profile; activate the mutating profile for explicit projection writes.`,
    );
  }
  if (input.apply === true) {
    throw new Error(
      `${input.toolName} action=${input.action} apply=true is unavailable in the autoresearch read profile; activate the mutating profile for local writes or execution.`,
    );
  }
  if (!input.allowedActions.includes(input.action)) {
    throw new Error(
      `${input.toolName} action=${input.action} is unavailable in the autoresearch read profile; allowed read actions: ${input.allowedActions.join(", ")}.`,
    );
  }
}

export function assertReadProfileRejectsTool(
  options: AutoresearchEffectProfileOptions,
  toolName: string,
): void {
  if (options.effectProfile !== "read") return;
  throw new Error(
    `${toolName} is unavailable in the autoresearch read profile; activate the mutating profile for local writes or execution.`,
  );
}
