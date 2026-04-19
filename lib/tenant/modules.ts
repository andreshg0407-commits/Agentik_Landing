/**
 * lib/tenant/modules.ts
 *
 * Per-org module feature flags backed by TenantModule in Prisma.
 *
 * Design:
 *   - Open by default: no rows in TenantModule = all modules enabled.
 *   - Only explicit `enabled: false` rows disable a module.
 *   - Safe to call from layout (server component); results are not cached
 *     at module level so Next.js request-level deduplication applies.
 *
 * Usage:
 *   const mods = await getEnabledModules(orgId);
 *   if (mods.has("sales")) { ... }
 */

import { prisma } from "@/lib/prisma";

// ── Module key registry ────────────────────────────────────────────────────────

/**
 * Maps the first URL path segment after /<orgSlug>/ to its owning ModuleKey.
 *
 * Rules:
 *   - Exact match on the segment only (sub-paths inherit the parent module).
 *   - Ordered: first match wins (though no two entries share a segment today).
 *   - Segments not listed here resolve to null → no guard applied (open).
 */
export const ROUTE_MODULE_MAP: ReadonlyArray<[string, ModuleKey]> = [
  ["dashboard",     "dashboard"],
  ["executive",     "torre_control"],
  ["agentik",       "agentik"],
  ["finance",       "finance"],
  ["sales",         "sales"],
  ["data-explorer", "sales"],
  ["reconciliation","sales"],
  ["customer-360",  "sales"],
  ["pipeline",      "sales"],
  ["reports",       "sales"],
  ["collections",   "collections"],
  ["workforce",     "workforce"],
  ["runs",          "runs"],
  ["events",        "events"],
  ["alerts",        "alerts"],
  ["documents",     "documents"],
  ["knowledge",     "knowledge"],
  ["agents",        "agents"],
  ["integrations",  "integrations"],
  ["sag",           "integrations"],
  ["settings",      "settings"],
  ["whatsapp",      "whatsapp"],
] as const;

/**
 * Resolves the ModuleKey responsible for a given pathname.
 *
 * @param orgSlug  The org slug (first segment of every app route).
 * @param pathname Full pathname, e.g. "/castillitos/finance/overview".
 *                 Pass "" or undefined when the path is unknown → returns null.
 * @returns The matching ModuleKey, or null if the path is unrecognised.
 */
export function resolveModuleForPath(
  orgSlug: string,
  pathname: string,
): ModuleKey | null {
  if (!pathname) return null;

  // Strip leading slash, then strip orgSlug prefix.
  // e.g. "/castillitos/finance/overview" → "finance/overview"
  const withoutLeadingSlash = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const prefix = orgSlug + "/";
  const afterOrg = withoutLeadingSlash.startsWith(prefix)
    ? withoutLeadingSlash.slice(prefix.length)
    : withoutLeadingSlash;

  // Take only the first segment.
  const segment = afterOrg.split("/")[0];
  if (!segment) return null;

  const entry = ROUTE_MODULE_MAP.find(([path]) => path === segment);
  return entry ? entry[1] : null;
}

// ── Module key registry ────────────────────────────────────────────────────────

/**
 * Canonical module keys.
 * Each key maps to one or more sidebar sections in the layout.
 * Keep in sync with the nav definition in app/(app)/[orgSlug]/layout.tsx.
 */
export const MODULE_KEYS = [
  "dashboard",       // Centro de Operaciones
  "torre_control",   // Torre de Control / executive
  "agentik",         // Agentik agents
  "finance",         // Finanzas / FP&A
  "sales",           // Control Comercial + all sub-pages
  "collections",     // Cola de Cobranza + campañas + rendimiento
  "workforce",       // Workforce · RRHH
  "runs",            // Ejecuciones
  "events",          // Eventos
  "alerts",          // Alertas
  "documents",       // Documentos
  "knowledge",       // Conocimiento
  "agents",          // Agentes
  "integrations",    // Integraciones + SAG write sub-pages
  "settings",        // Configuración
  "whatsapp",        // WhatsApp Business AI module (opt-in only)
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/**
 * Modules that are OPT-IN only — they must be explicitly enabled via
 * setModuleEnabled(..., true) before appearing in getEnabledModules().
 *
 * Rationale: unlike legacy open-by-default modules, new channel modules
 * (WhatsApp, etc.) require deliberate activation per tenant so they don't
 * silently appear for existing orgs that predate the feature.
 */
const OPT_IN_MODULES = new Set<ModuleKey>(["whatsapp"]);

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Returns the set of enabled module keys for an organization.
 *
 * Semantics: if no TenantModule rows exist for the org, ALL modules are enabled
 * (open-by-default for existing tenants that predate this feature).
 * A module is disabled only when a row with `enabled: false` exists.
 *
 * @param organizationId  The org's DB id (not slug).
 */
export async function getEnabledModules(
  organizationId: string,
): Promise<Set<ModuleKey>> {
  const rows = await (prisma as any).tenantModule.findMany({
    where:  { organizationId },
    select: { moduleKey: true, enabled: true },
  }) as Array<{ moduleKey: string; enabled: boolean }>;

  const rowMap = new Map(rows.map(r => [r.moduleKey, r.enabled]));

  return new Set(
    MODULE_KEYS.filter(k => {
      if (OPT_IN_MODULES.has(k)) {
        // Opt-in modules are only enabled when an explicit enabled=true row exists.
        // They are NEVER on by default — existing tenants must opt in.
        return rowMap.get(k) === true;
      }
      // Legacy open-by-default: enabled unless an explicit enabled=false row exists.
      return rowMap.get(k) !== false;
    }),
  );
}

/**
 * Enables or disables a module for an org.
 * Upserts a TenantModule row — safe to call multiple times.
 */
export async function setModuleEnabled(
  organizationId: string,
  moduleKey:      ModuleKey,
  enabled:        boolean,
): Promise<void> {
  await (prisma as any).tenantModule.upsert({
    where:  { organizationId_moduleKey: { organizationId, moduleKey } },
    create: { organizationId, moduleKey, enabled },
    update: { enabled },
  });
}
