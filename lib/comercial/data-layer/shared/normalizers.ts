/**
 * shared/normalizers.ts
 *
 * Shared normalizers for the Commercial Data Layer.
 * Each normalizer accepts unknown, never throws, and returns a typed result.
 */

// ── Normalization Result ────────────────────────────────────────────────────

export interface NormalizerResult<T> {
  readonly ok: boolean;
  readonly value: T | null;
  readonly original: unknown;
  readonly transformed: boolean;
  readonly warnings: string[];
  readonly errorCode?: "EMPTY" | "INVALID" | "OVERFLOW" | "UNSUPPORTED";
}

function success<T>(value: T, original: unknown, transformed: boolean, warnings: string[] = []): NormalizerResult<T> {
  return { ok: true, value, original, transformed, warnings };
}

function empty<T>(original: unknown): NormalizerResult<T> {
  return { ok: false, value: null, original, transformed: false, warnings: [], errorCode: "EMPTY" };
}

function invalid<T>(original: unknown, warnings: string[] = []): NormalizerResult<T> {
  return { ok: false, value: null, original, transformed: false, warnings, errorCode: "INVALID" };
}

// ── Normalizers ─────────────────────────────────────────────────────────────

export function normalizeExternalId(input: unknown): NormalizerResult<string> {
  if (input == null) return empty(input);
  const str = String(input).trim();
  if (str === "") return empty(input);
  return success(str, input, str !== String(input));
}

export function normalizeReferenceCode(input: unknown): NormalizerResult<string> {
  if (input == null) return empty(input);
  const raw = String(input);
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (normalized === "") return empty(input);
  return success(normalized, input, normalized !== raw);
}

export function normalizeCustomerCode(input: unknown): NormalizerResult<string> {
  if (input == null) return empty(input);
  const str = String(input).trim();
  if (str === "") return empty(input);
  const normalized = str.replace(/\s+/g, "");
  return success(normalized, input, normalized !== str);
}

export function normalizeDocumentNumber(input: unknown): NormalizerResult<string> {
  if (input == null) return empty(input);
  const str = String(input).trim();
  if (str === "") return empty(input);
  const normalized = str.replace(/\s+/g, "").toUpperCase();
  return success(normalized, input, normalized !== str);
}

export function normalizeText(input: unknown): NormalizerResult<string> {
  if (input == null) return empty(input);
  const str = String(input).trim();
  if (str === "") return empty(input);
  const normalized = str.replace(/\s+/g, " ");
  return success(normalized, input, normalized !== str);
}

export function normalizeEmail(input: unknown): NormalizerResult<string> {
  if (input == null) return empty(input);
  const str = String(input).trim().toLowerCase();
  if (str === "") return empty(input);
  const warnings: string[] = [];
  if (!str.includes("@") || !str.includes(".")) {
    return invalid(input, ["Invalid email structure"]);
  }
  return success(str, input, str !== String(input), warnings);
}

export function normalizePhone(input: unknown): NormalizerResult<string> {
  if (input == null) return empty(input);
  const raw = String(input).trim();
  if (raw === "") return empty(input);
  const normalized = raw.replace(/[\s\-().]/g, "");
  if (normalized === "" || !/^\+?\d{7,15}$/.test(normalized)) {
    return invalid(input, ["Phone number format not recognized"]);
  }
  return success(normalized, input, normalized !== raw);
}

export function normalizeDecimal(input: unknown): NormalizerResult<number> {
  if (input == null) return empty(input);

  let num: number;

  if (typeof input === "number") {
    num = input;
  } else if (typeof input === "object" && input !== null && "toString" in input) {
    // Decimal-like (e.g., Prisma Decimal)
    const str = String(input).trim().replace(/,/g, "");
    num = parseFloat(str);
  } else {
    const str = String(input).trim().replace(/,/g, "");
    if (str === "") return empty(input);
    num = parseFloat(str);
  }

  if (!isFinite(num)) {
    return invalid(input, ["Value is NaN or Infinity"]);
  }

  return success(num, input, typeof input !== "number");
}

export function normalizeInteger(input: unknown): NormalizerResult<number> {
  if (input == null) return empty(input);

  let num: number;

  if (typeof input === "number") {
    num = Math.round(input);
  } else {
    const str = String(input).trim().replace(/,/g, "");
    if (str === "") return empty(input);
    num = parseInt(str, 10);
  }

  if (!isFinite(num)) {
    return invalid(input, ["Value is NaN or Infinity"]);
  }

  const warnings: string[] = [];
  if (typeof input === "number" && input !== num) {
    warnings.push("Rounded from decimal");
  }

  return success(num, input, typeof input !== "number" || input !== num, warnings);
}

export function normalizeDate(input: unknown): NormalizerResult<string> {
  if (input == null) return empty(input);

  let date: Date;

  if (input instanceof Date) {
    date = input;
  } else if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "") return empty(input);
    date = new Date(trimmed);
  } else if (typeof input === "number") {
    // Reject unreasonable timestamps
    if (input < 0 || input > 4102444800000) {
      return invalid(input, ["Timestamp out of reasonable range"]);
    }
    date = new Date(input);
  } else {
    return invalid(input, ["Unsupported date input type"]);
  }

  if (isNaN(date.getTime())) {
    return invalid(input, ["Invalid date"]);
  }

  const iso = date.toISOString();
  return success(iso, input, true);
}

export function normalizeBoolean(input: unknown): NormalizerResult<boolean> {
  if (input == null) return empty(input);

  if (typeof input === "boolean") return success(input, input, false);

  if (typeof input === "number") {
    if (input === 1) return success(true, input, true);
    if (input === 0) return success(false, input, true);
    return invalid(input, ["Numeric value is not 0 or 1"]);
  }

  if (typeof input === "string") {
    const lower = input.trim().toLowerCase();
    if (["true", "1", "yes", "si", "sí"].includes(lower)) return success(true, input, true);
    if (["false", "0", "no"].includes(lower)) return success(false, input, true);
    return invalid(input, ["String value not recognized as boolean"]);
  }

  return invalid(input, ["Unsupported boolean input type"]);
}

export function normalizeCountryCode(input: unknown): NormalizerResult<string> {
  if (input == null) return empty(input);
  const str = String(input).trim().toUpperCase();
  if (str === "") return empty(input);
  if (str.length < 2 || str.length > 3) {
    return invalid(input, ["Country code must be 2 or 3 characters"]);
  }
  return success(str, input, str !== String(input));
}

export function normalizeCity(input: unknown): NormalizerResult<string> {
  if (input == null) return empty(input);
  const str = String(input).trim();
  if (str === "") return empty(input);
  const normalized = str.replace(/\s+/g, " ");
  return success(normalized, input, normalized !== str);
}

export function normalizeNullableString(input: unknown): NormalizerResult<string | null> {
  if (input == null) return success(null, input, false);
  const str = String(input).trim();
  if (str === "") return success(null, input, true);
  return success(str, input, str !== String(input));
}
