/**
 * lib/bootstrap/templates.ts
 *
 * Tenant preset templates for the Agentik Enterprise Bootstrap Accelerator.
 *
 * Each template encodes everything needed to bootstrap a new tenant:
 *   - Module bundles (which product areas to enable)
 *   - Organization settings defaults (currency, timezone, locale)
 *   - KPI flags (which widgets to surface on dashboard/executive)
 *   - Agentik preset (which AI sections + starter automations)
 *   - Workspace defaults (recommended sub-tenants)
 *   - ProjectModule overrides (which platform features to activate)
 *   - Role capability guide (who does what in this vertical)
 *
 * PORTABILITY RULES:
 *   - Zero Castillitos-specific references.
 *   - No hardcoded org IDs or slugs.
 *   - No external API calls.
 *   - Purely declarative — a serializable config object.
 *
 * Available templates:
 *   "retail-commerce"      — ERP-connected retail / distribution
 *   "fashion-wholesale"    — Multi-brand wholesale / fashion
 *   "manufacturing-lite"   — Light manufacturing + commercial ops
 */

import type { ModuleBundleKey } from "./module-bundles";
import type { ModuleKey }       from "@/lib/tenant/modules";
import type { Role }            from "@prisma/client";

// ── Sub-types ──────────────────────────────────────────────────────────────────

/**
 * Controls which KPI widgets appear on the Dashboard and Executive pages.
 * Stored in Organization.settingsJson.kpiFlags.
 * Pages read this to decide which panels to render.
 */
export interface KpiFlags {
  showCartera:         boolean;  // Receivables / aging aging panel
  showSalesTarget:     boolean;  // Sales vs. budget target card
  showGrossMargin:     boolean;  // Margin analysis panel
  showCashPosition:    boolean;  // Cash flow summary
  showAlertCount:      boolean;  // Open alert badge
  showPendingActions:  boolean;  // SAG/action queue badge
  showWorkforce:       boolean;  // Headcount / productivity
  showPipeline:        boolean;  // CRM pipeline stage view
}

/**
 * Controls which Agentik sections are shown and pre-populated.
 * Stored in Organization.settingsJson.agentikPreset.
 */
export interface AgentikPreset {
  /**
   * Which Agentik page sections are active for this tenant type.
   * The Agentik page renders all sections but reads this to decide
   * visibility priority and placeholder content.
   */
  enabledSections: AgentikSection[];

  /**
   * Starter automation slugs pre-loaded into the automations table.
   * These are template names that map to real scheduled jobs when
   * the corresponding data connectors are active.
   */
  starterAutomations: string[];

  /**
   * Suggested role-agents to feature in the "Agentes por Rol" panel.
   */
  suggestedAgents: AgentRole[];
}

export type AgentikSection =
  | "copiloto"
  | "agentes_por_rol"
  | "automatizaciones"
  | "bandeja_acciones"
  | "memoria_estrategica"
  | "laboratorio_ia";

export type AgentRole =
  | "comercial"
  | "operaciones"
  | "gerencia"
  | "rrhh"
  | "finanzas"
  | "marketing";

/**
 * Recommended workspace structure for the tenant.
 * Multiple workspaces reflect the org's brand / division / channel structure.
 */
export interface WorkspaceDefault {
  name:        string;              // Human-readable name (e.g., "Marca Principal")
  slugSuffix:  string;              // Appended to org slug: "{orgSlug}-{slugSuffix}"
  type:        "BRAND" | "DEPARTMENT" | "CLIENT" | "INTERNAL";
  description: string;
}

/**
 * Overrides for ProjectModule feature codes.
 * Extends the base DEFAULT_MODULES set from ensureMainProject.
 */
export interface ProjectModuleOverride {
  code:    string;   // ProjectModule.code (e.g., "LUCA_MARKETING")
  enabled: boolean;
}

/**
 * Per-role guidance: which home path + capabilities this role has.
 * Stored as documentation in settingsJson.roleConfig.
 * Not yet enforced at runtime — used for onboarding UX.
 */
export interface RoleConfig {
  role:         Role;
  home:         string;      // Path segment (e.g., "executive")
  label:        string;      // Display name for this role in this vertical
  description:  string;      // Business context for this role
  canApprove:   boolean;     // Can approve SAG write operations / actions
}

/**
 * Top-level tenant template definition.
 */
export interface TenantTemplate {
  key:          string;                // Stable identifier
  displayName:  string;
  description:  string;
  industry:     string;                // Business category label

  /** Which module bundles to activate. Union is applied. */
  moduleBundles: ModuleBundleKey[];

  /**
   * Any modules explicitly forced OFF regardless of bundles.
   * Use for modules that bundles would otherwise enable but this
   * template explicitly does not want (e.g., "workforce" for lean orgs).
   */
  forceDisable?: ModuleKey[];

  /** Organization.settingsJson defaults. */
  settings: {
    currency:      string;   // ISO 4217: "COP", "USD", "EUR", "MXN"
    timezone:      string;   // IANA tz: "America/Bogota"
    localeCode:    string;   // BCP 47: "es-CO", "en-US"
    kpiFlags:      KpiFlags;
    agentikPreset: AgentikPreset;
  };

