/**
 * lib/bootstrap/module-bundles.ts
 *
 * Reusable module bundles for tenant templates.
 *
 * A bundle is a named set of ModuleKeys that should be ENABLED for a given
 * business function. When applying a bundle set to an org, any ModuleKey
 * that is not in ANY of the active bundles is explicitly disabled.
 *
 * Design:
 *   - Open-by-default semantics are preserved: this layer adds explicit
 *     TenantModule rows rather than relying on the absence of rows.
 *   - Multiple bundles can be combined per tenant template.
 *   - `settings` is always included implicitly — every tenant needs it.
 *
 * Usage:
 *   const mods = resolveModuleSet(["commercial", "finance"]);
 *   // mods is the union of all keys from those bundles
 */

import type { ModuleKey } from "@/lib/tenant/modules";

// ── Bundle key registry ────────────────────────────────────────────────────────

export const BUNDLE_KEYS = [
  "commercial",    // Full commercial intelligence stack
  "finance",       // FP&A + financial operations
  "executive",     // Strategic visibility + KPIs
  "marketing",     // Brand, content, knowledge, events
  "operations",    // Workforce, runs, integrations, documents
] as const;

export type ModuleBundleKey = (typeof BUNDLE_KEYS)[number];

// ── Bundle definitions ────────────────────────────────────────────────────────
//
// Each entry lists the ModuleKeys that the bundle activates.
// "settings" and "dashboard" are included in every bundle (implicit).

export const MODULE_BUNDLES: Record<ModuleBundleKey, ModuleKey[]> = {

  /**
   * commercial
   * Full commercial intelligence: sales pipeline, CRM, customer 360,
   * commercial alerts, agentik intelligence, report copilot.
   * Target: sales-driven businesses, retail, distribution.
   */
  commercial: [
    "dashboard",
    "torre_control",
    "sales",
    "alerts",
    "agentik",
    "documents",
    "integrations",
    "settings",
  ],

  /**
   * finance
   * FP&A, variance analysis, cash flow, reconciliation, DIAN, close score.
   * Target: finance teams; always combined with at least one other bundle.
   */
  finance: [
    "dashboard",
    "torre_control",
    "finance",
    "agentik",
    "documents",
    "integrations",
    "settings",
  ],

  /**
   * executive
   * Strategic overview: executive dashboard, KPIs, forecasting.
   * Designed as a read-heavy add-on; combine with commercial or finance.
   */
  executive: [
    "dashboard",
    "torre_control",
    "agentik",
    "finance",
    "sales",
    "alerts",
    "settings",
  ],

  /**
   * marketing
   * Brand management, knowledge base, events, campaign intelligence.
   * Target: marketing teams, fashion brands, content-heavy businesses.
   */
  marketing: [
    "dashboard",
    "agentik",
    "knowledge",
    "events",
    "sales",
    "documents",
    "settings",
  ],

  /**
   * operations
   * Workflow automation, integrations, workforce, document management.
   * Target: back-office / ops teams; supports any vertical.
   */
  operations: [
    "dashboard",
    "workforce",
    "production",
    "inventory",
    "runs",
    "integrations",
    "documents",
    "alerts",
    "settings",
  ],
};

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Returns the union of all ModuleKeys from the given bundle keys.
 * "settings" and "dashboard" are always included regardless of input.
 */
export function resolveModuleSet(bundles: ModuleBundleKey[]): Set<ModuleKey> {
  const result = new Set<ModuleKey>(["settings", "dashboard"]);
  for (const key of bundles) {
    for (const mod of MODULE_BUNDLES[key]) {
      result.add(mod);
    }
  }
  return result;
}
