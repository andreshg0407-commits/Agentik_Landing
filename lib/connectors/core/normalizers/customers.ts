/**
 * Customer normalizer — helpers for building UnifiedCustomer records.
 */

import type { CustomerType, UnifiedCustomer } from "../types";

// ── Type mapping ──────────────────────────────────────────────────────────────

/** Normalise an arbitrary customer-type string to a canonical CustomerType. */
export function normalizeCustomerType(raw: string | null | undefined): CustomerType {
  if (!raw) return "unknown";
  const v = raw.trim().toLowerCase();
  if (["company", "empresa", "juridica", "juridico", "business", "b2b", "persona_juridica"].includes(v)) return "company";
  if (["individual", "person", "persona", "natural", "b2c", "consumer", "persona_natural"].includes(v)) return "individual";
  return "unknown";
}

// ── Tax ID normalisation ──────────────────────────────────────────────────────

/**
 * Strip formatting characters (dots, dashes, spaces) from a tax ID.
 * Returns undefined for blank/null inputs.
 * Covers NIT (Colombia), RUT (Chile), RFC (Mexico), VAT (EU), EIN (US).
 */
export function normalizeTaxId(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const clean = raw.replace(/[\s.\-\/]/g, "").trim();
  return clean || undefined;
}

// ── Email normalisation ───────────────────────────────────────────────────────

export function normalizeEmail(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : undefined;
}

// ── Phone normalisation ───────────────────────────────────────────────────────

/** Strip non-digit characters, keep leading +. Returns undefined if <7 digits. */
export function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const clean = raw.replace(/[^\d+]/g, "").trim();
  const digits = clean.replace(/\D/g, "");
  return digits.length >= 7 ? clean : undefined;
}

// ── Customer builder ──────────────────────────────────────────────────────────

export function buildCustomer(input: UnifiedCustomer): UnifiedCustomer {
  return {
    ...input,
    type:  input.type  ?? "unknown",
    tags:  input.tags  ?? [],
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    taxId: normalizeTaxId(input.taxId),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface CustomerValidation {
  valid:    boolean;
  warnings: string[];
}

export function validateCustomer(c: UnifiedCustomer): CustomerValidation {
  const w: string[] = [];
  if (!c.sourceId)  w.push("missing sourceId");
  if (!c.name)      w.push("missing name");
  if (!c.createdAt) w.push("missing createdAt");
  return { valid: w.length === 0, warnings: w };
}
