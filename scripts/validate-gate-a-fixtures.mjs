#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const fixture = read('fixtures/gate-a/adoption-steward-a0a1.v1.json');
const crosswalk = read('contracts/gate-a/claim-failure-effect-crosswalk.v1.json');
const registry = read('fixtures/gate-a/registry-release-evidence.json');
const vault = read('fixtures/gate-a/vault-materialization.json');
const hooks = read('fixtures/gate-a/extension-hook-inventory.json');
const noEffects = read('fixtures/gate-a/asc-confirmed-no-effects.json');
const indeterminate = read('fixtures/gate-a/asc-effect-indeterminate.json');
const errors=[];
const exact=/^[a-z0-9-]+:[a-z0-9-]+:[^@]+@(?:sha256|git-tree-sha1|git-blob-sha1):[0-9a-f]+$/;
if (!/^urn:uuid:/.test(fixture.agent_id)) errors.push('agent identity is not agent/2-shaped');
for (const ref of fixture.permit.resource_refs) if (!exact.test(ref)) errors.push(`non-exact resource ref ${ref}`);
if (fixture.registry.approves_release !== false || fixture.registry.authorizes_run !== false) errors.push('registry authority');
if (fixture.release.acceptance_status !== 'not_present' || fixture.release.accepted_by_ref !== null) errors.push('fixture invents release acceptance');
if (!fixture.vault_view.narrowing_only || fixture.vault_view.contains_credentials || fixture.vault_view.contains_authority) errors.push('vault view');
const e=fixture.expected_runtime;
for (const k of ['context','memory','transcript','extension_hooks','credentials','modes']) if (e[k].length) errors.push(`ambient ${k}`);
if (e.compaction !== 'disabled' || e.session_mode !== 'fresh') errors.push('session semantics');
if (JSON.stringify(e.tools)!==JSON.stringify(['read'])) errors.push('hard tool ceiling');
if (fixture.observed_runtime.claim !== 'unproven' || !fixture.observed_runtime.fixture_only) errors.push('fixture presented as runtime proof');
if (!fixture.asc.pre_provider_is_not_pre_effect || fixture.asc.effect_disposition !== 'unproven' || fixture.asc.effect_receipt_ref !== null) errors.push('attestation/effect distinction');
const p=fixture.permit, c=fixture.delegation.child_request;
for (const [key, pk] of [['tools','tools_ceiling'],['extension_hooks','extension_hooks_ceiling'],['credentials','credentials_ceiling'],['effects','effects_ceiling'],['resource_refs','resource_refs']]) {
  if (!c[key].every(x => p[pk].includes(x))) errors.push(`delegation widening ${key}`);
}
if (Date.parse(c.not_after) > Date.parse(p.validity.not_after)) errors.push('delegation time widening');
if (registry.approval !== false || registry.activation !== false || registry.claim !== 'resolved-release-evidence') errors.push('registry fixture boundary');
if (!vault.narrowing_only || !vault.complete_skill_trees || !vault.invocation_policy_preserved || vault.authority_transfer) errors.push('vault materialization boundary');
const hookNames=new Set(hooks.descriptors.map(x=>x.name));
for (const name of ['before_provider_request','before_provider_headers','session_before_compact','tool_execution_start','user_bash']) if (!hookNames.has(name)) errors.push(`missing hook ${name}`);
if (hooks.descriptors.some(x=>x.kind!=='extension-hook' || x.model_callable || x.authority_granted)) errors.push('hook descriptor conflation');
if (noEffects.disposition!=='confirmed_no_effects' || indeterminate.disposition!=='effect_indeterminate') errors.push('ASC effect dispositions');
const terms=new Set(crosswalk.terms.map(x=>x.term));
for (const t of ['declared','resolved','built','observed','verified','accepted','authorized','settled','unproven','mismatch','revoked','effect_indeterminate','confirmed_no_effects','historical_only','forensic_only']) if (!terms.has(t)) errors.push(`missing term ${t}`);
if (crosswalk.local_code_examples['agent-kernel'].AK_PERMIT_EXPIRED === 'revoked') errors.push('expiry conflated with revocation');
if (!crosswalk.prohibited_conflations.some(x=>x[0]==='verified' && x[1]==='accepted')) errors.push('verifier/approver conflation not barred');
if (errors.length) { console.error('FAIL: '+errors.join('; ')); process.exit(1); }
console.log('PASS: runtime integration, owner fixtures, no-ambient ceiling, delegation subset, hook inventory, claim/effect crosswalk');
