import { codeModeExtension } from "../src/extension.ts";

export { CapabilityRegistry } from "../src/capability-registry.ts";
export {
  createDefaultCapabilities,
  createListDirectoryCapability,
  createReadTextCapability,
  createRunProcessCapability,
} from "../src/default-capabilities.ts";
export {
  codeModeExtension,
  createCodeModeExtension,
} from "../src/extension.ts";
export type {
  CapabilityCatalogEntry,
  CapabilityEffect,
  CapabilityInvocationContext,
  CodeModeCapability,
  CodeModeExtensionOptions,
  CodeModeLanguage,
  CodeModeRuntime,
  EvalToolDetails,
  KernelRunRequest,
  KernelRunResult,
} from "../src/types.ts";

export default codeModeExtension;
