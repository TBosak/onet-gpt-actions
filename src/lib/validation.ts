import { BodyError } from "./http";

export function boundedInt(
  value: string | null | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function optionalBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

export function occupationCode(value: unknown): string {
  const code = String(value ?? "").trim();
  if (!/^\d{2}-\d{4}\.\d{2}$/.test(code)) {
    throw new BodyError(422, "invalid_occupation_code", `Invalid O*NET-SOC code: ${code || "empty"}.`);
  }
  return code;
}

export function toFtsQuery(value: string): string {
  const terms = value
    .normalize("NFKC")
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/["*:^(){}[\]]/g, "").trim())
    .filter(Boolean)
    .slice(0, 12);
  return terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(" AND ");
}

export function nonEmptyString(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new BodyError(422, "validation_error", `${field} is required.`);
  if (normalized.length > maxLength) {
    throw new BodyError(422, "validation_error", `${field} exceeds ${maxLength} characters.`);
  }
  return normalized;
}

export function finiteNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new BodyError(
      422,
      "validation_error",
      `${field} must be between ${minimum} and ${maximum}.`,
    );
  }
  return number;
}
