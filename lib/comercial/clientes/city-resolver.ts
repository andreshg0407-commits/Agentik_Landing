/**
 * City resolver for CustomerProfile.city field.
 *
 * Two code systems exist:
 *   1. SAG internal FK codes (ka_ni_ciudad) — short numerics (e.g. "1", "1142"),
 *      no lookup table available. These are suppressed.
 *   2. CRM DANE DIVIPOLA codes — 5-digit municipal codes (e.g. "05001" = Medellin).
 *      These are resolved via dane-municipios.ts.
 *
 * Strategy: try DANE resolution first. If it fails, suppress pure-numeric values.
 *
 * COMMERCIAL-STABILIZATION-01 Phase 1 + COMMERCIAL-DATA-FOUNDATION-01 Phase 6
 */

import { resolveDaneCode } from "@/lib/comercial/foundation/dane-municipios";

const NUMERIC_ONLY = /^\d+$/;

/**
 * Resolves a raw city value to a displayable string.
 * - Try DANE DIVIPOLA lookup first (handles CRM 5-digit codes)
 * - If DANE fails and value is pure numeric → null (suppress SAG codes)
 * - If it already looks like a city name → pass through
 * - If null/empty → null
 */
export function resolveCity(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === "") return null;
  const trimmed = raw.trim();

  // Try DANE resolution (handles "05001", "5001", "08001", etc.)
  const daneName = resolveDaneCode(trimmed);
  if (daneName) return daneName;

  // Not a DANE code — suppress remaining numerics (SAG internal codes)
  if (NUMERIC_ONLY.test(trimmed)) return null;

  // Already a city name string
  return trimmed;
}

/**
 * Resolves city from CRM billing_address_city field specifically.
 * CRM stores DANE DIVIPOLA codes (98.7% of CRM-sourced profiles).
 */
export function resolveCrmCity(crmCityCode: string | null | undefined): string | null {
  if (!crmCityCode || crmCityCode.trim() === "") return null;
  return resolveDaneCode(crmCityCode.trim());
}

/**
 * Display-safe city label. Returns "Sin ciudad" when no name is available.
 */
export function displayCity(raw: string | null | undefined): string {
  return resolveCity(raw) ?? "Sin ciudad";
}
