#!/usr/bin/env node
import { prepare } from "./experiment-preparation.mjs";
import { fail } from "./experiment-runtime.mjs";
import { runRanking } from "./run-ranking.mjs";

const [mode, ...args] = process.argv.slice(2);
if (mode === "prepare" && args.length === 0) await prepare();
else if (mode === "run") await runRanking(args);
else fail("usage: node prepare-and-run.mjs prepare | run --execute-ranking");
