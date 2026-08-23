// ---
// summary: "Registers explicit plan/record custody of validated release evidence in Agent Kernel."
// read_when:
//   - "Changing release evidence validation, AK recording, or custody authority boundaries."
// ---

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveAkPath } from "../src/runtime/ak.ts";
import { buildReleaseEvidenceAkAdapterResult } from "../src/runtime/release-evidence-ak-adapter.ts";
import { resolveSocietyDbPath } from "../src/runtime/society-db-path.ts";

export default function releaseEvidenceAkAdapterExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "release_evidence_ak_adapter",
    label: "Release Evidence to Agent Kernel Custody",
    description:
      "Validate one canonical pi.release-evidence.v1 closure and plan or explicitly record bounded custody evidence in Agent Kernel. Does not publish, mutate release assets, or promote authority.",
    promptSnippet:
      "Use plan first. Supply the exact retained evidence manifest, stable release asset reference, and registered repository root. Record only after reviewing the generated AK evidence payload and authority ceiling.",
    parameters: Type.Object({
      evidence_path: Type.String({
        minLength: 1,
        maxLength: 4096,
        description: "Explicit path to the canonical pi.release-evidence.v1 manifest.",
      }),
      artifact_ref: Type.String({
        minLength: 1,
        maxLength: 1000,
        description:
          "Stable GitHub Release asset, artifact, or owner-controlled evidence reference.",
      }),
      repo_root: Type.String({
        minLength: 1,
        maxLength: 4096,
        description: "Explicit registered repository root used for Agent Kernel evidence custody.",
      }),
      task_id: Type.Optional(Type.Integer({ minimum: 1 })),
      action: Type.Optional(
        Type.Union([Type.Literal("plan"), Type.Literal("record")], {
          description: "Defaults to plan. Record is the only action that calls Agent Kernel.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const action = params.action ?? "plan";
      const result = await buildReleaseEvidenceAkAdapterResult({
        evidencePath: params.evidence_path,
        artifactRef: params.artifact_ref,
        repoRoot: params.repo_root,
        taskId: params.task_id,
        action,
        signal,
        ...(action === "record"
          ? {
              akConfig: {
                akPath: resolveAkPath({ cwd: params.repo_root }),
                societyDb: resolveSocietyDbPath(),
              },
            }
          : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { data: result },
      };
    },
  });
}