  /** Recommended initial workspaces. */
  workspaceDefaults: WorkspaceDefault[];

  /** Project-level feature overrides on top of DEFAULT_MODULES. */
  projectModuleOverrides: ProjectModuleOverride[];

  /** Guidance roles for this vertical (stored, not enforced). */
  roleConfig: RoleConfig[];
}

// ── Template registry ──────────────────────────────────────────────────────────

export const TENANT_TEMPLATES: Record<string, TenantTemplate> = {

  // ──────────────────────────────────────────────────────────────────────────
  // retail-commerce
  //
  // ERP-connected retail, distribution, or wholesale company.
  // Primary data source: SAG ERP + CSV imports.
  // Key metrics: cartera, sales vs. target, commercial alerts.
  // ──────────────────────────────────────────────────────────────────────────
  "retail-commerce": {
    key:         "retail-commerce",
    displayName: "Retail / Comercio",
    description: "Empresa de retail, distribución o comercio con ERP conectado. Foco en cartera, ventas y alertas comerciales.",
    industry:    "Retail / Distribución",

    moduleBundles: ["commercial", "finance"],

    settings: {
      currency:   "COP",
      timezone:   "America/Bogota",
      localeCode: "es-CO",
      kpiFlags: {
        showCartera:        true,
        showSalesTarget:    true,
        showGrossMargin:    false,
        showCashPosition:   true,
        showAlertCount:     true,
        showPendingActions: true,
        showWorkforce:      false,
        showPipeline:       false,
      },
      agentikPreset: {
        enabledSections:  ["copiloto", "agentes_por_rol", "automatizaciones", "bandeja_acciones", "memoria_estrategica"],
        starterAutomations: [
          "cartera-import-daily",
          "sales-pivot-import",
          "alert-engine-daily",
          "xml-reconciliation",
        ],
        suggestedAgents: ["comercial", "operaciones", "gerencia", "finanzas"],
      },
    },

    workspaceDefaults: [
      {
        name:        "Marca Principal",
        slugSuffix:  "main",
        type:        "BRAND",
        description: "Workspace principal de la marca. Consolida ventas, clientes y operaciones.",
      },
    ],

    projectModuleOverrides: [
      { code: "CONTROL_CENTER",  enabled: true  },
      { code: "RUNS",            enabled: true  },
      { code: "INTEGRATIONS",    enabled: true  },
      { code: "AGENTS",          enabled: false },
      { code: "CONVERSATIONS",   enabled: false },
      { code: "LUCA_MARKETING",  enabled: false },
      { code: "MILA_WHATSAPP",   enabled: false },
    ],

    roleConfig: [
      { role: "ORG_ADMIN", home: "executive", label: "CEO / Gerente General",    description: "Acceso completo. Aprueba operaciones SAG, ve todos los módulos.",                canApprove: true  },
      { role: "MANAGER",   home: "executive", label: "Director Comercial",       description: "Torre de Control, alertas críticas, aprobación de reportes.",                    canApprove: true  },
      { role: "OPERATOR",  home: "dashboard", label: "Analista Comercial",       description: "Crea acciones, sube datos, opera el CRM y la cartera.",                          canApprove: false },
      { role: "BILLING",   home: "finance",   label: "Contadora / Finanzas",     description: "Módulo Finance: FP&A, conciliación, DIAN. Sin acceso a CRM.",                   canApprove: false },
      { role: "VIEWER",    home: "sales",     label: "Vendedor / Representante", description: "Ve su cartera y clientes. No crea operaciones.",                                 canApprove: false },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // fashion-wholesale
  //
  // Multi-brand fashion or wholesale company.
  // Multiple brand workspaces, marketing intelligence, pipeline CRM.
  // No ERP in day 1 — connectors added post-onboarding.
  // ──────────────────────────────────────────────────────────────────────────
  "fashion-wholesale": {
    key:         "fashion-wholesale",
    displayName: "Moda / Mayorista",
    description: "Empresa de moda, textil o mayorista con múltiples marcas. Foco en pipeline, conocimiento de producto y marketing.",
    industry:    "Moda / Textil / Mayorista",

    moduleBundles: ["commercial", "marketing", "executive"],

    forceDisable: ["finance", "workforce", "runs"],

    settings: {
      currency:   "COP",
      timezone:   "America/Bogota",
      localeCode: "es-CO",
      kpiFlags: {
        showCartera:        false,
        showSalesTarget:    true,
        showGrossMargin:    true,
        showCashPosition:   false,
        showAlertCount:     true,
        showPendingActions: false,
        showWorkforce:      false,
        showPipeline:       true,
      },
      agentikPreset: {
        enabledSections:  ["copiloto", "agentes_por_rol", "bandeja_acciones", "memoria_estrategica", "laboratorio_ia"],
        starterAutomations: [
          "pipeline-sync-daily",
          "alert-engine-daily",
          "customer-scoring-weekly",
        ],
        suggestedAgents: ["comercial", "gerencia", "marketing"],
      },
    },

    workspaceDefaults: [
      {
        name:        "Marca Principal",
        slugSuffix:  "brand-1",
        type:        "BRAND",
        description: "Primera línea de marca. Gestiona catálogo, clientes y ventas.",
      },
      {
        name:        "Segunda Línea",
        slugSuffix:  "brand-2",
        type:        "BRAND",
        description: "Segunda línea o marca complementaria. Estructura lista para activar.",
      },
    ],

    projectModuleOverrides: [
      { code: "CONTROL_CENTER",  enabled: true  },
      { code: "RUNS",            enabled: false },
      { code: "INTEGRATIONS",    enabled: false },
      { code: "AGENTS",          enabled: true  },
      { code: "CONVERSATIONS",   enabled: false },
      { code: "LUCA_MARKETING",  enabled: true  },
      { code: "MILA_WHATSAPP",   enabled: true  },
    ],

    roleConfig: [
      { role: "ORG_ADMIN", home: "executive", label: "CEO / Fundador",           description: "Visión completa de marcas, campañas y ventas.",                                  canApprove: true  },
      { role: "MANAGER",   home: "executive", label: "Brand Manager",            description: "Gestiona colecciones, pipeline y estrategia de marca.",                          canApprove: true  },
      { role: "OPERATOR",  home: "dashboard", label: "Representante de Ventas",  description: "Pipeline CRM, clientes, pedidos. Vista por canal.",                              canApprove: false },
      { role: "VIEWER",    home: "sales",     label: "Showroom / Freelance",     description: "Solo ve clientes y catálogo asignado.",                                           canApprove: false },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // manufacturing-lite
  //
  // Light manufacturing company with commercial + ops + finance needs.
  // Workforce tracking, production runs, ERP integration, cash position.
  // ──────────────────────────────────────────────────────────────────────────
  "manufacturing-lite": {
    key:         "manufacturing-lite",
    displayName: "Manufactura Ligera",
    description: "Empresa de manufactura o transformación con necesidades de operaciones, finanzas y comercial integradas.",
    industry:    "Manufactura / Producción",

    moduleBundles: ["commercial", "finance", "executive", "operations"],

    settings: {
      currency:   "COP",
      timezone:   "America/Bogota",
      localeCode: "es-CO",
      kpiFlags: {
        showCartera:        true,
        showSalesTarget:    true,
        showGrossMargin:    true,
        showCashPosition:   true,
        showAlertCount:     true,
        showPendingActions: true,
        showWorkforce:      true,
        showPipeline:       false,
      },
      agentikPreset: {
        enabledSections:  ["copiloto", "agentes_por_rol", "automatizaciones", "bandeja_acciones", "memoria_estrategica"],
        starterAutomations: [
          "cartera-import-daily",
          "alert-engine-daily",
          "sales-pivot-import",
          "xml-reconciliation",
          "workforce-sync-weekly",
        ],
        suggestedAgents: ["comercial", "operaciones", "gerencia", "finanzas", "rrhh"],
      },
    },

    workspaceDefaults: [
      {
        name:        "Producción y Operaciones",
        slugSuffix:  "ops",
        type:        "DEPARTMENT",
        description: "Departamento de producción: runs, workforce, integrations.",
      },
    ],

    projectModuleOverrides: [
      { code: "CONTROL_CENTER",  enabled: true  },
      { code: "RUNS",            enabled: true  },
      { code: "INTEGRATIONS",    enabled: true  },
      { code: "AGENTS",          enabled: true  },
      { code: "CONVERSATIONS",   enabled: false },
      { code: "LUCA_MARKETING",  enabled: false },
      { code: "MILA_WHATSAPP",   enabled: false },
    ],

    roleConfig: [
      { role: "ORG_ADMIN", home: "executive", label: "Gerente General",       description: "Acceso completo: ops, finanzas, comercial.",                                        canApprove: true  },
      { role: "MANAGER",   home: "executive", label: "Gerente de Área",       description: "Departamento específico. Aprueba operaciones y reportes.",                          canApprove: true  },
      { role: "OPERATOR",  home: "dashboard", label: "Analista / Operador",   description: "Ingreso de datos, runs de producción, alertas.",                                    canApprove: false },
      { role: "BILLING",   home: "finance",   label: "Jefe de Finanzas",      description: "FP&A, nómina, cierre mensual.",                                                     canApprove: false },
      { role: "VIEWER",    home: "sales",     label: "Ejecutivo de Cuenta",   description: "Vista de clientes y cartera asignada.",                                             canApprove: false },
    ],
  },
};

// ── Public accessors ──────────────────────────────────────────────────────────

export const TEMPLATE_KEYS = Object.keys(TENANT_TEMPLATES) as string[];

export function getTemplate(key: string): TenantTemplate | null {
  return TENANT_TEMPLATES[key] ?? null;
}

/** All templates as an array — useful for listing/selecting in UI. */
export function listTemplates(): TenantTemplate[] {
  return Object.values(TENANT_TEMPLATES);
}
