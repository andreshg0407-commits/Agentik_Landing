/**
 * lib/operational-map/certification/operational-kpi-certification-service.ts
 *
 * Operational KPI Certification — Service Layer.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Manages the full certification lifecycle for operational KPIs.
 * All mutations enforce the workflow gate: no production_ready without
 * sagApproved AND businessApproved.
 *
 * Sprint: AGENTIK-OPERATIONAL-KPI-CERTIFICATION-01
 */

import { prisma }                     from "@/lib/prisma";
import type {
  KpiCertificationStatus,
  KpiCertificationRecord,
  KpiCertificationUpsertInput,
  WorkflowGuardResult,
  KpiApprovalAction,
  OperationalTrustScore,
} from "./operational-kpi-certification-types";
import type { ConnectionHealth }      from "../audit/operational-connection-audit-types";
import {
  appendKpiEvent,
  actionToEventType,
}                                     from "./operational-kpi-event-service";

// ─── Workflow state machine ───────────────────────────────────────────────────

const NEXT_ACTIONS: Record<KpiCertificationStatus, KpiApprovalAction[]> = {
  draft:               ["start_review", "block"],
  reviewing:           ["approve_technical", "block"],
  technical_validated: ["approve_business", "approve_sag", "block"],
  business_validated:  ["approve_sag", "certify", "block"],
  sag_validated:       ["approve_business", "certify", "block"],
  certified:           ["mark_production_ready", "block"],
  production_ready:    ["block", "deprecate"],
  blocked:             ["start_review", "deprecate"],
  deprecated:          [],
};

const ACTION_TRANSITIONS: Record<KpiApprovalAction, (current: KpiCertificationStatus, cert: KpiCertificationRecord) => KpiCertificationStatus> = {
  start_review:       ()     => "reviewing",
  approve_technical:  ()     => "technical_validated",
  approve_business:   (_, c) => {
    if (c.sagApproved) return "certified";
    return "business_validated";
  },
  approve_sag:        (_, c) => {
    if (c.businessApproved) return "certified";
    return "sag_validated";
  },
  certify:            ()     => "certified",
  mark_production_ready: (_, c) => {
    if (!c.sagApproved || !c.businessApproved) return "certified"; // Guard enforced
    return "production_ready";
  },
  block:              ()     => "blocked",
  revoke:             ()     => "draft",
  deprecate:          ()     => "deprecated",
};

// ─── Workflow guard ───────────────────────────────────────────────────────────

