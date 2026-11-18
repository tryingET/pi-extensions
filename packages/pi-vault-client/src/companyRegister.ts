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

type Register = {
  companies: string[];
  aliases: Record<string, string>;
  retired: string[];
  stored: string[];
};

const FALLBACK: Register = {
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

let cached: { key: string; register: Register } | null = null;

export function loadRegister(root = PROMPT_VAULT_ROOT): Register {
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
export function canonicalCompany(
  name: string | undefined | null,
  register = loadRegister(),
): string | null {
  const value = String(name ?? "")
    .trim()
    .toLowerCase();
  if (!value || value === NO_COMPANY) return NO_COMPANY;
  if (register.companies.includes(value)) return value;
  if (register.aliases[value]) return register.aliases[value];
  return null;
}

/** The client's internal name: the stored name where rows have one, else the register name. */
export function internalCompany(
  name: string | undefined | null,
  register = loadRegister(),
): string | null {
  const canonical = canonicalCompany(name, register);
  if (canonical === null || canonical === NO_COMPANY) return canonical;
  if (register.stored.includes(canonical)) return canonical;
  const stored = Object.entries(register.aliases).find(
    ([alias, target]) => target === canonical && register.stored.includes(alias),
  );
  return stored ? stored[0] : canonical;
}

/** Every name a stored row may use for COMPANY (internal or register name). */
export function storedNamesFor(company: string, register = loadRegister()): string[] {
  const canonical = canonicalCompany(company, register);
  if (canonical === null || canonical === NO_COMPANY) return [];
  const names = new Set([canonical]);
  for (const [alias, target] of Object.entries(register.aliases)) {
    if (target === canonical) names.add(alias);
  }
  return [...names];
}

export function isContextCompany(
  company: string | undefined | null,
  register = loadRegister(),
): boolean {
  const canonical = canonicalCompany(company, register);
  return canonical !== null && canonical !== NO_COMPANY;
}

function sqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/**
 * SQL true when the row may be read by COMPANY. Core rows listing every stored name reach every
 * company and no company; any other row reaches only the companies it names (fail closed).
 */
export function visibilitySql(
  company: string,
  visibilityColumn: string,
  ownerColumn: string,
  register = loadRegister(),
): string {
  const everyone = `(${ownerColumn} = 'core' AND JSON_CONTAINS(${visibilityColumn}, ${sqlString(JSON.stringify(register.stored))}))`;
  const names = storedNamesFor(company, register);
  if (names.length === 0) return everyone;
  const named = names
    .map((name) => `JSON_SEARCH(${visibilityColumn}, 'one', ${sqlString(name)}) IS NOT NULL`)
    .join(" OR ");
  return `(${everyone} OR ${named})`;
}
