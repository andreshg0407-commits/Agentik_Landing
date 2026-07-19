/**
 * lib/operational-map/certification/operational-kpi-event-service.ts
 *
 * Operational KPI Event — Timeline Service Layer.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Append-only timeline. Every certification action, source change, or approval
 * creates an immutable event record. Powers the operational timeline drawer.
 *
 * Sprint: AGENTIK-LIVE-KPI-CERTIFICATION-WORKSPACE-01
 */

import { prisma } from "@/lib/prisma";

// ─── Event types ──────────────────────────────────────────────────────────────

export type KpiEventType =
  | "kpi_created"
  | "kpi_updated"
  | "review_started"
  | "technical_approved"
  | "business_approved"
  | "sag_approved"
  | "certified"
  | "production_ready"
  | "blocked"
  | "revoked"
  | "deprecated"
  | "source_added"
  | "source_updated"
  | "source_deleted"
  | "source_confirmed"
  | "source_marked_sot"
  | "source_pending_validation"
  | "source_confirmed_exists"
  | "source_ready_for_integration"
  | "source_rejected"
  | "source_confirmed_dba"
  | "source_production_certified"
  | "source_replaced"
  | "query_saved"
  | "fields_confirmed"
  | "note_added";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KpiEventRecord {
  id:             string;
  organizationId: string;
  kpiKey:         string;
  eventType:      KpiEventType;
  actorId:        string;
  actorName:      string | null;
  actorRole:      string | null;
  description:    string;
  metadata:       Record<string, unknown> | null;
  createdAt:      string;
}

export interface KpiEventCreateInput {
  organizationId: string;
  kpiKey:         string;
  eventType:      KpiEventType;
  actorId:        string;
  actorName?:     string;
  actorRole?:     string;
  description:    string;
  metadata?:      Record<string, unknown>;
}

// ─── Event descriptions ───────────────────────────────────────────────────────

export const EVENT_DESCRIPTIONS: Record<KpiEventType, string> = {
  kpi_created:         "KPI creado",
  kpi_updated:         "KPI actualizado",
  review_started:      "Revisión iniciada",
  technical_approved:  "Validación técnica aprobada",
  business_approved:   "Validación de negocio aprobada",
  sag_approved:        "Validación SAG aprobada",
  certified:           "KPI certificado",
  production_ready:    "KPI listo para producción",
  blocked:             "KPI bloqueado",
  revoked:             "Certificación revocada",
  deprecated:          "KPI deprecado",
  source_added:                  "Fuente de datos agregada",
  source_updated:                "Fuente de datos actualizada",
  source_deleted:                "Fuente de datos eliminada",
  source_confirmed:              "Fuente SAG confirmada",
  source_marked_sot:             "Fuente marcada como Source of Truth",
  source_pending_validation:     "Fuente marcada pendiente de validar existencia",
  source_confirmed_exists:       "Existencia de fuente confirmada",
  source_ready_for_integration:  "Fuente lista para integración",
  source_rejected:               "Fuente rechazada",
  source_confirmed_dba:          "Fuente confirmada con DBA SAG",
  source_production_certified:   "Fuente certificada para producción",
  source_replaced:               "Hipótesis CSV reemplazada",
  query_saved:                   "Query aprobada guardada",
  fields_confirmed:              "Campos SAG confirmados",
  note_added:                    "Nota agregada",
};

// ─── Delegate guard ───────────────────────────────────────────────────────────

function getDelegate() {
  const d = prisma.operationalKpiEvent;
  if (!d) {
    console.warn(
      "[OperationalKpiEvent] Prisma delegate not found. " +
      "Run: npx prisma generate && npx prisma db push, then restart the dev server.",
    );
    throw new Error("PRISMA_DELEGATE_MISSING: operationalKpiEvent");
  }
  return d;
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): KpiEventRecord {
  return {
    id:             r.id,
    organizationId: r.organizationId,
    kpiKey:         r.kpiKey,
    eventType:      r.eventType as KpiEventType,
    actorId:        r.actorId,
    actorName:      r.actorName ?? null,
    actorRole:      r.actorRole ?? null,
    description:    r.description,
    metadata:       r.metadata as Record<string, unknown> | null,
    createdAt:      r.createdAt.toISOString(),
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function appendKpiEvent(input: KpiEventCreateInput): Promise<KpiEventRecord> {
  const row = await getDelegate().create({
    data: {
      organizationId: input.organizationId,
      kpiKey:         input.kpiKey,
      eventType:      input.eventType,
      actorId:        input.actorId,
      actorName:      input.actorName ?? null,
      actorRole:      input.actorRole ?? null,
      description:    input.description,
      metadata:       input.metadata ? (input.metadata as object) : undefined,
    },
  });
  return mapRow(row);
}

export async function getKpiTimeline(
  organizationId: string,
  kpiKey:         string,
  limit:          number = 50,
): Promise<KpiEventRecord[]> {
  const rows = await getDelegate().findMany({
    where:   { organizationId, kpiKey },
    orderBy: { createdAt: "desc" },
    take:    limit,
  });
  return rows.map(mapRow);
}

export async function getOrgTimeline(
  organizationId: string,
  limit:          number = 100,
): Promise<KpiEventRecord[]> {
  const rows = await getDelegate().findMany({
    where:   { organizationId },
    orderBy: { createdAt: "desc" },
    take:    limit,
  });
  return rows.map(mapRow);
}

/**
 * Maps a KpiApprovalAction to the corresponding KpiEventType.
 */
export function actionToEventType(action: string): KpiEventType {
  const map: Record<string, KpiEventType> = {
    start_review:         "review_started",
    approve_technical:    "technical_approved",
    approve_business:     "business_approved",
    approve_sag:          "sag_approved",
    certify:              "certified",
    mark_production_ready:"production_ready",
    block:                "blocked",
    revoke:               "revoked",
    deprecate:            "deprecated",
  };
  return map[action] ?? "kpi_updated";
}
