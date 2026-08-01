import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { createCodeModeExtension } from "../src/extension.ts";

// The root compatibility canary installs the selected exact Pi host before compiling this file.
const exactHostFactory: ExtensionFactory = createCodeModeExtension();
void exactHostFactory;
