import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bytesDigest, refuse } from "./json.js";

const files = [
  [
    "@earendil-works/pi-ai",
    "api/openai-codex-responses.js",
    "0a6904d4869a09a2d9b4144f3364b575306bede11647835dddd9d80032a7f53e",
  ],
  [
    "@earendil-works/pi-coding-agent",
    "core/sdk.js",
    "6969bd56ba8e1628cd033bb15cb15fe38299f00b5ad84f4f8ef37a33a98681c9",
  ],
  [
    "@earendil-works/pi-coding-agent",
    "core/model-runtime.js",
    "f1d32af458229981db68d587df88d10bce7317f4e4916cd0f04b803d7b64f091",
  ],
  [
    "@earendil-works/pi-coding-agent",
    "core/agent-session.js",
    "e213e4094a3f176b2491e0470ac8ecd88aeab0030d35aabd9ba289ba7b74b923",
  ],
] as const;
export function assertSdkIdentity(): void {
  for (const [pkg, path, expected] of files) {
    const dist = dirname(fileURLToPath(import.meta.resolve(pkg)));
    if (
      JSON.parse(readFileSync(join(dist, "../package.json"), "utf8")).version !== "0.84.4" ||
      bytesDigest(readFileSync(join(dist, path))) !== expected
    )
      refuse("sdk_identity_unsupported");
  }
}
