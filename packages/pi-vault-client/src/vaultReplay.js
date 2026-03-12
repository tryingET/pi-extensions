import { createHash } from "node:crypto";
import { prepareTemplateForExecutionCompat } from "./templatePreparationCompat.js";
import { rebuildGroundedNext10PromptFromReplayInputs } from "./vaultGrounding.js";
import { getRoutePromptShapeForChannel, prepareRoutePrompt } from "./vaultRoute.js";
const UNAVAILABLE_REASONS = new Set([
    "receipt-missing",
    "template-missing",
    "company-mismatch",
    "missing-input-contract",
    "runtime-unavailable",
]);
function sha256(text) {
    return createHash("sha256").update(text, "utf8").digest("hex");
}
function uniqueReasons(reasons) {
    return reasons.filter((reason, index) => reasons.indexOf(reason) === index);
}
function arraysEqual(left, right) {
    if (left.length !== right.length)
        return false;
    return left.every((value, index) => value === right[index]);
}
function buildSnapshot(text, render) {
    return {
        text,
        sha256: sha256(text),
        engine: render.engine,
        explicit_engine: render.explicitEngine,
        context_appended: render.contextAppended,
        append_context_section: render.appendContextSection,
        used_render_keys: [...render.usedRenderKeys],
    };
}
function createBaseReport(executionId, receipt, overrides) {
    return {
        execution_id: executionId,
        status: "unavailable",
        reasons: [],
        current_company: receipt?.company.current_company || "",
        company_source: receipt?.company.company_source || "",
        receipt,
        template_name: receipt?.template.name || "",
        template_version: Number.isFinite(Number(receipt?.template.version))
            ? Number(receipt?.template.version)
            : null,
        regenerated: null,
        matches_prepared_text: false,
        matches_prepared_sha256: false,
        notes: [],
        ...overrides,
    };
}
function finalizeReport(report) {
    const reasons = uniqueReasons(report.reasons);
    const matches = report.matches_prepared_text && report.matches_prepared_sha256;
    if (reasons.length === 0 && matches) {
        return { ...report, status: "match", reasons };
    }
    if (reasons.some((reason) => UNAVAILABLE_REASONS.has(reason))) {
        return { ...report, status: "unavailable", reasons };
    }
    return { ...report, status: "drift", reasons };
}
function resolveReplayCompanyContext(runtime, receipt, options) {
    const receiptCompany = receipt.company.current_company;
    const explicitCompany = String(options?.currentCompany || "").trim();
    if (explicitCompany) {
        if (explicitCompany !== receiptCompany) {
            return {
                ok: false,
                report: finalizeReport(createBaseReport(receipt.execution_id, receipt, {
                    current_company: explicitCompany,
                    company_source: "explicit:currentCompany",
                    reasons: ["company-mismatch"],
                    notes: [
                        `Replay requested under company ${explicitCompany}, but receipt recorded ${receiptCompany}.`,
                    ],
                })),
            };
        }
        return {
            ok: true,
            currentCompany: explicitCompany,
            companySource: "explicit:currentCompany",
        };
    }
    if (options?.cwd) {
        const resolved = runtime.resolveCurrentCompanyContext(options.cwd);
        if (resolved.source !== "contract-default") {
            if (resolved.company !== receiptCompany) {
                return {
                    ok: false,
                    report: finalizeReport(createBaseReport(receipt.execution_id, receipt, {
                        current_company: resolved.company,
                        company_source: resolved.source,
                        reasons: ["company-mismatch"],
                        notes: [
                            `Replay cwd resolved company ${resolved.company}, but receipt recorded ${receiptCompany}.`,
                        ],
                    })),
                };
            }
            return {
                ok: true,
                currentCompany: resolved.company,
                companySource: resolved.source,
            };
        }
    }
    return {
        ok: true,
        currentCompany: receiptCompany,
        companySource: receipt.company.company_source || "receipt:current_company",
    };
}
function resolveCurrentTemplate(runtime, receipt, currentCompany) {
    const templateResult = runtime.getTemplateDetailed(receipt.template.name, {
        currentCompany,
        requireExplicitCompany: true,
    });
    if (!templateResult.ok) {
        return {
            ok: false,
            reason: "runtime-unavailable",
            note: `Template lookup failed: ${templateResult.error}`,
        };
    }
    if (!templateResult.value) {
        return {
            ok: false,
            reason: "template-missing",
            note: `Template not visible for replay: ${receipt.template.name}`,
        };
    }
    return { ok: true, template: templateResult.value };
}
function replayVaultSelection(template, receipt, currentCompany) {
    if (receipt.replay_safe_inputs.kind !== "vault-selection") {
        return {
            ok: false,
            reason: "missing-input-contract",
            note: `Unsupported replay input kind for vault selection: ${receipt.replay_safe_inputs.kind}`,
        };
    }
    const prepared = prepareTemplateForExecutionCompat(template.content, {
        currentCompany,
        context: receipt.replay_safe_inputs.context,
        templateName: template.name,
        appendContextSection: receipt.render.append_context_section,
        allowLegacyPiVarsAutoDetect: false,
    });
    if (!prepared.ok) {
        return {
            ok: false,
            reason: "render-mismatch",
            note: `Vault selection replay render failed: ${prepared.error}`,
        };
    }
    return {
        ok: true,
        regenerated: buildSnapshot(prepared.prepared, {
            engine: prepared.engine,
            explicitEngine: prepared.explicitEngine,
            contextAppended: prepared.contextAppended,
            appendContextSection: receipt.render.append_context_section,
            usedRenderKeys: prepared.usedRenderKeys,
        }),
    };
}
function replayRouteRequest(template, receipt, currentCompany) {
    if (receipt.replay_safe_inputs.kind !== "route-request") {
        return {
            ok: false,
            reason: "missing-input-contract",
            note: `Unsupported replay input kind for route replay: ${receipt.replay_safe_inputs.kind}`,
        };
    }
    const shape = getRoutePromptShapeForChannel(receipt.invocation.channel);
    if (!shape) {
        return {
            ok: false,
            reason: "missing-input-contract",
            note: `Unsupported route replay channel: ${receipt.invocation.channel}`,
        };
    }
    const prepared = prepareRoutePrompt(template, {
        context: receipt.replay_safe_inputs.context,
        currentCompany,
        shape,
    });
    if (!prepared.ok) {
        return {
            ok: false,
            reason: "render-mismatch",
            note: `Route replay render failed: ${prepared.error}`,
        };
    }
    return {
        ok: true,
        regenerated: buildSnapshot(prepared.prompt, {
            engine: prepared.prepared.engine,
            explicitEngine: prepared.prepared.explicitEngine,
            contextAppended: prepared.prepared.contextAppended,
            appendContextSection: false,
            usedRenderKeys: prepared.prepared.usedRenderKeys,
        }),
    };
}
function replayGroundingRequest(runtime, receipt, currentCompany, companySource) {
    if (receipt.replay_safe_inputs.kind !== "grounding-request") {
        return {
            ok: false,
            reason: "missing-input-contract",
            note: `Unsupported replay input kind for grounding replay: ${receipt.replay_safe_inputs.kind}`,
        };
    }
    const grounded = rebuildGroundedNext10PromptFromReplayInputs(runtime, receipt.replay_safe_inputs, {
        currentCompany,
        companySource,
    });
    if (!grounded.ok) {
        const reasonText = grounded.reason;
        if (/missing stored framework_resolution\.selected_names/i.test(reasonText)) {
            return { ok: false, reason: "missing-input-contract", note: reasonText };
        }
        if (/lookup failed/i.test(reasonText)) {
            return { ok: false, reason: "runtime-unavailable", note: reasonText };
        }
        if (/render failed/i.test(reasonText)) {
            return { ok: false, reason: "render-mismatch", note: reasonText };
        }
        if (/unavailable in Prompt Vault|unavailable from Prompt Vault/i.test(reasonText)) {
            return { ok: false, reason: "template-missing", note: reasonText };
        }
        return { ok: false, reason: "missing-input-contract", note: reasonText };
    }
    return {
        ok: true,
        regenerated: buildSnapshot(grounded.prompt, {
            engine: grounded.prepared.engine,
            explicitEngine: grounded.prepared.explicitEngine,
            contextAppended: grounded.prepared.contextAppended,
            appendContextSection: false,
            usedRenderKeys: grounded.prepared.usedRenderKeys,
        }),
    };
}
function compareReplayAgainstReceipt(receipt, template, regenerated) {
    const reasons = [];
    const notes = [];
    const currentVersion = Number.isFinite(Number(template.version))
        ? Number(template.version)
        : null;
    const recordedVersion = Number.isFinite(Number(receipt.template.version))
        ? Number(receipt.template.version)
        : null;
    if (recordedVersion != null && currentVersion !== recordedVersion) {
        reasons.push("version-mismatch");
        notes.push(`Recorded template version ${recordedVersion}; current version ${currentVersion}.`);
    }
    if (Number.isFinite(Number(receipt.template.id)) &&
        Number.isFinite(Number(template.id)) &&
        Number(receipt.template.id) !== Number(template.id)) {
        notes.push(`Recorded template id ${receipt.template.id}; current id ${template.id}.`);
    }
    if (receipt.render.engine !== regenerated.engine ||
        (receipt.render.explicit_engine ?? null) !== (regenerated.explicit_engine ?? null) ||
        receipt.render.context_appended !== regenerated.context_appended ||
        receipt.render.append_context_section !== regenerated.append_context_section ||
        !arraysEqual(receipt.render.used_render_keys, regenerated.used_render_keys)) {
        reasons.push("render-mismatch");
        notes.push("Stored render snapshot differs from regenerated render snapshot.");
    }
    const matchesText = regenerated.text === receipt.prepared.text;
    const matchesSha256 = regenerated.sha256 === receipt.prepared.sha256;
    if (!matchesText || !matchesSha256) {
        reasons.push("render-mismatch");
        notes.push("Regenerated prepared prompt differs from the stored prepared baseline.");
    }
    return {
        reasons: uniqueReasons(reasons),
        notes,
        matchesText,
        matchesSha256,
    };
}
export function replayVaultExecutionReceipt(runtime, receipt, options) {
    const companyContext = resolveReplayCompanyContext(runtime, receipt, options);
    if (!companyContext.ok)
        return companyContext.report;
    const baseReport = createBaseReport(receipt.execution_id, receipt, {
        current_company: companyContext.currentCompany,
        company_source: companyContext.companySource,
    });
    const templateResult = resolveCurrentTemplate(runtime, receipt, companyContext.currentCompany);
    if (!templateResult.ok) {
        return finalizeReport({
            ...baseReport,
            reasons: [templateResult.reason],
            notes: [templateResult.note],
        });
    }
    const template = templateResult.template;
    const replayed = (() => {
        if (receipt.replay_safe_inputs.kind === "vault-selection") {
            return replayVaultSelection(template, receipt, companyContext.currentCompany);
        }
        if (receipt.replay_safe_inputs.kind === "route-request") {
            return replayRouteRequest(template, receipt, companyContext.currentCompany);
        }
        if (receipt.replay_safe_inputs.kind === "grounding-request") {
            return replayGroundingRequest(runtime, receipt, companyContext.currentCompany, companyContext.companySource);
        }
        return {
            ok: false,
            reason: "missing-input-contract",
            note: `Unsupported replay input kind: ${receipt.replay_safe_inputs?.kind || "unknown"}`,
        };
    })();
    if (!replayed.ok) {
        return finalizeReport({
            ...baseReport,
            template_version: Number.isFinite(Number(template.version)) ? Number(template.version) : null,
            reasons: [replayed.reason],
            notes: [replayed.note],
        });
    }
    const comparison = compareReplayAgainstReceipt(receipt, template, replayed.regenerated);
    return finalizeReport({
        ...baseReport,
        template_version: Number.isFinite(Number(template.version)) ? Number(template.version) : null,
        regenerated: replayed.regenerated,
        matches_prepared_text: comparison.matchesText,
        matches_prepared_sha256: comparison.matchesSha256,
        reasons: comparison.reasons,
        notes: comparison.notes,
    });
}
export function replayVaultExecutionById(runtime, receipts, executionId, options) {
    const normalizedExecutionId = Math.floor(Number(executionId));
    if (!Number.isFinite(normalizedExecutionId) || normalizedExecutionId < 1) {
        return finalizeReport(createBaseReport(normalizedExecutionId, null, {
            reasons: ["receipt-missing"],
            notes: ["Replay requires a positive integer execution_id."],
        }));
    }
    const receipt = receipts.readReceiptByExecutionId(normalizedExecutionId);
    if (!receipt) {
        return finalizeReport(createBaseReport(normalizedExecutionId, null, {
            reasons: ["receipt-missing"],
            notes: [`No local receipt found for execution ${normalizedExecutionId}.`],
        }));
    }
    return replayVaultExecutionReceipt(runtime, receipt, options);
}
