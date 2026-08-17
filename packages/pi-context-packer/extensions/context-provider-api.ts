// ---
// summary: publishes the stable read-only provider API for independently installed Pi packages.
// read_when:
//   - changing process-local provider API discovery or extension load behavior.
// ---
import { installGlobalContextProviderApi } from "../src/provider-api.js";

export default function contextProviderApiExtension(): void {
  installGlobalContextProviderApi();
}
