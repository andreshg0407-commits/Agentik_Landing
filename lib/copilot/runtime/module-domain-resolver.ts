/**
 * lib/copilot/runtime/module-domain-resolver.ts
 *
 * Agentik Copilot Runtime — Module → Domain Resolver
 * Sprint: AGENTIK-COPILOT-CONTEXT-BRIDGE-01
 *
 * Translates Agentik module paths into business domain IDs.
 * Pure business knowledge — no SAG, no tenant, no DB.
 *
 * Resolution strategy:
 *   1. Exact match on full module path
 *   2. Prefix match (handles nested routes like finanzas/conciliacion/manual-workspace)
 *   3. Top-level module family match (finanzas/* → finance cluster)
 *   4. Empty array if module is unknown
 */

import type { DomainId } from "../knowledge/domain-registry";

// ── Module domain map ──────────────────────────────────────────────────────────
//
// Keys use the shortest canonical path that identifies the module.
// Matching is prefix-based, so children inherit parent's domains.

const MODULE_DOMAIN_MAP: Array<{ prefix: string; domains: DomainId[] }> = [
  // ── Finanzas cluster ──────────────────────────────────────────────────────
  { prefix: "finanzas/conciliacion", domains: ["conciliacion", "bancos", "recaudos", "pagos"] },
  { prefix: "finanzas/tesoreria",    domains: ["bancos", "cartera", "pagos", "recaudos"] },
  { prefix: "finanzas/cierre",       domains: ["conciliacion", "bancos"] },
  { prefix: "finanzas/planeacion",   domains: ["ventas", "cartera", "compras"] },
  { prefix: "finanzas/documentos",   domains: ["ventas", "cartera"] },
  { prefix: "finanzas",              domains: ["cartera", "pagos", "recaudos", "bancos", "conciliacion"] },

  // ── Marketing cluster ─────────────────────────────────────────────────────
  { prefix: "agentik/marketing-studio", domains: ["marketing", "productos"] },
  { prefix: "marketing",                domains: ["marketing", "productos"] },

  // ── Comercial cluster ─────────────────────────────────────────────────────
  { prefix: "comercial/maletas",     domains: ["ventas", "productos", "inventario"] },
  { prefix: "comercial",             domains: ["ventas", "clientes", "productos"] },
  { prefix: "pipeline",              domains: ["ventas", "clientes"] },

  // ── Compras / Inventario cluster ──────────────────────────────────────────
  { prefix: "compras",               domains: ["compras", "inventario", "productos"] },
  { prefix: "inventario",            domains: ["inventario", "productos"] },

  // ── Operaciones cluster ───────────────────────────────────────────────────
  { prefix: "operaciones/produccion",domains: ["produccion", "inventario", "productos"] },
  { prefix: "operaciones",           domains: ["inventario", "compras", "produccion"] },

  // ── Agentik OS ────────────────────────────────────────────────────────────
  { prefix: "agentik/control-center",domains: ["alertas", "tareas"] },
  { prefix: "agentik/agentes",       domains: ["alertas", "tareas"] },
  { prefix: "agentik",               domains: ["alertas", "tareas"] },

  // ── Platform / Integrations ───────────────────────────────────────────────
  { prefix: "integrations",          domains: [] },
  { prefix: "reports",               domains: ["ventas", "cartera", "inventario"] },
];

// ── Resolver ───────────────────────────────────────────────────────────────────

export interface ModuleDomainResolution {
  module:       string;
  domains:      DomainId[];
  matchedPrefix: string | null;
}

/**
 * Resolves business domains from a module path.
 * Uses prefix matching — longer prefixes win.
 */
export function resolveDomainsForModule(module: string): ModuleDomainResolution {
  const normalized = module.replace(/^\//, "").toLowerCase();

  // Find the longest matching prefix (most specific match wins)
  let bestMatch: { prefix: string; domains: DomainId[] } | null = null;

  for (const entry of MODULE_DOMAIN_MAP) {
    if (normalized === entry.prefix || normalized.startsWith(entry.prefix + "/")) {
      if (!bestMatch || entry.prefix.length > bestMatch.prefix.length) {
        bestMatch = entry;
      }
    }
  }

  return {
    module:        normalized,
    domains:       bestMatch?.domains ?? [],
    matchedPrefix: bestMatch?.prefix ?? null,
  };
}

/**
 * Returns just the domain list — convenience shorthand.
 */
export function getDomainsForModule(module: string): DomainId[] {
  return resolveDomainsForModule(module).domains;
}

/**
 * Returns the primary domain for a module — the first one in the list,
 * which represents the module's main concern.
 */
export function getPrimaryDomainForModule(module: string): DomainId | null {
  const { domains } = resolveDomainsForModule(module);
  return domains[0] ?? null;
}

/**
 * Returns all modules that share at least one domain with the given module.
 * Useful for cross-module context suggestions.
 */
export function getRelatedModules(module: string): string[] {
  const { domains } = resolveDomainsForModule(module);
  if (domains.length === 0) return [];

  return MODULE_DOMAIN_MAP
    .filter(entry =>
      entry.prefix !== module &&
      entry.domains.some(d => domains.includes(d))
    )
    .map(entry => entry.prefix);
}
