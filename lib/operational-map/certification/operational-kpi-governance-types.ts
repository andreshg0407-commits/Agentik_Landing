/**
 * lib/operational-map/certification/operational-kpi-governance-types.ts
 *
 * Operational KPI Governance — Extended Type System.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Defines the governance layer added by AGENTIK-OPS-CERTIFICATION-GOVERNANCE-01:
 *   - Dependency type classification (SAG_ONLY, AGENTIK_ONLY, HYBRID, ...)
 *   - Criticality level (CRITICAL, OPERATIONAL, INFORMATIONAL, EXPERIMENTAL)
 *   - Source truth priority (PRIMARY, SECONDARY, ENRICHMENT, VALIDATION, FALLBACK)
 *   - Formula operacional (expression + description + business definition)
 *   - SAG vs Agentik contribution separation
 *   - Governance timeline record
 *
 * Sprint: AGENTIK-OPS-CERTIFICATION-GOVERNANCE-01
 */

// ─── Dependency type ──────────────────────────────────────────────────────────

/**
 * Classifies where the KPI data originates operationally.
 *
 *   SAG_ONLY     — KPI is 100% derived from SAG tables/views/queries
 *   AGENTIK_ONLY — KPI is computed exclusively by Agentik (no SAG dependency)
 *   HYBRID       — KPI requires both SAG data AND Agentik computation
 *   CRM          — KPI comes from CRM system
 *   MANUAL       — KPI is entered manually (no automated source)
 *   EXTERNAL     — KPI comes from an external system not yet integrated
 */
export type KpiDependencyType =
  | "SAG_ONLY"
  | "AGENTIK_ONLY"
  | "HYBRID"
  | "CRM"
  | "MANUAL"
  | "EXTERNAL";

// ─── Criticality level ────────────────────────────────────────────────────────

/**
 * Operational criticality level — used to prioritize meetings and certifications.
 *
 *   CRITICAL       — blocks live operational decision-making; must be certified first
 *   OPERATIONAL    — required for day-to-day operations; important but not blocking
 *   INFORMATIONAL  — useful analytics; does not block operations
 *   EXPERIMENTAL   — under evaluation; not used in production decisions yet
 */
export type KpiCriticalityLevel =
  | "CRITICAL"
  | "OPERATIONAL"
  | "INFORMATIONAL"
  | "EXPERIMENTAL";

// ─── Source truth priority ────────────────────────────────────────────────────

/**
 * Role of a source within the multi-source governance model.
 *
 *   PRIMARY     — main data source; defines the value used in operations
 *   SECONDARY   — backup or complementary source; used when PRIMARY is unavailable
 *   ENRICHMENT  — adds context/dimensions but does not define the core value
 *   VALIDATION  — used to cross-check PRIMARY; confirms data integrity
 *   FALLBACK    — last-resort source when all others fail
 */
export type KpiSourceTruthPriority =
  | "PRIMARY"
  | "SECONDARY"
  | "ENRICHMENT"
  | "VALIDATION"
  | "FALLBACK";

// ─── Governance timeline stage ────────────────────────────────────────────────

/**
 * The 6-stage governance timeline displayed in the drawer.
 * Each stage can be: pending | done | blocked
 */
export interface GovernanceTimelineStage {
  key:         string;
  label:       string;
  description: string;
  status:      "pending" | "done" | "blocked";
  completedAt: string | null;
  completedBy: string | null;
}

export const GOVERNANCE_TIMELINE_STAGES: Omit<GovernanceTimelineStage, "status" | "completedAt" | "completedBy">[] = [
  { key: "runtime_detected",  label: "Runtime detectado",  description: "Agentik detectó datos activos para este KPI" },
  { key: "business_validated", label: "Validado negocio",  description: "El equipo de negocio aprobó la definición" },
  { key: "dba_validated",     label: "Validado DBA",       description: "SAG DBA confirmó tabla, campos y query" },
  { key: "query_approved",    label: "Query aprobada",     description: "La query SAG fue revisada y aprobada" },
  { key: "certified",         label: "Certificado",        description: "KPI certificado por Agentik + negocio + SAG" },
  { key: "production",        label: "Producción",         description: "KPI activo en producción con monitoreo vivo" },
];

