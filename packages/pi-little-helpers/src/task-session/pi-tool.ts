import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  inspectTaskSession,
  launchTaskSession,
  planTaskSession,
  stopTaskSession,
  taskSessionCapability,
  taskSessionInstalledIdentity,
} from "./core.js";
import { parseJson } from "./json.js";
/** Thin projection only. Never touches the controller editor, ambient auth or Pi execution handles. */
export default function taskSessionTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "task_session",
    label: "Task session",
    description:
      "Discover, plan, launch or DB-free inspect an exact fresh ordinary visible task session. Launch currently refuses: AK producer integration is blocked. No fork/resume, automatic recovery or legacy fallback.",
    parameters: Type.Object(
      {
        operation: Type.String({
          enum: ["capability", "identity", "plan", "launch", "inspect", "stop"],
        }),
        request: Type.Optional(Type.String({ maxLength: 65536 })),
        requestId: Type.Optional(Type.String({ maxLength: 128 })),
      },
      { additionalProperties: false },
    ),
    async execute(_id, params) {
      let result: unknown;
      try {
        if (params.operation === "capability" && !params.request && !params.requestId)
          result = taskSessionCapability();
        else if (params.operation === "identity" && !params.request && !params.requestId)
          result = taskSessionInstalledIdentity();
        else if (params.operation === "stop" && !params.request && params.requestId)
          result = stopTaskSession(params.requestId);
        else if (params.operation === "inspect" && !params.request)
          result = inspectTaskSession(params.requestId);
        else if (params.operation === "plan" && params.request && !params.requestId)
          result = planTaskSession(parseJson(params.request, 65536));
        else if (params.operation === "launch" && params.request && !params.requestId)
          result = await launchTaskSession(parseJson(params.request, 65536));
        else throw new Error("invalid_fields");
      } catch (e) {
        result = {
          schema: "pi.task-session.error.v1",
          reason:
            e instanceof Error && /^[a-z_]+$/.test(e.message)
              ? e.message
              : "task_session_unavailable",
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
}
