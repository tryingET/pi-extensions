import { REPOSITORIES } from "./experiment-config.mjs";
import { fail } from "./experiment-process.mjs";

export function checkCasesInput(input) {
  const expectedKeys = REPOSITORIES.map(({ id }) => id);
  if (JSON.stringify(Object.keys(input)) !== JSON.stringify(expectedKeys)) {
    fail("case file repository keys differ from the frozen order");
  }
  for (const id of expectedKeys) {
    if (!Array.isArray(input[id]) || input[id].length !== 10) {
      fail(`${id}: expected exactly 10 cases`);
    }
  }
  const cases = expectedKeys.flatMap((id) =>
    input[id].map((item) => ({ ...item, repositoryId: id })),
  );
  if (cases.length !== 50 || new Set(cases.map(({ id }) => id)).size !== 50) {
    fail("case file must contain exactly 50 unique case ids");
  }
  return cases;
}