// ─── KPI formula record ───────────────────────────────────────────────────────

export interface KpiFormulaRecord {
  /** Symbolic/mathematical expression: e.g. "stock_disponible / venta_promedio_30d" */
  formulaExpression:  string | null;
  /** Human-readable plain-language description of what the formula computes */
  formulaDescription: string | null;
  /** Business definition: what this KPI means operationally for the business */
  businessDefinition: string | null;
}

// ─── KPI governance record ────────────────────────────────────────────────────

/**
 * Full governance record for a single KPI.
 * Returned by GET /api/orgs/[orgSlug]/operational-map/kpi-governance/[kpiKey]
 */
export interface KpiGovernanceRecord {
  kpiKey:       string;
  entityLabel:  string;
  domain:       string;

  // ── Formula ───────────────────────────────────────────────────────────────
  formula:      KpiFormulaRecord;

  // ── Classification ────────────────────────────────────────────────────────
  dependencyType:  KpiDependencyType | null;
  criticality:     KpiCriticalityLevel | null;

  // ── SAG vs Agentik separation ─────────────────────────────────────────────
  sagContributions:     string[];
  agentikContributions: string[];

  // ── Sources ───────────────────────────────────────────────────────────────
  sources: Array<{
    id:                  string;
    sourceName:          string;
    sourceType:          string;
    sourceRole:          string;
    provider:            string;
    sourceOfTruth:       boolean;
    validationStatus:    string;
    tableName:           string | null;
    approvedQuery:       string | null;
    sagValidated:        boolean;
    businessValidated:   boolean;
    confidenceScore:     number;
    sourceContribution:  string | null;
    sourceTruthPriority: string | null;
    viewType:            string | null;   // consolidated | fuente_1 | fuente_2 | tiendas | web
    notes:               string | null;
  }>;

  // ── Timeline ──────────────────────────────────────────────────────────────
  timeline: Array<{
    id:          string;
    eventType:   string;
    description: string;
    actorId:     string;
    actorName:   string | null;
    actorRole:   string | null;
    createdAt:   string;
  }>;

  // ── Certification status ──────────────────────────────────────────────────
  certificationStatus: string | null;
  businessApproved:    boolean;
  sagApproved:         boolean;
  productionReady:     boolean;

  // ── Governance timeline stages (computed) ─────────────────────────────────
  governanceStages:    GovernanceTimelineStage[];
}

// ─── Governance PATCH input ───────────────────────────────────────────────────

export interface KpiGovernancePatchInput {
  formulaExpression?:    string;
  formulaDescription?:   string;
  businessDefinition?:   string;
  dependencyType?:       KpiDependencyType;
  criticality?:          KpiCriticalityLevel;
  sagContributions?:     string[];
  agentikContributions?: string[];
  notes?:                string;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const DEPENDENCY_TYPE_LABELS: Record<KpiDependencyType, string> = {
  SAG_ONLY:     "Fuente SAG",
  AGENTIK_ONLY: "Agentik",
  HYBRID:       "Múltiples fuentes",
  CRM:          "CRM",
  MANUAL:       "Manual",
  EXTERNAL:     "Fuente externa",
};

export const CRITICALITY_LABELS: Record<KpiCriticalityLevel, string> = {
  CRITICAL:      "Crítico",
  OPERATIONAL:   "Operacional",
  INFORMATIONAL: "Informacional",
  EXPERIMENTAL:  "Experimental",
};

export const SOURCE_PRIORITY_LABELS: Record<KpiSourceTruthPriority, string> = {
  PRIMARY:    "Primaria",
  SECONDARY:  "Secundaria",
  ENRICHMENT: "Enriquecimiento",
  VALIDATION: "Validación",
  FALLBACK:   "Fallback",
};
