export function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function normalizeOptionalPositiveInteger(
  value: number | undefined,
  field: string,
): number | null {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
  return value;
}

export function normalizeOptionalPositiveNumber(value: number | undefined, field: string): number {
  if (value === undefined) throw new Error(`${field} is required`);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be positive`);
  return value;
}

export function normalizeNonnegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${field} must be a nonnegative integer`);
  return value;
}

export function normalizeNonnegativeNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${field} must be a nonnegative number`);
  return value;
}