function checkWorkflowGuard(
  action:  KpiApprovalAction,
  current: KpiCertificationStatus,
  cert:    KpiCertificationRecord,
): WorkflowGuardResult {
  const allowed = NEXT_ACTIONS[current];

  if (!allowed.includes(action)) {
    return {
      allowed:     false,
      reason:      `Action "${action}" is not allowed from state "${current}". Allowed: ${allowed.join(", ")}`,
      nextActions: allowed,
    };
  }

  if (action === "mark_production_ready" && (!cert.sagApproved || !cert.businessApproved)) {
    return {
      allowed:     false,
      reason:      `Cannot mark production_ready: missing ${!cert.sagApproved ? "SAG approval" : ""}${!cert.sagApproved && !cert.businessApproved ? " and " : ""}${!cert.businessApproved ? "business approval" : ""}.`,
      nextActions: allowed,
    };
  }

  return { allowed: true, nextActions: allowed };
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): KpiCertificationRecord {
  return {
    id:                   row.id,
    organizationId:       row.organizationId,
    kpiKey:               row.kpiKey,
    domain:               row.domain,
    expectedSources:      Array.isArray(row.expectedSources) ? row.expectedSources : [],
    actualSources:        Array.isArray(row.actualSources) ? row.actualSources : [],
    sourceOfTruth:        row.sourceOfTruth ?? null,
    technicalStatus:      row.technicalStatus,
    operationalStatus:    row.operationalStatus,
    businessApproved:     row.businessApproved,
    sagApproved:          row.sagApproved,
    productionReady:      row.productionReady,
    confidenceScore:      row.confidenceScore,
    queryValidated:       row.queryValidated,
    fieldsValidated:      row.fieldsValidated,
    syncValidated:        row.syncValidated,
    validatedBy:          row.validatedBy ?? null,
    validatedRole:        row.validatedRole ?? null,
    sagValidatedBy:       row.sagValidatedBy ?? null,
    businessValidatedBy:  row.businessValidatedBy ?? null,
    validationNotes:      row.validationNotes ?? null,
    blockerNotes:         row.blockerNotes ?? null,
    approvedQuery:        row.approvedQuery ?? null,
    approvedTable:        row.approvedTable ?? null,
    approvedFields:       Array.isArray(row.approvedFields) ? row.approvedFields : null,
    expectedSyncFrequency: row.expectedSyncFrequency ?? null,
    realSyncFrequency:    row.realSyncFrequency ?? null,
    lastSyncAt:           row.lastSyncAt?.toISOString() ?? null,
    lastValidatedAt:      row.lastValidatedAt?.toISOString() ?? null,
    certificationStatus:  row.certificationStatus as KpiCertificationStatus,
    createdAt:            row.createdAt.toISOString(),
    updatedAt:            row.updatedAt.toISOString(),
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

// ─── Delegate safety guard ────────────────────────────────────────────────────
// Protects against stale global.__prisma singleton that pre-dates prisma generate.
// If the delegate is missing: run `npx prisma generate && npx prisma db push`
// and restart the Next.js dev server to clear the global cache.

function getDelegate() {
  const delegate = prisma.operationalKpiCertification;
  if (!delegate) {
    console.warn(
      "[OperationalKpiCertification] Prisma delegate not found on client instance. " +
      "Run: npx prisma generate && npx prisma db push, then restart the dev server.",
    );
    throw new Error("PRISMA_DELEGATE_MISSING: operationalKpiCertification");
  }
  return delegate;
}

// ─── Public service functions ─────────────────────────────────────────────────

export async function getKpiCertification(
  organizationId: string,
  kpiKey:         string,
): Promise<KpiCertificationRecord | null> {
  const row = await getDelegate().findUnique({
    where: { organizationId_kpiKey: { organizationId, kpiKey } },
  });
  return row ? mapRow(row) : null;
}

export async function getAllCertifications(
  organizationId: string,
): Promise<KpiCertificationRecord[]> {
  const rows = await getDelegate().findMany({
    where:   { organizationId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapRow);
}

export async function getProductionReadyKpis(
  organizationId: string,
): Promise<KpiCertificationRecord[]> {
  const rows = await getDelegate().findMany({
    where:   { organizationId, productionReady: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapRow);
}

export async function createCertification(
  organizationId: string,
  kpiKey:         string,
  domain:         string,
  actorId:        string,
): Promise<KpiCertificationRecord> {
  const row = await getDelegate().upsert({
    where:  { organizationId_kpiKey: { organizationId, kpiKey } },
    create: {
      organizationId,
      kpiKey,
      domain,
      certificationStatus: "draft",
      validatedBy:         actorId,
      lastValidatedAt:     new Date(),
    },
    update: {},
  });
  return mapRow(row);
}

export async function applyAction(
  input: KpiCertificationUpsertInput,
): Promise<{ ok: true; certification: KpiCertificationRecord } | { ok: false; error: string }> {
  const { organizationId, kpiKey, domain, action, actorId, actorRole } = input;

  // Ensure record exists
  let existing = await getKpiCertification(organizationId, kpiKey);
  if (!existing) {
    existing = await createCertification(organizationId, kpiKey, domain, actorId);
  }

  // Check workflow guard
  const guard = checkWorkflowGuard(action, existing.certificationStatus, existing);
  if (!guard.allowed) {
    return { ok: false, error: guard.reason ?? "Action not allowed" };
  }

  const newStatus = ACTION_TRANSITIONS[action](existing.certificationStatus, existing);
  const now       = new Date();

  // Build update payload
  const update: Record<string, unknown> = {
    certificationStatus: newStatus,
    lastValidatedAt:     now,
    validatedBy:         actorId,
    validatedRole:       actorRole,
  };

  if (action === "approve_technical") {
    update.queryValidated  = true;
    update.fieldsValidated = true;
    update.technicalStatus = "validated";
  }

  if (action === "approve_business") {
    update.businessApproved      = true;
    update.businessValidatedBy   = actorId;
  }

  if (action === "approve_sag") {
    update.sagApproved     = true;
    update.sagValidatedBy  = actorId;
    if (input.approvedTable)  update.approvedTable  = input.approvedTable;
    if (input.approvedFields) update.approvedFields = input.approvedFields;
    if (input.approvedQuery)  update.approvedQuery  = input.approvedQuery;
    update.queryValidated = true;
    update.fieldsValidated = true;
  }

  if (action === "mark_production_ready") {
    update.productionReady    = true;
    update.syncValidated      = true;
    update.operationalStatus  = "live";
    if (input.expectedSyncFrequency) update.expectedSyncFrequency = input.expectedSyncFrequency;
  }

  if (action === "block") {
    update.blockerNotes = input.blockerNotes ?? input.notes ?? null;
  }

  if (action === "revoke") {
    update.businessApproved   = false;
    update.sagApproved        = false;
    update.productionReady    = false;
    update.certificationStatus = "draft";
    update.operationalStatus   = "pending";
    update.technicalStatus     = "pending";
  }

  if (input.validationNotes) update.validationNotes = input.validationNotes;

  const updated = await getDelegate().update({
    where: { organizationId_kpiKey: { organizationId, kpiKey } },
    data:  update,
  });

  // Recompute confidence score
  const cert          = mapRow(updated);
  const newScore      = computeConfidenceScore(cert);
  const finalRow      = await getDelegate().update({
    where: { organizationId_kpiKey: { organizationId, kpiKey } },
    data:  { confidenceScore: newScore },
  });

  const finalCert = mapRow(finalRow);

  // Emit immutable timeline event
  try {
    await appendKpiEvent({
      organizationId: organizationId,
      kpiKey,
      eventType:  actionToEventType(action),
      actorId:    actorId,
      actorRole:  actorRole,
      description: buildEventDescription(action, input),
      metadata:   {
        fromStatus:   existing.certificationStatus,
        toStatus:     newStatus,
        approvedTable: input.approvedTable,
        approvedQuery: input.approvedQuery,
        notes:         input.notes ?? input.validationNotes ?? input.blockerNotes,
      },
    });
  } catch {
    // Event append must never block the main mutation
  }

  return { ok: true, certification: finalCert };
}

function buildEventDescription(action: KpiApprovalAction, input: KpiCertificationUpsertInput): string {
  switch (action) {
    case "start_review":         return "Revisión iniciada";
    case "approve_technical":    return "Validación técnica aprobada";
    case "approve_business":     return "Validación de negocio aprobada";
    case "approve_sag":          return `SAG aprobado${input.approvedTable ? ` — tabla: ${input.approvedTable}` : ""}`;
    case "certify":              return "KPI certificado";
    case "mark_production_ready": return "KPI marcado como listo para producción";
    case "block":                return `KPI bloqueado${input.blockerNotes ? `: ${input.blockerNotes}` : ""}`;
    case "revoke":               return "Certificación revocada — vuelve a draft";
    case "deprecate":            return "KPI deprecado";
    default:                     return "KPI actualizado";
  }
}

// ─── Confidence score computation ─────────────────────────────────────────────

export function computeConfidenceScore(cert: KpiCertificationRecord): number {
  let score = 0;

  // Lifecycle stage (0–50)
  const stageScore: Record<KpiCertificationStatus, number> = {
    draft:               0,
    reviewing:           5,
    technical_validated: 15,
    business_validated:  25,
    sag_validated:       35,
    certified:           45,
    production_ready:    50,
    blocked:             0,
    deprecated:          0,
  };
  score += stageScore[cert.certificationStatus] ?? 0;

  // Field validation (0–20)
  if (cert.queryValidated)  score += 7;
  if (cert.fieldsValidated) score += 7;
  if (cert.syncValidated)   score += 6;

  // Approvals (0–20)
  if (cert.businessApproved) score += 10;
  if (cert.sagApproved)      score += 10;

  // Has approved artifacts (0–10)
  if (cert.approvedTable)  score += 5;
  if (cert.approvedQuery)  score += 5;

  return Math.min(100, score);
}

// ─── Operational Trust Score ──────────────────────────────────────────────────

export function computeOperationalTrustScore(
  connectionHealth: ConnectionHealth,
  cert:             KpiCertificationRecord | null,
): OperationalTrustScore {
  // Connection component (0–40)
  const connectionMap: Record<ConnectionHealth, number> = {
    live:          40,
    partial:       20,
    manual:        15,
    stale:         10,
    disconnected:   0,
    pending:        0,
    mock:           0,
    wrong_source:   0,
  };
  const connection = connectionMap[connectionHealth] ?? 0;

  // Certification component (0–35)
  const certScore: Record<KpiCertificationStatus, number> = {
    draft:               0,
    reviewing:           3,
    technical_validated: 10,
    business_validated:  18,
    sag_validated:       22,
    certified:           30,
    production_ready:    35,
    blocked:             0,
    deprecated:          0,
  };
  const certStatus    = cert?.certificationStatus ?? "draft";
  const certification = certScore[certStatus] ?? 0;

  // Approval gates
  const businessGate = cert?.businessApproved ? 12 : 0;
  const sagGate      = cert?.sagApproved      ? 13 : 0;

  const total = connection + certification + businessGate + sagGate;

  const grade: OperationalTrustScore["grade"] =
    total >= 90 ? "A" :
    total >= 75 ? "B" :
    total >= 55 ? "C" :
    total >= 35 ? "D" : "F";

  const label =
    total >= 90 ? "Certificado producción" :
    total >= 75 ? "Alta confianza" :
    total >= 55 ? "Confianza media" :
    total >= 35 ? "Confianza baja" : "Sin certificar";

  return { total, connection, certification, businessGate, sagGate, grade, label };
}

// ─── Certification health summary ─────────────────────────────────────────────

export async function computeCertificationHealth(organizationId: string) {
  const all = await getAllCertifications(organizationId);

  return {
    total:              all.length,
    draft:              all.filter(c => c.certificationStatus === "draft").length,
    reviewing:          all.filter(c => c.certificationStatus === "reviewing").length,
    certified:          all.filter(c => c.certificationStatus === "certified").length,
    production_ready:   all.filter(c => c.certificationStatus === "production_ready").length,
    blocked:            all.filter(c => c.certificationStatus === "blocked").length,
    sagApproved:        all.filter(c => c.sagApproved).length,
    businessApproved:   all.filter(c => c.businessApproved).length,
    avgConfidence:      all.length > 0
      ? Math.round(all.reduce((s, c) => s + c.confidenceScore, 0) / all.length)
      : 0,
  };
}

// ─── Allowed next actions ─────────────────────────────────────────────────────

export function getAllowedActions(
  status:          KpiCertificationStatus,
  cert:            KpiCertificationRecord,
): KpiApprovalAction[] {
  const base = NEXT_ACTIONS[status] ?? [];
  // Filter out mark_production_ready if not both approved
  return base.filter(a => {
    if (a === "mark_production_ready" && (!cert.sagApproved || !cert.businessApproved)) return false;
    return true;
  });
}
