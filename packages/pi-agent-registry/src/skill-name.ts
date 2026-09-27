// Agent Skills name spec, as enforced by Pi's validateName: lowercase a-z and 0-9 in
// hyphen-separated runs (no dots, underscores, or doubled/edge hyphens), at most 64 characters.
// A lenient /^[a-z0-9][a-z0-9._-]*$/ let 15 dotted engineering-core skill names through
// unnoticed (engineering-core AK5774).
const SKILL_NAME_SPEC = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_SKILL_NAME_LENGTH = 64;

export function isSkillName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_SKILL_NAME_LENGTH &&
    SKILL_NAME_SPEC.test(value)
  );
}
