import { collectHostFacts } from "../src/host-facts.js";
import { DEFAULT_POLICY, normalizePolicy, policyDigest } from "../src/policy.js";
import { compileSemanticPlan } from "../src/plan.js";

const VERSION = "0.1.0";

function baseStatus() {
  const policy = normalizePolicy(DEFAULT_POLICY);
  const plan = compileSemanticPlan(policy);
  return {
    schema: "pi-tool-boundary-status/v1",
    package: "@tryinget/pi-tool-execution-boundary",
    version: VERSION,
    phase: "slice-b-controller-core",
    profileTarget: "microvm-offline",
    effectivePolicyDigest: policyDigest(policy),
    semanticPlanDigest: plan.semanticPlanDigest,
    realExecutionEnabled: false,
    daemonConnected: false,
    backendSelected: false,
    backendAttested: false,
    standardToolsOverridden: [],
    hostFallback: false,
    implemented: {
      policyCompiler: true,
      closedOperationIr: true,
      semanticPlan: true,
      canonicalIdentity: true,
      controllerStateMachine: true,
      d0AuditQueue: true,
      sqliteD1Authority: true,
      sourceAndChangeSetIr: true,
      protocolFraming: true,
      directQemuCandidateRenderer: true,
    },
    blockedUntilEvidence: [
      "owner-workstation backend conformance bake-off",
      "one selected backend and rendered-plan attestation",
      "guest image, boundary-init, and boundary-agent verification",
      "Pi standard-tool differential and live smoke tests",
    ],
  };
}

export function toolBoundaryReport(action = "status") {
  if (action === "status") return baseStatus();
  if (action === "doctor") {
    const hostFacts = collectHostFacts();
    return {
      ...baseStatus(),
      schema: "pi-tool-boundary-doctor/v1",
      hostFacts,
      readyForRealExecution: false,
      reason: "No production backend has been selected and attested on this workstation.",
    };
  }
  if (action === "explain") {
    return {
      schema: "pi-tool-boundary-explain/v1",
      effects: {
        read: { effect: "read", durability: "D0-replay-safe-read" },
        list: { effect: "read", durability: "D0-replay-safe-read" },
        grep: { effect: "read", durability: "D0-replay-safe-read" },
        find: { effect: "read", durability: "D0-replay-safe-read" },
        write: { effect: "workspace-mutation", durability: "D1-workspace-effect" },
        edit: { effect: "workspace-mutation", durability: "D1-workspace-effect" },
        exec: { effect: "arbitrary-process", durability: "D1-workspace-effect" },
      },
      invariants: [
        "The caller and backend cannot select effect or durability.",
        "D1 requires durable admission before effects and has no automatic retry.",
        "A missing backend or attestation fails closed; it never becomes host execution.",
        "Test-only models are not runtime backends or attestation evidence.",
      ],
    };
  }
  return {
    schema: "pi-tool-boundary-error/v1",
    code: "UNKNOWN_COMMAND",
    message: "Use /tool-boundary status, doctor, or explain.",
  };
}

export default function toolExecutionBoundaryExtension(pi) {
  pi.registerCommand("tool-boundary", {
    description: "Show tool execution boundary status, prerequisites, or semantic derivation",
    handler: async (args, ctx) => {
      const action = String(args ?? "").trim().toLowerCase() || "status";
      const report = toolBoundaryReport(action);
      const message = JSON.stringify(report, null, 2);
      if (ctx?.hasUI) {
        ctx.ui.notify(message, report.code ? "warning" : "info");
      } else {
        console.log(message);
      }
      return message;
    },
  });
}
