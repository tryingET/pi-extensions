// summary: company names for reading the Vault - register names, old stored names, retired names and no company.
// read_when:
//   - mapping a company name to what stored rows hold, or building a visibility check.
//
// One contract decides: prompt-vault ontology/company-visibility-contract.json, key "register".
// Stored rows keep their old names (software, finance, ...); the client keeps using them
// internally where one exists, and register names (familyco, tradingco) where none does.
import { existsSync, readFileSync } from "node:fs";
import { PROMPT_VAULT_ROOT } from "./vaultTypes.js";
export const NO_COMPANY = "none";
const FALLBACK = {
  companies: [
    "holdingco",
    "healthco",
    "teachingco",
    "tradingco",
    "familyco",
    "core",
    "softwareco",
    "financeco",
  ],
  aliases: {
    software: "softwareco",
    finance: "financeco",
    health: "healthco",
    teaching: "teachingco",
    holding: "holdingco",
  },
  retired: ["house"],
  stored: ["core", "software", "finance", "house", "health", "teaching", "holding"],
};
let cached = null;
export function loadRegister(root = PROMPT_VAULT_ROOT) {
  const path = `${root}/ontology/company-visibility-contract.json`;
  if (cached?.key === path) return cached.register;
  let register = FALLBACK;
  if (existsSync(path)) {
    const contract = JSON.parse(readFileSync(path, "utf8"));
    if (contract?.register?.companies && Array.isArray(contract.companies)) {
      register = {
        companies: contract.register.companies,
        aliases: contract.register.aliases || {},
        retired: contract.register.retired || [],
        stored: contract.companies,
      };
    }
  }
  cached = { key: path, register };
  return register;
}
/** Register name for NAME (a register name or an old alias); NO_COMPANY for none; null when retired or unknown. */
export function canonicalCompany(name, register = loadRegister()) {
  const value = String(name ?? "")
    .trim()
    .toLowerCase();
  if (!value || value === NO_COMPANY) return NO_COMPANY;
  if (register.companies.includes(value)) return value;
  if (register.aliases[value]) return register.aliases[value];
  return null;
}
/** The client's internal name: the stored name where rows have one, else the register name. */
export function internalCompany(name, register = loadRegister()) {
  const canonical = canonicalCompany(name, register);
  if (canonical === null || canonical === NO_COMPANY) return canonical;
  if (register.stored.includes(canonical)) return canonical;
  const stored = Object.entries(register.aliases).find(
    ([alias, target]) => target === canonical && register.stored.includes(alias),
  );
  return stored ? stored[0] : canonical;
}
/** Every name a stored row may use for COMPANY (internal or register name). */
export function storedNamesFor(company, register = loadRegister()) {
  const canonical = canonicalCompany(company, register);
  if (canonical === null || canonical === NO_COMPANY) return [];
  const names = new Set([canonical]);
  for (const [alias, target] of Object.entries(register.aliases)) {
    if (target === canonical) names.add(alias);
  }
  return [...names];
}
/** The stored names that stand for register company NAME: the name itself and its old spellings. */
function spellingsOf(name, register) {
  return [name, ...Object.keys(register.aliases).filter((old) => register.aliases[old] === name)];
}
/** Does a stored list name every register company (in any accepted spelling; retired names count for none)? */
export function namesEveryCompany(visibility, register = loadRegister()) {
  return register.companies.every((name) =>
    spellingsOf(name, register).some((spelling) => visibility.includes(spelling)),
  );
}
/**
 * Is a stored owner/visibility pair well formed? Every name is a stored name (house included, for
 * old rows), a register name or an old spelling; the list is non-empty; the owner is in it in any
 * spelling (a software-owned row naming softwareco is fine).
 */
export function storedVisibilityValid(owner, visibility, register = loadRegister()) {
  const known = new Set([
    ...register.stored,
    ...register.companies,
    ...Object.keys(register.aliases),
  ]);
  const canon = (name) => register.aliases[name] ?? name;
  if (typeof owner !== "string" || !known.has(owner)) return false;
  if (!Array.isArray(visibility) || visibility.length === 0) return false;
  if (visibility.some((name) => typeof name !== "string" || !known.has(name))) return false;
  return visibility.some((name) => canon(name) === canon(owner));
}
/** JS twin of visibilitySql: may COMPANY (internal, register name or none) read a row with OWNER and VISIBILITY? */
export function rowVisibleTo(owner, visibility, company, register = loadRegister()) {
  if (!Array.isArray(visibility)) return false;
  const stored = visibility.map(String);
  if (owner === "core" && register.stored.every((name) => stored.includes(name))) return true;
  if (namesEveryCompany(stored, register)) return true;
  const names = storedNamesFor(String(company ?? ""), register);
  return names.some((name) => stored.includes(name));
}
export function isContextCompany(company, register = loadRegister()) {
  const canonical = canonicalCompany(company, register);
  return canonical !== null && canonical !== NO_COMPANY;
}
function sqlString(value) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}
/**
 * SQL true when the row may be read by COMPANY. Core rows listing every stored name, and any row naming
 * every register company, reach every company and no company; any other row reaches only the companies
 * it names (fail closed).
 */
export function visibilitySql(company, visibilityColumn, ownerColumn, register = loadRegister()) {
  const coreForAll = `(${ownerColumn} = 'core' AND JSON_CONTAINS(${visibilityColumn}, ${sqlString(JSON.stringify(register.stored))}))`;
  const namesAll = register.companies
    .map(
      (name) =>
        `(${spellingsOf(name, register)
          .map(
            (spelling) =>
              `JSON_SEARCH(${visibilityColumn}, 'one', ${sqlString(spelling)}) IS NOT NULL`,
          )
          .join(" OR ")})`,
    )
    .join(" AND ");
  const everyone = `(${coreForAll} OR (${namesAll}))`;
  const names = storedNamesFor(company, register);
  if (names.length === 0) return everyone;
  const named = names
    .map((name) => `JSON_SEARCH(${visibilityColumn}, 'one', ${sqlString(name)}) IS NOT NULL`)
    .join(" OR ");
  return `(${everyone} OR ${named})`;
}
