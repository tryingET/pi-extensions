// Independently supplied inventory digest of in-plan files. Not HEAD/index custody.
import { createHash } from 'node:crypto';
const need = (ok, message) => { if (!ok) throw new Error(`SDK plan: ${message}`); };
export const inventoryLine = f => `${f.path}\t${f.mode}\t${f.bytes}\t${f.sha256}`;
export function canonicalInventory(files) {
  need(Array.isArray(files), 'inventory files');
  return [...files].map(inventoryLine).sort().join('\n') + '\n';
}
export function inventoryDigest(files) {
  return createHash('sha256').update(canonicalInventory(files)).digest('hex');
}
export function verifySourceInventory(plan) {
  need(typeof plan.sourceInventorySha256 === 'string' && /^[a-f0-9]{64}$/.test(plan.sourceInventorySha256),
    'independently supplied inventory digest required');
  need(inventoryDigest(plan.files) === plan.sourceInventorySha256, 'inventory digest mismatch');
}
