import { validDebugExploreDetails } from "./explore-debug-detail-validator.ts";
import { validLocation } from "./explore-detail-shared.ts";
import type { ExploreMode } from "./explore-result-validator.ts";
import { validStandardExploreDetails } from "./explore-standard-detail-validator.ts";

export { validLocation };

export function validExploreDetails(
  value: unknown,
  mode: Exclude<ExploreMode, "compact">,
): boolean {
  return mode === "standard" ? validStandardExploreDetails(value) : validDebugExploreDetails(value);
}
