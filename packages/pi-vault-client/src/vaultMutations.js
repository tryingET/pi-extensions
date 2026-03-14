import { resolveCompanyContext } from "./companyContext.js";
import { detectTemplateRenderEngine, stripFrontmatter } from "./templateRenderer.js";
function hasOwn(value, key) {
    return Object.hasOwn(value, key);
}
function sanitizeControlledVocabularyValue(controlledVocabulary) {
    if (!controlledVocabulary || typeof controlledVocabulary !== "object")
        return null;
    const sanitized = {};
    for (const key of [
        "routing_context",
        "activity_phase",
        "input_artifact",
        "transition_target_type",
        "output_commitment",
    ]) {
        const rawValue = controlledVocabulary[key];
        if (rawValue == null)
            continue;
        const normalizedValue = String(rawValue).trim();
        if (normalizedValue)
            sanitized[key] = normalizedValue;
    }
    if (Array.isArray(controlledVocabulary.selection_principles)) {
        const selectionPrinciples = controlledVocabulary.selection_principles
            .map((value) => String(value).trim())
            .filter(Boolean);
        if (selectionPrinciples.length > 0)
            sanitized.selection_principles = selectionPrinciples;
    }
    return Object.keys(sanitized).length > 0 ? sanitized : null;
}
function hasControlledVocabularyPatch(controlledVocabulary) {
    if (!controlledVocabulary || typeof controlledVocabulary !== "object")
        return false;
    return [
        "routing_context",
        "activity_phase",
        "input_artifact",
        "transition_target_type",
        "selection_principles",
        "output_commitment",
    ].some((key) => hasOwn(controlledVocabulary, key));
}
function hasTemplateUpdateFields(patch) {
    return ([
        "content",
        "description",
        "artifact_kind",
        "control_mode",
        "formalization_level",
        "owner_company",
        "visibility_companies",
    ].some((key) => hasOwn(patch, key)) || hasControlledVocabularyPatch(patch.controlled_vocabulary));
}
function mergeTemplateUpdate(existing, patch) {
    const mergedControlledVocabulary = hasControlledVocabularyPatch(patch.controlled_vocabulary)
        ? sanitizeControlledVocabularyValue({
            ...(existing.controlled_vocabulary || {}),
            ...(patch.controlled_vocabulary || {}),
        })
        : sanitizeControlledVocabularyValue(existing.controlled_vocabulary);
    return {
        ...existing,
        ...(hasOwn(patch, "content") ? { content: String(patch.content ?? "") } : {}),
        ...(hasOwn(patch, "description") ? { description: String(patch.description ?? "") } : {}),
        ...(hasOwn(patch, "artifact_kind")
            ? { artifact_kind: String(patch.artifact_kind ?? "").trim() }
            : {}),
        ...(hasOwn(patch, "control_mode")
            ? { control_mode: String(patch.control_mode ?? "").trim() }
            : {}),
        ...(hasOwn(patch, "formalization_level")
            ? { formalization_level: String(patch.formalization_level ?? "").trim() }
            : {}),
        ...(hasOwn(patch, "owner_company")
            ? { owner_company: String(patch.owner_company ?? "").trim() }
            : {}),
        ...(hasOwn(patch, "visibility_companies")
            ? {
                visibility_companies: (patch.visibility_companies || [])
                    .map((value) => String(value).trim())
                    .filter(Boolean),
            }
            : {}),
        controlled_vocabulary: mergedControlledVocabulary,
    };
}
function validateCompanyList(companies, contracts) {
    const governedCompanies = new Set(contracts.companyVisibility.companies);
    if (companies.length === 0)
        return "visibility_companies must be non-empty";
    const invalid = companies.filter((company) => !governedCompanies.has(company));
    if (invalid.length > 0)
        return `Unknown visibility company value(s): ${invalid.join(", ")}`;
    return null;
}
function validateControlledVocabulary(controlMode, controlledVocabulary, contracts) {
    const contract = contracts.controlledVocabulary;
    if (controlMode !== "router")
        return null;
    if (!controlledVocabulary)
        return "controlled_vocabulary is required when control_mode=router";
    for (const dimension of contract.router_required_dimensions) {
        if (dimension === "selection_principles") {
            const values = controlledVocabulary.selection_principles || [];
            if (values.length < 1) {
                return "controlled_vocabulary.selection_principles must contain at least one value for routers";
            }
            const allowed = new Set(contract.dimensions.selection_principles || []);
            const invalid = values.filter((value) => !allowed.has(value));
            if (invalid.length > 0) {
                return `Unknown controlled_vocabulary.selection_principles value(s): ${invalid.join(", ")}`;
            }
            continue;
        }
        const value = controlledVocabulary[dimension];
        if (!value || (typeof value === "string" && !value.trim())) {
            return `controlled_vocabulary.${dimension} is required when control_mode=router`;
        }
        const allowed = new Set(contract.dimensions[dimension] || []);
        if (typeof value === "string" && !allowed.has(value)) {
            return `Unknown controlled_vocabulary.${dimension} value: ${value}`;
        }
    }
    return null;
}
export function resolveMutationActorContext(context, options) {
    if (context?.actorCompany?.trim()) {
        return {
            status: "ok",
            actorCompany: context.actorCompany.trim(),
            source: "explicit:actorCompany",
        };
    }
    const env = options?.env || process.env;
    if (env.PI_COMPANY?.trim()) {
        return {
            status: "ok",
            actorCompany: env.PI_COMPANY.trim(),
            source: "env:PI_COMPANY",
        };
    }
    if (env.VAULT_CURRENT_COMPANY?.trim()) {
        return {
            status: "ok",
            actorCompany: env.VAULT_CURRENT_COMPANY.trim(),
            source: "env:VAULT_CURRENT_COMPANY",
        };
    }
    if (context?.cwd?.trim()) {
        const resolved = resolveCompanyContext({
            cwd: context.cwd,
            defaultCompany: "core",
            env,
            processCwd: options?.processCwd,
        });
        if (resolved.source === "contract-default") {
            return {
                status: "error",
                message: "Explicit company context is required for vault mutations. Set PI_COMPANY or run from a company-scoped cwd.",
            };
        }
        return {
            status: "ok",
            actorCompany: resolved.company,
            source: resolved.source,
        };
    }
    if (context?.allowAmbientCwdFallback === false) {
        return {
            status: "error",
            message: "Explicit company context is required for vault mutations. Set PI_COMPANY or run from a company-scoped cwd.",
        };
    }
    const resolved = resolveCompanyContext({
        defaultCompany: "core",
        env,
        processCwd: options?.processCwd,
    });
    if (resolved.source === "contract-default") {
        return {
            status: "error",
            message: "Explicit company context is required for vault mutations. Set PI_COMPANY or run from a company-scoped cwd.",
        };
    }
    return {
        status: "ok",
        actorCompany: resolved.company,
        source: resolved.source,
    };
}
export function validateTemplateContent(content) {
    const rawContent = String(content ?? "");
    if (!rawContent.trim())
        return "content must be non-empty";
    const renderContract = detectTemplateRenderEngine(rawContent, {
        allowLegacyPiVarsAutoDetect: false,
    });
    if (renderContract.error)
        return renderContract.error;
    if (!stripFrontmatter(rawContent).trim()) {
        return "content body must be non-empty after frontmatter";
    }
    return null;
}
function validateTemplateRecord(template, contracts) {
    const contentError = validateTemplateContent(template.content);
    if (contentError)
        return contentError;
    if (!contracts.ontology.facets.artifact_kind.includes(template.artifact_kind)) {
        return `Unknown artifact_kind: ${template.artifact_kind}`;
    }
    if (!contracts.ontology.facets.control_mode.includes(template.control_mode)) {
        return `Unknown control_mode: ${template.control_mode}`;
    }
    if (!contracts.ontology.facets.formalization_level.includes(template.formalization_level)) {
        return `Unknown formalization_level: ${template.formalization_level}`;
    }
    if (!contracts.companyVisibility.companies.includes(template.owner_company)) {
        return `Unknown owner_company: ${template.owner_company}`;
    }
    const visibilityError = validateCompanyList(template.visibility_companies, contracts);
    if (visibilityError)
        return visibilityError;
    if (!template.visibility_companies.includes(template.owner_company)) {
        return "visibility_companies must include owner_company";
    }
    return validateControlledVocabulary(template.control_mode, template.controlled_vocabulary, contracts);
}
export function prepareTemplateUpdate(name, existing, patch, contracts) {
    if (!existing)
        return { status: "error", message: `Template not found: ${name}` };
    if (!hasTemplateUpdateFields(patch)) {
        return {
            status: "error",
            message: "No update fields provided. Supply at least one patch field.",
        };
    }
    const merged = mergeTemplateUpdate(existing, patch);
    const validationError = validateTemplateRecord(merged, contracts);
    if (validationError)
        return { status: "error", message: validationError };
    return { status: "ok", merged };
}
export function authorizeTemplateInsert(ownerCompany, actorCompany) {
    if (ownerCompany !== actorCompany) {
        return `owner_company must match the active mutation company (${actorCompany}) for vault_insert`;
    }
    return null;
}
export function authorizeTemplateUpdate(existing, merged, actorCompany) {
    if (existing.owner_company !== actorCompany) {
        return `Template is owned by ${existing.owner_company}; active mutation company ${actorCompany} cannot update it.`;
    }
    if (merged.owner_company !== existing.owner_company) {
        return "owner_company cannot be reassigned via vault_update";
    }
    return null;
}
export function insertTemplate(name, content, description, artifactKind, controlMode, formalizationLevel, ownerCompany, visibilityCompanies, controlledVocabulary, context, dependencies) {
    const actorContext = resolveMutationActorContext(context);
    if (actorContext.status === "error")
        return actorContext;
    const ownerAuthorizationError = authorizeTemplateInsert(ownerCompany, actorContext.actorCompany);
    if (ownerAuthorizationError)
        return { status: "error", message: ownerAuthorizationError };
    const normalizedControlledVocabulary = sanitizeControlledVocabularyValue(controlledVocabulary);
    const validationError = validateTemplateRecord({
        content,
        artifact_kind: artifactKind,
        control_mode: controlMode,
        formalization_level: formalizationLevel,
        owner_company: ownerCompany,
        visibility_companies: visibilityCompanies,
        controlled_vocabulary: normalizedControlledVocabulary,
    }, dependencies.contracts);
    if (validationError)
        return { status: "error", message: validationError };
    const escapedName = dependencies.escapeSql(name);
    const existing = dependencies.queryVaultJson(`SELECT id FROM prompt_templates WHERE name = '${escapedName}' LIMIT 1`);
    if ((existing?.rows || []).length > 0) {
        return {
            status: "error",
            message: `Template already exists: ${name}. Use vault_update for in-place edits.`,
        };
    }
    const escapedContent = dependencies.escapeSql(content);
    const escapedDesc = dependencies.escapeSql(description);
    const visibilityCompaniesJson = dependencies.escapeSql(JSON.stringify(visibilityCompanies));
    const controlledVocabularyJson = normalizedControlledVocabulary
        ? `'${dependencies.escapeSql(JSON.stringify(normalizedControlledVocabulary))}'`
        : "NULL";
    const sql = `
    INSERT INTO prompt_templates (
      name,
      description,
      content,
      artifact_kind,
      control_mode,
      formalization_level,
      owner_company,
      visibility_companies,
      controlled_vocabulary,
      status,
      export_to_pi,
      version
    )
    VALUES (
      '${escapedName}',
      '${escapedDesc}',
      '${escapedContent}',
      '${dependencies.escapeSql(artifactKind)}',
      '${dependencies.escapeSql(controlMode)}',
      '${dependencies.escapeSql(formalizationLevel)}',
      '${dependencies.escapeSql(ownerCompany)}',
      '${visibilityCompaniesJson}',
      ${controlledVocabularyJson},
      'active',
      true,
      1
    )
  `;
    if (!dependencies.execVault(sql)) {
        return { status: "error", message: "Failed to insert template" };
    }
    dependencies.commitVault(`Add template: ${name}`, ["prompt_templates"]);
    const templateId = dependencies.queryVaultJson(`SELECT id FROM prompt_templates WHERE name = '${escapedName}'`)?.rows?.[0]?.id;
    return {
        status: "ok",
        message: `Template '${name}' saved as ${artifactKind}/${controlMode}/${formalizationLevel} for owner=${ownerCompany}`,
        templateId,
    };
}
export function updateTemplate(name, patch, context, dependencies) {
    const actorContext = resolveMutationActorContext(context);
    if (actorContext.status === "error")
        return actorContext;
    const existing = dependencies.getActiveTemplateByName(name);
    const prepared = prepareTemplateUpdate(name, existing, patch, dependencies.contracts);
    if (prepared.status === "error")
        return prepared;
    if (!existing)
        return { status: "error", message: `Template not found: ${name}` };
    const authorizationError = authorizeTemplateUpdate(existing, prepared.merged, actorContext.actorCompany);
    if (authorizationError)
        return { status: "error", message: authorizationError };
    if (!Number.isFinite(existing?.version)) {
        return {
            status: "error",
            message: `Template '${name}' is missing a numeric version; refusing unsafe update.`,
        };
    }
    const merged = prepared.merged;
    const nextVersion = Number(existing.version) + 1;
    const escapedName = dependencies.escapeSql(name);
    const escapedContent = dependencies.escapeSql(merged.content);
    const escapedDesc = dependencies.escapeSql(merged.description);
    const visibilityCompaniesJson = dependencies.escapeSql(JSON.stringify(merged.visibility_companies));
    const controlledVocabularyJson = merged.controlled_vocabulary
        ? `'${dependencies.escapeSql(JSON.stringify(merged.controlled_vocabulary))}'`
        : "NULL";
    const sql = `
    UPDATE prompt_templates
    SET
      description = '${escapedDesc}',
      content = '${escapedContent}',
      artifact_kind = '${dependencies.escapeSql(merged.artifact_kind)}',
      control_mode = '${dependencies.escapeSql(merged.control_mode)}',
      formalization_level = '${dependencies.escapeSql(merged.formalization_level)}',
      owner_company = '${dependencies.escapeSql(merged.owner_company)}',
      visibility_companies = '${visibilityCompaniesJson}',
      controlled_vocabulary = ${controlledVocabularyJson},
      version = ${nextVersion},
      updated_at = NOW()
    WHERE name = '${escapedName}'
      AND status = 'active'
      AND owner_company = '${dependencies.escapeSql(actorContext.actorCompany)}'
      AND version = ${Number(existing.version)}
  `;
    const updatedRows = dependencies.execVaultWithRowCount(sql);
    if (updatedRows == null)
        return { status: "error", message: "Failed to update template" };
    if (updatedRows !== 1) {
        return {
            status: "error",
            message: `Template '${name}' changed during update. Refresh and retry with the latest version.`,
        };
    }
    dependencies.commitVault(`Update template: ${name}`, ["prompt_templates"]);
    return {
        status: "ok",
        message: `Template '${name}' updated as ${merged.artifact_kind}/${merged.control_mode}/${merged.formalization_level} for owner=${merged.owner_company} (v${nextVersion})`,
        templateId: merged.id,
    };
}
