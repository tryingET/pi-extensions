import { REPOSITORIES } from "./experiment-config.mjs";
import { fail } from "./experiment-process.mjs";

function checkCasesInput(input) {
  const expectedKeys = REPOSITORIES.map(({ id }) => id);
  const keys = Object.keys(input);
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    fail("case file repository keys differ");
  }
  for (const id of expectedKeys) {
    if (!Array.isArray(input[id]) || input[id].length !== 10) {
      fail(`${id}: expected exactly 10 cases`);
    }
  }
  const cases = expectedKeys.flatMap((id) =>
    input[id].map((item) => ({ ...item, repositoryId: id })),
  );
  if (cases.length !== 40 || new Set(cases.map(({ id }) => id)).size !== 40) {
    fail("case file must contain exactly 40 unique case ids");
  }
  return cases;
}

export { checkCasesInput };
