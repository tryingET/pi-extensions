/**
summary: "Validate explicit packet budgets without silently widening caller limits."
read_when:
  - "Changing budget input schemas, defaults, or reserved headroom."
*/
import { nonnegative } from "./packet-budget-limits.js";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fields = ["maxTokens", "maxBytes", "reserveTokens", "perProviderMaxTokens"];
const integerSchema = () => ({ type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER });

export const packetBudgetSchema = (providerIds) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    maxTokens: integerSchema(),
    maxBytes: integerSchema(),
    reserveTokens: integerSchema(),
    perProviderMaxTokens: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(providerIds.map((id) => [id, integerSchema()])),
    },
  },
});

export function normalizePacketBudget(value, providerIds) {
  const budget = value === undefined ? {} : value;
  if (!isObject(budget) || Object.keys(budget).some((key) => !fields.includes(key)))
    throw new Error("invalid_budget");
  const perProvider = budget.perProviderMaxTokens === undefined ? {} : budget.perProviderMaxTokens;
  if (!isObject(perProvider) || Object.keys(perProvider).some((key) => !providerIds.includes(key)))
    throw new Error("invalid_budget");
  for (const number of [
    budget.maxTokens,
    budget.maxBytes,
    budget.reserveTokens,
    ...Object.values(perProvider),
  ])
    if (number !== undefined && !nonnegative(number)) throw new Error("invalid_budget");
  const maxTokens = budget.maxTokens ?? 40_000;
  return {
    maxTokens,
    maxBytes: budget.maxBytes ?? Math.min(Number.MAX_SAFE_INTEGER, maxTokens * 4),
    // An explicit reserve may consume all capacity; never lower it to force a packet through.
    reserveTokens: budget.reserveTokens ?? Math.min(12_000, Math.floor(maxTokens * 0.3)),
    perProviderMaxTokens: Object.fromEntries(
      providerIds.map((id) => [id, perProvider[id] ?? 12_000]),
    ),
  };
}
