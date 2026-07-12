/**
 * summary: "declares the minimal model context protocol client module shape used during pi-interaction type checking."
 * read_when:
 *   - "resolving or updating the package-local model context protocol sdk type shim."
 */
declare module "@modelcontextprotocol/sdk/client/index.js" {
  export interface Client {
    readonly [key: string]: unknown;
  }

  const unknownExport: unknown;
  export default unknownExport;
}
