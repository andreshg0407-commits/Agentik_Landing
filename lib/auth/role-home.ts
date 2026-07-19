/**
 * lib/auth/role-home.ts
 *
 * Maps a tenant membership Role to the path segment that represents
 * that role's natural home module.
 *
 * Used by app/(app)/[orgSlug]/page.tsx to redirect users on first entry.
 *
 * Design:
 *   - Pure function — no DB access, no side effects.
 *   - Returns a path segment (no leading slash, no orgSlug prefix).
 *     The caller is responsible for building the full URL.
 *   - Unknown/future roles fall back to FALLBACK_HOME.
 *
 * Role → business area mapping (Prisma Role enum):
 *
 *   SUPER_ADMIN  Agentik internal admins       → executive (highest visibility)
 *   ORG_ADMIN    Org-level admin / CEO          → executive
 *   MANAGER      Department managers / directos → executive
 *   OPERATOR     Day-to-day operations          → dashboard
 *   VIEWER       Read-only (commercial viewers) → sales
 *   BILLING      Finance / accounting team      → finance
 *
 * Note: roles like "SALES", "RRHH", "FINANCE" do not exist as separate
 * Prisma Role enum values — they are business labels that currently map
 * to OPERATOR or VIEWER. Once dedicated roles are added to the schema,
 * extend ROLE_HOME_MAP here. See follow-up recommendations in the delivery.
 */

import type { Role } from "@prisma/client";

/** Fallback path segment when no mapping is found. Safe for all roles. */
export const FALLBACK_HOME = "executive" as const;

/**
 * Full mapping of every Role enum value to its home path segment.
 * Keyed exhaustively so TypeScript flags missing roles on enum expansion.
 */
const ROLE_HOME_MAP: Record<Role, string> = {
  SUPER_ADMIN:   "executive",   // Agentik superuser — full executive override
  AGENTIK_ADMIN: "agentik",     // Agentik internal staff — straight to platform console
  ORG_ADMIN:     "executive",   // Client org admin — Torre de Control
  MANAGER:       "executive",   // Management — Torre de Control
  OPERATOR:      "dashboard",   // Operations — Centro de Operaciones
  VIEWER:        "sales",       // Commercial viewer — Control Comercial
  BILLING:       "finance",     // Finance / accounting — Finanzas
};

/**
 * Returns the home path segment for a given role.
 *
 * @param role  Prisma Role enum value from TenantContext.
 * @returns     Path segment, e.g. "executive" | "dashboard" | "sales" | "finance".
 *              Never returns a leading slash.
 */
export function getRoleHome(role: Role): string {
  return ROLE_HOME_MAP[role] ?? FALLBACK_HOME;
}
