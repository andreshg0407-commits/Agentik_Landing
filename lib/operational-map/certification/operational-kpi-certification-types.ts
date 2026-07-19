/**
 * lib/operational-map/certification/operational-kpi-certification-types.ts
 *
 * Operational KPI Certification — Type System.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Defines the full lifecycle of a KPI certification:
 *   draft → reviewing → technical_validated → business_validated →
 *   sag_validated → certified → production_ready
 *
 * Sprint: AGENTIK-OPERATIONAL-KPI-CERTIFICATION-01
 */

// ─── Certification lifecycle ──────────────────────────────────────────────────

/**
 * The certification status of a KPI follows a strict progression gate.
 * production_ready is BLOCKED unless sagApproved AND businessApproved.
 *
 *   draft               — KPI identified, no validation started
 *   reviewing           — under active review by Agentik team
 *   technical_validated — connection confirmed, query/fields validated
 *   business_validated  — business owner signed off on definition + usage
 *   sag_validated       — SAG DBA confirmed table, fields, and query behavior
 *   certified           — all three validations complete
 *   production_ready    — deployed to production, live monitoring active
 *   blocked             — blocked by an unresolved issue
 *   deprecated          — KPI retired or replaced
 */
export type KpiCertificationStatus =
  | "draft"
  | "reviewing"
  | "technical_validated"
  | "business_validated"
  | "sag_validated"
  | "certified"
  | "production_ready"
  | "blocked"
  | "deprecated";

// ─── Approval action ──────────────────────────────────────────────────────────

export type KpiApprovalAction =
  | "start_review"
  | "approve_technical"
  | "approve_business"
  | "approve_sag"
  | "certify"
  | "mark_production_ready"
  | "block"
  | "revoke"
  | "deprecate";

// ─── Operational Trust Score ──────────────────────────────────────────────────

/**
 * Composite trust score 0–100.
 *
 * Components:
 *   connection     (0–40): health of the data connection
 *   certification  (0–35): lifecycle stage reached
 *   businessGate   (0–12): business approval
 *   sagGate        (0–13): SAG approval
 */
export interface OperationalTrustScore {
  total:           number;  // 0–100
  connection:      number;  // 0–40
  certification:   number;  // 0–35
  businessGate:    number;  // 0–12
  sagGate:         number;  // 0–13
  grade:           "A" | "B" | "C" | "D" | "F";
  label:           string;
}

// ─── Certification record (mirrors Prisma model) ──────────────────────────────

export interface KpiCertificationRecord {
  id:                   string;
  organizationId:       string;
  kpiKey:               string;
  domain:               string;

  expectedSources:      string[];
  actualSources:        string[];
  sourceOfTruth:        string | null;

  technicalStatus:      string;
  operationalStatus:    string;

  businessApproved:     boolean;
  sagApproved:          boolean;
  productionReady:      boolean;
  confidenceScore:      number;

  queryValidated:       boolean;
  fieldsValidated:      boolean;
  syncValidated:        boolean;

  validatedBy:          string | null;
  validatedRole:        string | null;
  sagValidatedBy:       string | null;
  businessValidatedBy:  string | null;

  validationNotes:      string | null;
  blockerNotes:         string | null;

  approvedQuery:        string | null;
  approvedTable:        string | null;
  approvedFields:       string[] | null;

  expectedSyncFrequency: string | null;
  realSyncFrequency:     string | null;
  lastSyncAt:            string | null;
  lastValidatedAt:       string | null;

  certificationStatus:  KpiCertificationStatus;

  createdAt: string;
  updatedAt: string;
}

// ─── Upsert input ─────────────────────────────────────────────────────────────

export interface KpiCertificationUpsertInput {
  organizationId:       string;
  kpiKey:               string;
  domain:               string;
  action:               KpiApprovalAction;
  actorId:              string;
  actorRole:            string;
  notes?:               string;
  approvedTable?:       string;
  approvedFields?:      string[];
  approvedQuery?:       string;
  validationNotes?:     string;
  blockerNotes?:        string;
  expectedSyncFrequency?: string;
}

// ─── Workflow guard ───────────────────────────────────────────────────────────

export interface WorkflowGuardResult {
  allowed:  boolean;
  reason?:  string;
  /** Next allowed actions from current state */
  nextActions: KpiApprovalAction[];
}

// ─── Telemetry hooks (Phase 15 — stub for AGENTIK-REAL-CONNECTION-TELEMETRY-01) ─

export interface KpiTelemetryHook {
  kpiKey:         string;
  connectorId:    string | null;
  lastSyncAt:     string | null;
  lastSuccessAt:  string | null;
  lastFailureAt:  string | null;
  rowsSynced:     number | null;
  avgLatencyMs:   number | null;
  syncStatus:     "healthy" | "failing" | "stale" | "unknown";
  errorMessage:   string | null;
  // STUB: populated by AGENTIK-REAL-CONNECTION-TELEMETRY-01
  _telemetryStub: true;
}
