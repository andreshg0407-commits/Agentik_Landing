/**
 * lib/tenant/modules.ts
 *
 * Per-org module feature flags backed by TenantModule in Prisma.
 *
 * Sprint: AGENTIK-TENANT-MODULE-ENTITLEMENTS-BILLING-01
 *
 * Design:
 *   - CLOSED BY DEFAULT: missing TenantModule row = NOT ENABLED.
 *   - Only an explicit `enabled: true` row enables a module.
 *   - SUPER_ADMIN internal access is a separate bypass handled by
 *     filterModulesByRole() in module-access.ts — it does NOT convert
 *     missing tenant entitlements into tenant access.
 *
 * TENANT_MISSING_ENTITLEMENT_BEHAVIOR = DENY
 *
 * Usage:
 *   const mods = await getEnabledModules(orgId);
 *   if (mods.has("sales")) { ... }
 */

import { prisma } from "@/lib/prisma";

// ── Module key registry ────────────────────────────────────────────────────────

/**
 * Maps URL path prefixes after /<orgSlug>/ to their owning ModuleKey.
 *
 * Rules:
 *   - Multi-segment prefixes are supported (e.g. "agentik/marketing-studio").
 *   - Longer (more specific) entries take precedence over shorter ones.
 *     resolveModuleForPath() sorts by length descending before matching.
 *   - Exact match OR startsWith(prefix + "/") — no partial-segment matches.
 *   - Paths not listed here resolve to null → no guard applied (open).
 *
 * IMPORTANT: when adding a multi-segment entry, always also add the shorter
 * parent prefix if it needs its own module gate (e.g. both
 * "agentik/marketing-studio" AND "agentik" should be listed).
 */
export const ROUTE_MODULE_MAP: ReadonlyArray<[string, ModuleKey]> = [
  // ── Multi-segment entries (more specific — must come before their parents) ──
  // Marketing Studio is a separate module from the internal Agentik console.
  // ORG_ADMIN / MANAGER can access marketing-studio but NOT the full agentik console.
  ["agentik/marketing-studio",     "marketing_studio"],
  // Torre de Control drilldown workspaces — same gate as the parent /executive page.
  ["finanzas/torre-control",        "torre_control"],
  // Finanzas submodules — gated by the "finance" module key.
  ["finanzas/tesoreria",            "finance"],
  ["finanzas/documentos",           "finance"],
  ["finanzas/cierre",               "finance"],
  ["finanzas/planeacion",           "finance"],
  ["finanzas/facturas",             "finance"],

  // ── Single-segment entries ──────────────────────────────────────────────────
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
  // ── Comercial subpaths → gated by "sales" module key ────────────────────────
  ["comercial",     "sales"],
  // ── Producción domain → separate product, gated by "production" module key ──
  ["produccion",    "production"],
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
  // e.g. "/castillitos/agentik/marketing-studio/foto-estudio/new"
  //   →  "agentik/marketing-studio/foto-estudio/new"
  const withoutLeadingSlash = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const prefix = orgSlug + "/";
  const afterOrg = withoutLeadingSlash.startsWith(prefix)
    ? withoutLeadingSlash.slice(prefix.length)
    : withoutLeadingSlash;

  if (!afterOrg) return null;

  // Sort by path length descending so longer (more specific) entries match first.
  // This ensures "agentik/marketing-studio" wins over "agentik" for marketing-studio paths.
  const sorted = ([...ROUTE_MODULE_MAP] as Array<[string, ModuleKey]>)
    .sort((a, b) => b[0].length - a[0].length);

  const entry = sorted.find(([path]) =>
    afterOrg === path || afterOrg.startsWith(path + "/"),
  );
  return entry ? entry[1] : null;
}

// ── Module key registry ────────────────────────────────────────────────────────

/**
 * Canonical module keys.
 * Each key maps to one or more sidebar sections in the layout.
 * Keep in sync with the nav definition in app/(app)/[orgSlug]/layout.tsx.
 */
export const MODULE_KEYS = [
  // ── Client operational modules ─────────────────────────────────────────────
  "dashboard",         // Centro de Operaciones
  "torre_control",     // Torre de Control / executive
  "finance",           // Finanzas / FP&A
  "sales",             // Control Comercial + all sub-pages
  "collections",       // Cola de Cobranza + campañas + rendimiento
  "workforce",         // Workforce · RRHH
  "alerts",            // Alertas
  "documents",         // Documentos
  "knowledge",         // Conocimiento
  // ── Operaciones opt-in sub-modules ──────────────────────────────────────────
  "inventory",         // Inventario (opt-in)
  "production",        // Producción (opt-in)
  "purchases",         // Compras (opt-in)
  "dispatch",          // Despacho (opt-in)
  // ── Marketing Studio ────────────────────────────────────────────────────────
  "marketing_studio",  // Marketing Studio — accessible to ORG_ADMIN / MANAGER
  // ── IA Empresarial (client-facing AI layer, opt-in per tenant) ────────────
  "copilot",           // IA Copilot — estrategia, chat, consultas (opt-in)
  "strategic_memory",  // Memoria Estratégica (opt-in)
  "prompts",           // Biblioteca de Prompts (opt-in)
  "playbooks",         // Playbooks IA (opt-in)
  "ai_lab",            // Lab IA — experimentos y prototipos (opt-in)
  // ── Internal Agentik console ────────────────────────────────────────────────
  "agentik",           // Agentik internal console (SUPER_ADMIN / AGENTIK_ADMIN only)
  "runs",              // Ejecuciones
  "events",            // Eventos
  "agents",            // Agentes
  "integrations",      // Integraciones + SAG write sub-pages
  "settings",          // Configuración
  // ── Platform admin (SUPER_ADMIN only) ────────────────────────────────────
  "tenants_admin",     // Gestión de Tenants (SUPER_ADMIN)
  "plans_admin",       // Planes y Facturación (SUPER_ADMIN)
  "feature_flags_admin", // Feature Flags (SUPER_ADMIN)
  // ── Opt-in channel modules ─────────────────────────────────────────────────
  "whatsapp",          // WhatsApp Business AI module (opt-in only)
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

// ── Internal-only module keys (never gated by tenant entitlements) ──────────

/**
 * Modules that are INTERNAL to the Agentik platform.
 * These are NOT tenant-contracted modules — they are infrastructure/admin
 * modules that SUPER_ADMIN and AGENTIK_ADMIN access independently of
 * tenant entitlements.
 *
 * The tenant entitlement system does NOT gate these — role-based access
 * in module-access.ts handles them exclusively.
 */
const INTERNAL_MODULE_KEYS = new Set<ModuleKey>([
  "agentik", "runs", "events", "agents", "integrations", "settings",
  "tenants_admin", "plans_admin", "feature_flags_admin",
]);

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Returns the set of enabled module keys for an organization.
 *
 * TENANT_MISSING_ENTITLEMENT_BEHAVIOR = DENY
 *
 * Semantics:
 *   - CLOSED BY DEFAULT: a module is only enabled when a TenantModule row
 *     with `enabled: true` exists for that org.
 *   - Missing row = NOT ENABLED (denied).
 *   - Internal/platform modules are always included — they are gated by
 *     role permissions in module-access.ts, not by tenant entitlements.
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
      // Internal modules are never gated by tenant entitlements.
      // Their visibility is controlled exclusively by role permissions.
      if (INTERNAL_MODULE_KEYS.has(k)) return true;

      // Tenant-contracted modules: CLOSED BY DEFAULT.
      // Only enabled when an explicit enabled=true row exists.
      return rowMap.get(k) === true;
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
