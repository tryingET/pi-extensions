import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { extractLatestAssistantMessageProvenance } from "../src/provenance-core.js";

interface BackgroundCaptureConfig {
  laneId: string;
  outputFile: string;
}

function readBackgroundCaptureConfig(): BackgroundCaptureConfig | undefined {
  const laneId = process.env.PI_PROVENANCE_REVIEW_LANE_ID?.trim();
  const outputFile = process.env.PI_PROVENANCE_OUTPUT_FILE?.trim();

  if (!laneId || !outputFile) return undefined;
  return { laneId, outputFile };
}

export function writeJsonAtomic(filePath: string, payload: unknown): void {
  const dirPath = path.dirname(filePath);
  fs.mkdirSync(dirPath, { recursive: true });
  const tmpPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.tmp-${process.pid}-${randomUUID()}`,
  );

  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // Preserve the original capture failure; temp cleanup is best effort.
    }
    throw error;
  }
}

export default function provenanceExtension(pi: ExtensionAPI) {
  pi.on("agent_settled", async (_event, ctx) => {
    try {
      const config = readBackgroundCaptureConfig();
      if (!config) return;

      const provenance = extractLatestAssistantMessageProvenance(ctx.sessionManager);
      if (!provenance) return;

      writeJsonAtomic(config.outputFile, {
        ...provenance,
        capture_context: {
          kind: "review_lane",
          review_lane_id: config.laneId,
        },
      });
    } catch {
      // Background provenance is best effort and must never reject the Pi lifecycle.
    }
  });
}
