/**
 * lib/operational-data/mappers/crm/crm-sales-activity-mapper.ts
 *
 * Maps CRM activity records → OperationalSalesActivity.
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

import type { OperationalSalesActivity } from "../../operational-entities";

// ─── CRM raw shape ────────────────────────────────────────────────────────────

export interface CrmRawActivity {
  id:              string;
  vendedorId:      string;
  clienteId?:      string;
  oportunidadId?:  string;
  tipo:            string;  // CRM activity type
  asunto?:         string;
  descripcion?:    string;
  resultado?:      string;
  fecha:           string;
  sincronizadoEn:  string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapCrmActivityToOperational(
  raw:            CrmRawActivity,
  organizationId: string,
): OperationalSalesActivity {
  return {
    id:             `crm_act_${raw.id}`,
    organizationId,
    source:         "crm",
    sourceId:       raw.id,
    syncedAt:       raw.sincronizadoEn,
    confidence:     0.82,

    salesRepId:     raw.vendedorId,
    customerId:     raw.clienteId,
    opportunityId:  raw.oportunidadId,
    type:           normalizeCrmActivityType(raw.tipo),
    subject:        raw.asunto,
    description:    raw.descripcion,
    outcome:        normalizeCrmOutcome(raw.resultado),
    activityAt:     raw.fecha,

    metadata: { crmId: raw.id, tipo: raw.tipo, resultado: raw.resultado },
  };
}

export function mapCrmActivitiesToOperational(
  rows:           CrmRawActivity[],
  organizationId: string,
): OperationalSalesActivity[] {
  return rows.map(r => mapCrmActivityToOperational(r, organizationId));
}

// ─── Prisma-backed shape ──────────────────────────────────────────────────────
// Mirrors CRMActivity Prisma model fields needed for operational mapping.
// Does NOT import Prisma — provider passes pre-converted values.

export interface PrismaCrmActivityShape {
  id:             string;
  organizationId: string;
  crmId:          string | null;
  customerId:     string | null;
  opportunityId:  string | null;
  /** Prisma ActivityType enum as string: CALL | EMAIL | VISIT | NOTE | MEETING | QUOTE_SENT | DEMO | PROPOSAL | OTHER */
  type:           string;
  subject:        string | null;
  body:           string | null;
  outcome:        string | null;
  sellerSlug:     string | null;
  sellerName:     string | null;
  occurredAt:     string;          // ISO string (provider converts Date)
  dueAt:          string | null;
  completedAt:    string | null;
}

/**
 * Maps a Prisma CRMActivity → OperationalSalesActivity.
 */
export function mapPrismaCrmActivityToOperational(
  activity:       PrismaCrmActivityShape,
  organizationId: string,
): OperationalSalesActivity {
  return {
    id:             `crm_act_${activity.id}`,
    organizationId,
    source:         "crm",
    sourceId:       activity.crmId ?? activity.id,
    syncedAt:       activity.occurredAt,
    confidence:     0.82,

    salesRepId:     activity.sellerSlug ?? "unknown",
    customerId:     activity.customerId ?? undefined,
    opportunityId:  activity.opportunityId ?? undefined,
    type:           normalizePrismaActivityType(activity.type),
    subject:        activity.subject ?? undefined,
    description:    activity.body ?? undefined,
    outcome:        normalizeCrmOutcome(activity.outcome ?? undefined),
    activityAt:     activity.occurredAt,

    metadata: {
      crmId:      activity.crmId,
      rawType:    activity.type,
      sellerSlug: activity.sellerSlug,
    },
  };
}

export function mapPrismaCrmActivitiesToOperational(
  activities:     PrismaCrmActivityShape[],
  organizationId: string,
): OperationalSalesActivity[] {
  return activities.map(a => mapPrismaCrmActivityToOperational(a, organizationId));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps Prisma ActivityType enum values → OperationalSalesActivity type.
 * Prisma enum stores uppercase (CALL, EMAIL, etc.) — normalize to lowercase.
 */
function normalizePrismaActivityType(raw: string): OperationalSalesActivity["type"] {
  switch (raw.toUpperCase()) {
    case "CALL":       return "llamada";
    case "VISIT":      return "visita";
    case "EMAIL":      return "email";
    case "NOTE":       return "otro";
    case "MEETING":    return "otro";
    case "QUOTE_SENT": return "propuesta";
    case "DEMO":       return "demo";
    case "PROPOSAL":   return "propuesta";
    default:           return "otro";
  }
}

function normalizeCrmActivityType(crm: string): OperationalSalesActivity["type"] {
  const s = crm.toLowerCase();
  if (s.includes("llamada") || s.includes("call"))   return "llamada";
  if (s.includes("visita")  || s.includes("visit"))  return "visita";
  if (s.includes("whatsapp"))                        return "whatsapp";
  if (s.includes("email")   || s.includes("correo")) return "email";
  if (s.includes("demo"))                            return "demo";
  if (s.includes("propuesta"))                       return "propuesta";
  return "otro";
}

function normalizeCrmOutcome(
  crm?: string,
): OperationalSalesActivity["outcome"] {
  if (!crm) return undefined;
  const s = crm.toLowerCase();
  if (s.includes("exito") || s.includes("exitoso") || s.includes("success")) return "exitoso";
  if (s.includes("pendiente") || s.includes("pending"))                      return "pendiente";
  if (s.includes("sin respuesta") || s.includes("no answer"))                return "sin_respuesta";
  if (s.includes("perdido") || s.includes("lost"))                           return "perdido";
  return "pendiente";
}
