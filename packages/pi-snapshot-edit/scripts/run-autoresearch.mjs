import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runBenchmark } from "./protocol-benchmark.mjs";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(packageRoot, ".autoresearch", "protocol-token-aggregate.json");
const { aggregate } = runBenchmark();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(aggregate, null, 2)}\n`);

console.log(`Tokenizer: ${aggregate.tokenizer.implementation} / ${aggregate.tokenizer.encoding}`);
console.log(
  "Protocol | Total tokens | Tokens/correct mutation case | Correct mutation cases | Stale rejected",
);
console.log("--- | ---: | ---: | ---: | ---:");
for (const [protocol, result] of Object.entries(aggregate.protocols)) {
  console.log(
    `${protocol} | ${result.totalTokens} | ${result.tokensPerCorrectMutationCase} | ${result.correctMutationCases} | ${result.staleRejections}`,
  );
}
const selectedProtocol = process.env.AUTORESEARCH_PROTOCOL ?? "A";
const selectedResult = aggregate.protocols[selectedProtocol];
if (!selectedResult) {
  throw new Error(`Unknown AUTORESEARCH_PROTOCOL '${selectedProtocol}'; expected A, B, C, D, or E`);
}
console.log(`Selected protocol: ${selectedProtocol}`);
console.log(
  `METRIC tokens_per_correct_mutation_case=${selectedResult.tokensPerCorrectMutationCase}`,
);
