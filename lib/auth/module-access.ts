/**
 * lib/auth/module-access.ts
 *
 * Role-based module visibility — the second filter layer on top of org feature flags.
 *
 * ── Two-layer access model ────────────────────────────────────────────────────
 *
 *   Layer 1 — Org feature flags:   getEnabledModules(orgId)    [lib/tenant/modules.ts]
 *   Layer 2 — Role visibility gate: filterModulesByRole(mods, role)  [this file]
 *
 *   Effective visible set = intersection(Layer 1, Layer 2)
 *
 * ── Role definitions ──────────────────────────────────────────────────────────
 *
 *   SUPER_ADMIN    — Agentik superuser. Sees everything. Override for all gates.
 *   AGENTIK_ADMIN  — Agentik internal platform staff. Sees ONLY the internal
 *                    console (agentik, runs, events, agents, integrations, settings).
 *                    Has NO access to client business data.
 *   ORG_ADMIN      — Client org administrator. Fully client-facing. Sees all
 *                    operational modules but NOT the internal console.
 *   MANAGER        — Department director. Client-facing ops + torre_control.
 *                    No internal console.
 *   OPERATOR       — Day-to-day collections + commercial ops. No executive view.
 *   BILLING        — Finance/accounting read-only. Finance + reports + documents.
 *   VIEWER         — External or read-only commercial viewer. Sales + docs only.
 *
 * ── Key hardening rules ───────────────────────────────────────────────────────
 *
 *   • isInternalRole()    → SUPER_ADMIN or AGENTIK_ADMIN only (NOT ORG_ADMIN)
 *   • AGENTIK_ADMIN sees NO: dashboard, sales, collections, finance, customer-360
 *   • ORG_ADMIN sees NO:    agentik, runs, events, agents, integrations, settings
 *   • SUPER_ADMIN can see everything (emergency override)
 */

import type { Role } from "@prisma/client";
import type { ModuleKey } from "@/lib/tenant/modules";

// ── Role hierarchy (ascending authority) ──────────────────────────────────────

export const ROLE_HIERARCHY: Role[] = [
  "VIEWER",
  "BILLING",
  "OPERATOR",
  "MANAGER",
  "ORG_ADMIN",
  "AGENTIK_ADMIN",
  "SUPER_ADMIN",
];

/** Returns the numeric rank of a role (higher = more authority). */
export function roleRank(role: Role): number {
  const idx = ROLE_HIERARCHY.indexOf(role);
  return idx === -1 ? -1 : idx;
}

/** True if `role` is at least as powerful as `minRole`. */
export function hasMinRole(role: Role, minRole: Role): boolean {
  return roleRank(role) >= roleRank(minRole);
}

// ── Role → allowed modules ─────────────────────────────────────────────────────

/**
 * Canonical module access matrix.
 *
 * AGENTIK_ADMIN and ORG_ADMIN are deliberately non-overlapping on internal modules:
 *   - AGENTIK_ADMIN: internal console only (agentik, runs, events, agents, integrations, settings)
 *   - ORG_ADMIN:     client modules only (no agentik, runs, events, integrations, settings)
 */
const ROLE_MODULES: Record<Role, readonly ModuleKey[]> = {

  // ── Internal roles ──────────────────────────────────────────────────────────

  SUPER_ADMIN: [
    // Full override — sees everything
    "dashboard", "torre_control", "agentik", "finance",
    "sales", "collections", "workforce", "runs", "events",
    "alerts", "documents", "knowledge", "agents", "integrations",
    "settings", "whatsapp",
  ],

  AGENTIK_ADMIN: [
    // Internal console only — ZERO client business data
    "agentik", "agents", "runs", "events", "integrations", "settings",
  ],

  // ── Client-facing roles ─────────────────────────────────────────────────────

  ORG_ADMIN: [
    // Org-level admin — full client view, NO internal console
    "dashboard", "torre_control", "finance",
    "sales", "collections", "workforce",
    "alerts", "documents", "knowledge", "whatsapp",
  ],

  MANAGER: [
    // Director — operational + executive view, NO internal console
    "dashboard", "torre_control", "finance",
    "sales", "collections", "workforce",
    "alerts", "documents", "knowledge", "whatsapp",
  ],

  OPERATOR: [
    // Day-to-day ops — collections + commercial, NO executive/finance
    "dashboard", "sales", "collections", "workforce",
    "alerts", "documents", "knowledge", "whatsapp",
  ],

  BILLING: [
    // Finance/accounting — finance + supporting docs only
    "finance", "documents",
  ],

  VIEWER: [
    // Read-only commercial — sales surface + content only
    "sales", "documents", "knowledge",
  ],

};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the set of ModuleKeys a role is permitted to see.
 */
export function getModulesForRole(role: Role): Set<ModuleKey> {
  return new Set(ROLE_MODULES[role] ?? []);
}

/**
 * Intersects org-enabled modules with role-allowed modules.
 * This is the authoritative visibility set used in the layout sidebar.
 *
 * @param orgModules  Result of getEnabledModules(orgId)
 * @param role        The user's org membership role
 */
export function filterModulesByRole(
  orgModules: Set<ModuleKey>,
  role:       Role,
): Set<ModuleKey> {
  const allowed = getModulesForRole(role);
  return new Set([...orgModules].filter(m => allowed.has(m)));
}

// ── Role capability flags ──────────────────────────────────────────────────────

/**
 * True for roles that have access to the internal operations console
 * (Agentik, Ejecuciones, Eventos, Integraciones, Configuración).
 *
 * HARDENED: ORG_ADMIN is explicitly excluded — internal console is for
 * Agentik staff only.
 */
export function isInternalRole(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "AGENTIK_ADMIN";
}

/**
 * True if the role can access client business data at all
 * (dashboard, sales, collections, finance, etc.).
 *
 * AGENTIK_ADMIN is explicitly excluded — platform staff do not see client data.
 */
export function isClientFacingRole(role: Role): boolean {
  return role !== "AGENTIK_ADMIN";
}

/**
 * True for roles that can launch collection campaigns.
 * Requires at least MANAGER authority on the client side,
 * or SUPER_ADMIN override.
 */
export function canManageCampaigns(role: Role): boolean {
  return role === "SUPER_ADMIN"
    || role === "ORG_ADMIN"
    || role === "MANAGER";
}

/**
 * True for roles that can record collection outcomes.
 * Any active operational role can do this; read-only roles cannot.
 */
export function canRecordOutcomes(role: Role): boolean {
  return role !== "VIEWER"
    && role !== "BILLING"
    && role !== "AGENTIK_ADMIN";
}

/**
 * True for roles that can approve or escalate alerts.
 */
export function canApproveAlerts(role: Role): boolean {
  return role === "SUPER_ADMIN"
    || role === "ORG_ADMIN"
    || role === "MANAGER";
}

/**
 * True for roles that can view the Torre de Control (executive dashboard).
 */
export function canViewExecutive(role: Role): boolean {
  return role === "SUPER_ADMIN"
    || role === "ORG_ADMIN"
    || role === "MANAGER";
}
