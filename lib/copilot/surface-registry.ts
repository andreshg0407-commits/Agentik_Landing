/**
 * lib/copilot/surface-registry.ts
 *
 * Agentik Copilot — Surface Section Registry
 *
 * Sprint: AGENTIK-COPILOT-SURFACE-SEGREGATION-01 — Block A2
 *
 * Registers ALL rail sections with their surface visibility rules.
 *
 * PRINCIPLE: Infrastructure sections exist in the registry but are
 * flagged internal_only — they render on internal_ops/super_admin
 * surfaces only. Tenant surfaces never receive these sections.
 */

import type { SurfaceSectionRule, CopilotSurface, SectionGroup } from "./surface-types";

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Complete registry of all Copilot rail sections.
 * Order defines default display priority within each group.
 */
export const SURFACE_SECTION_REGISTRY: SurfaceSectionRule[] = [

  // ── EXECUTIVE GROUP — Always visible on tenant surfaces ──────────────────

  {
    sectionId:   "foco-ejecutivo",
    label:       "Foco Ejecutivo",
    surfaces:    ["tenant_executive", "tenant_operational", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "always",
    priority:    1,
    collapsible: false,
    defaultOpen: true,
    group:       "executive",
  },
  {
    sectionId:   "plan-operativo",
    label:       "Plan Operativo",
    surfaces:    ["tenant_executive", "tenant_operational", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "always",
    priority:    2,
    collapsible: true,
    defaultOpen: true,
    group:       "executive",
  },
  {
    sectionId:   "estado-operativo",
    label:       "Estado Operativo",
    surfaces:    ["tenant_executive", "tenant_operational", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "always",
    priority:    3,
    collapsible: true,
    defaultOpen: true,
    group:       "executive",
  },
  {
    sectionId:   "seguimiento",
    label:       "Seguimiento",
    surfaces:    ["tenant_executive", "tenant_operational", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "always",
    priority:    4,
    collapsible: true,
    defaultOpen: true,
    group:       "executive",
  },
  {
    sectionId:   "proximos-pasos",
    label:       "Próximos Pasos",
    surfaces:    ["tenant_executive", "tenant_operational", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "always",
    priority:    5,
    collapsible: true,
    defaultOpen: true,
    group:       "executive",
  },

  // ── OPERATIONS GROUP — Contextual on tenant surfaces ─────────────────────

  {
    sectionId:   "alertas-operacionales",
    label:       "Alertas",
    surfaces:    ["tenant_executive", "tenant_operational", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "contextual",
    priority:    10,
    collapsible: true,
    defaultOpen: true,
    group:       "operations",
  },
  {
    sectionId:   "tareas-activas",
    label:       "Tareas Activas",
    surfaces:    ["tenant_executive", "tenant_operational", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "contextual",
    priority:    11,
    collapsible: true,
    defaultOpen: true,
    group:       "operations",
  },
  {
    sectionId:   "operacion-supervisada",
    label:       "Operación Supervisada",
    surfaces:    ["tenant_executive", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "contextual",
    priority:    12,
    collapsible: true,
    defaultOpen: false,
    group:       "operations",
  },

  // ── COORDINATION GROUP — Contextual on tenant surfaces ───────────────────

  {
    sectionId:   "colaboracion-ia",
    label:       "Colaboración IA",
    surfaces:    ["tenant_executive", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "contextual",
    priority:    20,
    collapsible: true,
    defaultOpen: false,
    group:       "coordination",
  },
  {
    sectionId:   "memoria-estrategica",
    label:       "Memoria Estratégica",
    surfaces:    ["tenant_executive", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "contextual",
    priority:    21,
    collapsible: true,
    defaultOpen: false,
    group:       "coordination",
  },
  {
    sectionId:   "capacidades-activas",
    label:       "Capacidades Activas",
    surfaces:    ["tenant_executive", "tenant_enterprise", "internal_ops", "super_admin"],
    visibility:  "contextual",
    priority:    22,
    collapsible: true,
    defaultOpen: false,
    group:       "coordination",
  },

  // ── INFRASTRUCTURE GROUP — internal_only ─────────────────────────────────
  // These sections NEVER render on any tenant surface.
  // Only visible to: internal_ops, super_admin

  {
    sectionId:   "runtime",
    label:       "Runtime",
    surfaces:    ["internal_ops", "super_admin"],
    visibility:  "internal_only",
    priority:    30,
    collapsible: true,
    defaultOpen: true,
    group:       "infrastructure",
  },
  {
    sectionId:   "gateway",
    label:       "Integration Gateway",
    surfaces:    ["internal_ops", "super_admin"],
    visibility:  "internal_only",
    priority:    31,
    collapsible: true,
    defaultOpen: true,
    group:       "infrastructure",
  },
  {
    sectionId:   "observabilidad",
    label:       "Observabilidad",
    surfaces:    ["internal_ops", "super_admin"],
    visibility:  "internal_only",
    priority:    32,
    collapsible: true,
    defaultOpen: false,
    group:       "infrastructure",
  },
  {
    sectionId:   "vault",
    label:       "Vault",
    surfaces:    ["internal_ops", "super_admin"],
    visibility:  "internal_only",
    priority:    33,
    collapsible: true,
    defaultOpen: true,
    group:       "infrastructure",
  },
  {
    sectionId:   "dispatch",
    label:       "Dispatch",
    surfaces:    ["internal_ops", "super_admin"],
    visibility:  "internal_only",
    priority:    34,
    collapsible: true,
    defaultOpen: true,
    group:       "infrastructure",
  },
  {
    sectionId:   "incidentes",
    label:       "Incidentes",
    surfaces:    ["internal_ops", "super_admin"],
    visibility:  "internal_only",
    priority:    35,
    collapsible: true,
    defaultOpen: true,
    group:       "infrastructure",
  },
  {
    sectionId:   "replay",
    label:       "Replay",
    surfaces:    ["internal_ops", "super_admin"],
    visibility:  "internal_only",
    priority:    36,
    collapsible: true,
    defaultOpen: false,
    group:       "infrastructure",
  },
  {
    sectionId:   "integraciones",
    label:       "Integraciones",
    surfaces:    ["internal_ops", "super_admin"],
    visibility:  "internal_only",
    priority:    37,
    collapsible: true,
    defaultOpen: true,
    group:       "infrastructure",
  },
  {
    sectionId:   "bridge",
    label:       "Bridge",
    surfaces:    ["internal_ops", "super_admin"],
    visibility:  "internal_only",
    priority:    38,
    collapsible: true,
    defaultOpen: false,
    group:       "infrastructure",
  },
  {
    sectionId:   "control-center",
    label:       "Control Center",
    surfaces:    ["internal_ops", "super_admin"],
    visibility:  "internal_only",
    priority:    39,
    collapsible: true,
    defaultOpen: true,
    group:       "infrastructure",
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Returns the section rule for a given sectionId, or undefined if not found.
 */
export function getSectionRule(sectionId: string): SurfaceSectionRule | undefined {
  return SURFACE_SECTION_REGISTRY.find(r => r.sectionId === sectionId);
}

/**
 * Returns all sections belonging to a given group.
 */
export function getSectionsByGroup(group: SectionGroup): SurfaceSectionRule[] {
  return SURFACE_SECTION_REGISTRY.filter(r => r.group === group);
}

/**
 * Returns all sections that are available on a given surface.
 */
export function getSectionsForSurface(surface: CopilotSurface): SurfaceSectionRule[] {
  return SURFACE_SECTION_REGISTRY
    .filter(r => r.surfaces.includes(surface))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Returns true if a section is infrastructure-only (never visible to tenants).
 */
export function isSectionInfrastructureOnly(sectionId: string): boolean {
  const rule = getSectionRule(sectionId);
  return (rule?.visibility === "internal_only") === true;
}
