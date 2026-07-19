/**
 * lib/copilot/knowledge/context-resolver.ts
 *
 * Agentik Knowledge Foundation — Context Resolver Foundation
 * Sprint: AGENTIK-COPILOT-KNOWLEDGE-FOUNDATION-01
 *
 * Structural foundation for understanding the operational context
 * in which Copilot operates at any given moment.
 *
 * This is a type foundation only. No I/O, no DB calls, no runtime deps.
 * Runtime implementations extend ContextResolver through the adapter pattern:
 *   - PathnameContextResolver  → resolves from Next.js pathname
 *   - SessionContextResolver   → resolves from session + DB
 *   - TestContextResolver      → resolves from static fixture (tests only)
 */

import type { DomainId } from "./domain-registry";
import type { CapabilityId } from "./capability-registry";
import type { ActionId } from "./action-registry";

// ── Permission model ───────────────────────────────────────────────────────────

export type UserRole =
  | "SUPER_ADMIN"    // Full platform access
  | "AGENTIK_ADMIN"  // Admin within Agentik OS
  | "ORG_ADMIN"      // Organization administrator
  | "ORG_MEMBER"     // Standard organization member
  | "ORG_VIEWER";    // Read-only access

export interface UserPermissions {
  role:               UserRole;
  canExecuteActions:  boolean;
  canApproveItems:    boolean;
  canExportData:      boolean;
  canManageAgents:    boolean;
  allowedDomains:     DomainId[];    // Empty = all domains allowed for this role
  blockedActions:     ActionId[];    // Explicitly blocked actions for this role
}

// ── Tenant context ─────────────────────────────────────────────────────────────

export interface TenantContext {
  id:                  string;
  slug:                string;
  name:                string;
  activeDomains:       DomainId[];       // Domains enabled for this tenant
  activeCapabilities:  CapabilityId[];   // Capabilities available (based on integrations)
  integrations:        string[];         // Active integration adapter IDs (e.g. "sag", "shopify")
  locale:              string;           // e.g. "es-CO"
  currency:            string;           // e.g. "COP"
  timezone:            string;           // e.g. "America/Bogota"
}

// ── User context ───────────────────────────────────────────────────────────────

export interface UserContext {
  id:          string;
  name:        string;
  email:       string;
  permissions: UserPermissions;
}

// ── Navigation context ─────────────────────────────────────────────────────────

export interface NavigationContext {
  module:      string;         // e.g. "finanzas/conciliacion"
  screen:      string;         // e.g. "manual-workspace"
  domainHints: DomainId[];     // Domains inferred from current navigation
  entityHints: string[];       // EntityId values inferred from current screen
}

// ── Full operational context ───────────────────────────────────────────────────

export interface AgentikContext {
  tenant:     TenantContext;
  user:       UserContext;
  navigation: NavigationContext;
  timestamp:  Date;
}

// ── Context resolver interface ─────────────────────────────────────────────────

export interface ContextResolver {
  resolve():                                  Promise<AgentikContext>;
  getActiveDomains():                         DomainId[];
  getAvailableCapabilities():                 CapabilityId[];
  getAvailableActions():                      ActionId[];
  canExecuteAction(actionId: ActionId):       boolean;
}

// ── Null context (safe default before resolution) ─────────────────────────────

export const NULL_CONTEXT: AgentikContext = {
  tenant: {
    id:                 "",
    slug:               "",
    name:               "",
    activeDomains:      [],
    activeCapabilities: [],
    integrations:       [],
    locale:             "es-CO",
    currency:           "COP",
    timezone:           "America/Bogota",
  },
  user: {
    id:    "",
    name:  "",
    email: "",
    permissions: {
      role:               "ORG_VIEWER",
      canExecuteActions:  false,
      canApproveItems:    false,
      canExportData:      false,
      canManageAgents:    false,
      allowedDomains:     [],
      blockedActions:     [],
    },
  },
  navigation: {
    module:      "",
    screen:      "",
    domainHints: [],
    entityHints: [],
  },
  timestamp: new Date(0),
};

// ── Module → Domain hint map (pure function, no I/O) ──────────────────────────

const MODULE_DOMAIN_HINTS: Record<string, DomainId[]> = {
  "finanzas/conciliacion": ["conciliacion", "bancos", "recaudos", "pagos"],
  "finanzas/tesoreria":    ["bancos", "cartera", "pagos", "recaudos"],
  "finanzas/cierre":       ["conciliacion", "bancos"],
  "finanzas/planeacion":   ["ventas", "cartera", "compras"],
  "finanzas/documentos":   ["ventas", "cartera"],
  "agentik/marketing-studio": ["marketing", "productos"],
  "pipeline":              ["clientes", "ventas"],
  "integrations":          [],
  "inventario":            ["inventario", "productos"],
  "compras":               ["compras", "inventario", "productos"],
};

export function resolveDomainsFromModule(module: string): DomainId[] {
  const exact = MODULE_DOMAIN_HINTS[module];
  if (exact) return exact;
  const prefix = Object.keys(MODULE_DOMAIN_HINTS).find(k =>
    module.startsWith(k)
  );
  return prefix ? (MODULE_DOMAIN_HINTS[prefix] ?? []) : [];
}
