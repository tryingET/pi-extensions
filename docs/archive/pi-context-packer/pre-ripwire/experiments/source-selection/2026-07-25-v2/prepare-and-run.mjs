#!/usr/bin/env node
import { prepare } from "./experiment-preparation.mjs";
import { fail } from "./experiment-runtime.mjs";
import { runRanking } from "./run-ranking.mjs";

const [mode, ...modeArgs] = process.argv.slice(2);
if (mode === "prepare" && modeArgs.length === 0) await prepare();
else if (mode === "run") await runRanking(modeArgs);
else fail("usage: node prepare-and-run.mjs prepare | run --execute-ranking");
