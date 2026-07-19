/**
 * lib/workspace/workspace-params.ts
 *
 * Server-side helpers to extract initial workspace state from Next.js searchParams.
 * Used by Torre de Control operational detail pages to seed client table state
 * and resolve contextual back navigation.
 */

type SP = Record<string, string | string[] | undefined>;

/** Extract initial search query from ?q= param */
export function getInitialSearch(sp: SP): string {
  const v = sp["q"];
  return typeof v === "string" ? v.slice(0, 200) : "";
}

/** Extract initial filter value from a named param (e.g. ?f=B1) */
export function getInitialFilter(sp: SP, key = "f"): string {
  const v = sp[key];
  return typeof v === "string" ? v : "";
}

/**
 * Extract returnTo URL from ?returnTo= param.
 * Only accepts internal paths (must start with /).
 */
export function getReturnTo(sp: SP): string | null {
  const v = sp["returnTo"];
  return typeof v === "string" && v.startsWith("/") ? v : null;
}

const WORKSPACE_LABELS: Record<string, string> = {
  "cobros-hoy":           "Cobros de hoy",
  "cobros-identificados": "Cobros identificados",
  "consignaciones":       "Consignaciones",
  "cuentas-por-pagar":    "Cuentas por pagar",
  "executive":            "Torre de Control",
  "reconciliation":       "Conciliación",
  "collections":          "Cartera",
  "finance":              "Tesorería",
};

/**
 * Derive a human label from a returnTo URL.
 * Matches the last path segment against known workspace labels.
 */
export function getReturnLabel(returnTo: string | null): string | null {
  if (!returnTo) return null;
  const seg = returnTo.split("/").filter(Boolean).pop() ?? "";
  return WORKSPACE_LABELS[seg] ?? null;
}
