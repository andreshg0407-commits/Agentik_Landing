/**
 * lib/operational-data/mappers/crm/crm-opportunity-mapper.ts
 *
 * Maps CRM opportunity records → OperationalOpportunity.
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

import type { OperationalOpportunity } from "../../operational-entities";

// ─── CRM raw shape ────────────────────────────────────────────────────────────

export interface CrmRawOpportunity {
  id:                 string;
  titulo:             string;
  clienteId?:         string;
  vendedorId?:        string;
  etapa:              string;  // CRM pipeline stage name
  valorEsperado:      number;
  probabilidad?:      number;
  cierreEsperado?:    string;
  lineas?:            Array<{ referencia: string; cantidad: number }>;
  sincronizadoEn:     string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapCrmOpportunityToOperational(
  raw:            CrmRawOpportunity,
  organizationId: string,
): OperationalOpportunity {
  return {
    id:             `crm_opp_${raw.id}`,
    organizationId,
    source:         "crm",
    sourceId:       raw.id,
    syncedAt:       raw.sincronizadoEn,
    confidence:     0.80,

    title:          raw.titulo,
    customerId:     raw.clienteId,
    salesRepId:     raw.vendedorId,
    stage:          normalizeCrmStage(raw.etapa),
    expectedValue:  raw.valorEsperado,
    probability:    raw.probabilidad ?? estimateProbabilityFromStage(raw.etapa),
    expectedCloseAt: raw.cierreEsperado,
    referenceLines: raw.lineas?.map(l => ({
      reference: l.referencia.toUpperCase(),
      qty:       l.cantidad,
    })),

    metadata: { crmId: raw.id, etapa: raw.etapa },
  };
}

export function mapCrmOpportunitiesToOperational(
  rows:           CrmRawOpportunity[],
  organizationId: string,
): OperationalOpportunity[] {
  return rows.map(r => mapCrmOpportunityToOperational(r, organizationId));
}

// ─── Prisma-backed shape ──────────────────────────────────────────────────────
// Mirrors CRMOpportunity Prisma model fields needed for operational mapping.
// Does NOT import Prisma — provider converts Prisma Decimal → number before calling.

export interface PrismaCrmOpportunityShape {
  id:             string;
  organizationId: string;
  crmId:          string | null;
  customerId:     string | null;
  title:          string;
  stage:          string;           // pipeline stage key (already stored as string)
  amount:         number;           // provider converts Decimal.toNumber()
  currency:       string;
  probability:    number;           // 0-100
  /** Prisma OpportunityStatus enum as string: OPEN | WON | LOST | ABANDONED */
  status:         string;
  lossReason:     string | null;
  lossNote:       string | null;
  sellerSlug:     string | null;
  sellerName:     string | null;
  openedAt:       string;           // ISO string
  expectedCloseAt: string | null;
  closedAt:       string | null;
  lastActivityAt: string | null;
  updatedAt:      string;
  /** rawCrmJson may contain referenceLines if opportunity was enriched with product lines */
  rawCrmJson:     Record<string, unknown> | null;
}

/**
 * Maps a Prisma CRMOpportunity → OperationalOpportunity.
 *
 * referenceLines are extracted from rawCrmJson if present (opportunistic).
 * Formal line data requires AOS_Products_Quotes integration (Phase 2).
 */
export function mapPrismaCrmOpportunityToOperational(
  opp:            PrismaCrmOpportunityShape,
  organizationId: string,
): OperationalOpportunity {
  // Opportunistically extract reference lines from rawCrmJson if present
  const referenceLines = extractReferenceLinesFromRaw(opp.rawCrmJson);

  return {
    id:             `crm_opp_${opp.id}`,
    organizationId,
    source:         "crm",
    sourceId:       opp.crmId ?? opp.id,
    syncedAt:       opp.lastActivityAt ?? opp.updatedAt,
    confidence:     0.80,

    title:          opp.title,
    customerId:     opp.customerId ?? undefined,
    salesRepId:     opp.sellerSlug ?? undefined,
    stage:          normalizePrismaOpportunityStage(opp.stage, opp.status),
    expectedValue:  opp.amount,
    probability:    opp.probability,
    expectedCloseAt: opp.expectedCloseAt ?? undefined,
    referenceLines,

    metadata: {
      crmId:      opp.crmId,
      stage:      opp.stage,
      status:     opp.status,
      lossReason: opp.lossReason,
      sellerSlug: opp.sellerSlug,
    },
  };
}

export function mapPrismaCrmOpportunitiesToOperational(
  opps:           PrismaCrmOpportunityShape[],
  organizationId: string,
): OperationalOpportunity[] {
  return opps.map(o => mapPrismaCrmOpportunityToOperational(o, organizationId));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derives OperationalOpportunity stage from both the stored pipeline stage string
 * and the Prisma OpportunityStatus enum. Status takes precedence for terminal states.
 */
function normalizePrismaOpportunityStage(
  stage:  string,
  status: string,
): OperationalOpportunity["stage"] {
  const upperStatus = status.toUpperCase();
  if (upperStatus === "WON")       return "ganado";
  if (upperStatus === "LOST")      return "perdido";
  if (upperStatus === "ABANDONED") return "perdido";
  return normalizeCrmStage(stage);
}

/**
 * Attempts to extract reference lines from rawCrmJson opportunistically.
 * The V8 API may embed AOS_Products_Quotes data in the parent record.
 */
function extractReferenceLinesFromRaw(
  raw: Record<string, unknown> | null,
): Array<{ reference: string; qty: number }> | undefined {
  if (!raw) return undefined;

  // Common embedded product line keys from SuiteCRM V8 relates/subpanel
  const candidates = ["line_items", "lineItems", "aos_products_quotes", "products"];
  for (const key of candidates) {
    const items = raw[key];
    if (!Array.isArray(items) || items.length === 0) continue;

    const lines: Array<{ reference: string; qty: number }> = [];
    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as Record<string, unknown>;
      const ref = String(row["part_number"] ?? row["referencia"] ?? row["sku"] ?? "").toUpperCase();
      const qty = Number(row["quantity"] ?? row["cantidad"] ?? row["qty"] ?? 0);
      if (ref && qty > 0) lines.push({ reference: ref, qty });
    }
    if (lines.length > 0) return lines;
  }
  return undefined;
}

function normalizeCrmStage(crm: string): OperationalOpportunity["stage"] {
  const s = crm.toLowerCase().replace(/\s+/g, "_");
  if (s.includes("prospecto") || s.includes("lead"))    return "prospecto";
  if (s.includes("calificado") || s.includes("qualified")) return "calificado";
  if (s.includes("propuesta") || s.includes("proposal")) return "propuesta";
  if (s.includes("negociaci")  || s.includes("negotiat")) return "negociacion";
  if (s.includes("ganado")     || s.includes("won"))     return "ganado";
  if (s.includes("perdido")    || s.includes("lost"))    return "perdido";
  return "prospecto";
}

function estimateProbabilityFromStage(stage: string): number {
  const normalized = normalizeCrmStage(stage);
  const map: Record<OperationalOpportunity["stage"], number> = {
    prospecto:    10,
    calificado:   25,
    propuesta:    50,
    negociacion:  70,
    ganado:       100,
    perdido:      0,
  };
  return map[normalized];
}
