import path from "node:path";

export function assertPathInsideDirectory(input: {
  candidate: string;
  root: string;
  label: string;
}): void {
  const relative = path.relative(input.root, input.candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${input.label} must stay inside ${input.root}: ${input.candidate}`);
  }
}
