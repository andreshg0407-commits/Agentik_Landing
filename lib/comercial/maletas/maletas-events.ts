/**
 * lib/comercial/maletas/maletas-events.ts
 *
 * Operational event detection for Maletas.
 * Compares current snapshot vs previous state to detect meaningful transitions.
 * Persists events to CommercialOperationalEvent for timeline and copilot consumption.
 *
 * All event generation is deterministic — no AI, no random values.
 * Server-only — never import from client components.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-PERSISTENCE-01
 */

import { prisma } from "@/lib/prisma";
import type { MaletasOperationalContext } from "./maletas-types";
import type { CoverageStatus } from "./maletas-intelligence-types";

// ─── Event types ──────────────────────────────────────────────────────────────

export type CommercialEventType =
  | "ruptura_inminente"        // ref entered ruptura_inminente or sin_stock
  | "cobertura_recuperada"     // ref recovered from critical to stable/high
  | "vendedor_en_presion"      // sales rep presionOperacional crossed threshold
  | "linea_caliente"           // ref velocity classified as "caliente" + low coverage
  | "stock_muerto"             // new dead stock signal detected
  | "produccion_urgente"       // production signal at urgente or critica
  | "degradacion_recurrente"   // same ref in critical state for 3+ consecutive snapshots
  | "recuperacion_operacional"; // org-level pressure dropped significantly

export type CommercialEventSeverity = "critical" | "warning" | "info";

export interface CommercialEventRecord {
  id:                string;
  organizationId:    string;
  type:              CommercialEventType;
  severity:          CommercialEventSeverity;
  title:             string;
  body:              string;
  refCode?:          string;
  line?:             string;
  salesRepId?:       string;
  evidence:          Record<string, string | number | boolean | null>;
  operationalImpact: string | null;
  createdAt:         string;
}

// ─── Critical coverage threshold ─────────────────────────────────────────────

const CRITICAL_STATUSES = new Set<CoverageStatus>(["sin_stock", "ruptura_inminente"]);
const STABLE_STATUSES   = new Set<CoverageStatus>(["cobertura_estable", "cobertura_alta"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEvidence(
  pairs: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  return pairs;
}

// ─── Event generators ─────────────────────────────────────────────────────────

/**
 * Detect refs that newly entered a critical coverage state.
 */
function detectRupturaInminente(
  current: MaletasOperationalContext,
  previousCriticalRefs: Set<string>,
): Omit<CommercialEventRecord, "id" | "organizationId" | "createdAt">[] {
  const events: Omit<CommercialEventRecord, "id" | "organizationId" | "createdAt">[] = [];
  const coverage = current.intelligence?.coverage ?? [];

  for (const cs of coverage) {
    if (CRITICAL_STATUSES.has(cs.status) && !previousCriticalRefs.has(cs.refCode)) {
      events.push({
        type:     "ruptura_inminente",
        severity: "critical",
        title:    `Ruptura inminente · ${cs.refCode}`,
        body:     `${cs.description} (${cs.line}) entró en estado ${cs.status}. ` +
                  `Disponible: ${cs.disponible} · Cobertura: ${cs.coverageDays !== null ? `${cs.coverageDays.toFixed(0)}d` : "sin datos"} · ` +
                  `Afecta ${cs.affectedSalesRepIds.length} vendedor${cs.affectedSalesRepIds.length > 1 ? "es" : ""}.`,
        refCode:  cs.refCode,
        line:     cs.line,
        evidence: buildEvidence({
          disponible:      cs.disponible,
          coverageDays:    cs.coverageDays,
          status:          cs.status,
          operationalScore: cs.operationalScore,
          affectedReps:    cs.affectedSalesRepIds.length,
        }),
        operationalImpact: cs.affectedSalesRepIds.length > 1
          ? `Impacta ${cs.affectedSalesRepIds.length} vendedores en línea ${cs.line}.`
          : null,
      });
    }
  }

  return events;
}

/**
 * Detect refs that recovered from critical to stable/high.
 */
function detectCoberturaRecuperada(
  current: MaletasOperationalContext,
  previousCriticalRefs: Set<string>,
): Omit<CommercialEventRecord, "id" | "organizationId" | "createdAt">[] {
  const events: Omit<CommercialEventRecord, "id" | "organizationId" | "createdAt">[] = [];
  const coverage = current.intelligence?.coverage ?? [];

  for (const cs of coverage) {
    if (STABLE_STATUSES.has(cs.status) && previousCriticalRefs.has(cs.refCode)) {
      events.push({
        type:     "cobertura_recuperada",
        severity: "info",
        title:    `Cobertura recuperada · ${cs.refCode}`,
        body:     `${cs.description} (${cs.line}) recuperó cobertura operacional. ` +
                  `Estado actual: ${cs.status} · Cobertura: ${cs.coverageDays !== null ? `${cs.coverageDays.toFixed(0)}d` : "sin datos"}.`,
        refCode:  cs.refCode,
        line:     cs.line,
        evidence: buildEvidence({
          disponible:   cs.disponible,
          coverageDays: cs.coverageDays,
          status:       cs.status,
        }),
        operationalImpact: null,
      });
    }
  }

  return events;
}

/**
 * Detect sales reps that crossed the 50% presión threshold.
 */
function detectVendedorEnPresion(
  current: MaletasOperationalContext,
  previousPressureByKey: Map<string, number>,
): Omit<CommercialEventRecord, "id" | "organizationId" | "createdAt">[] {
  const events: Omit<CommercialEventRecord, "id" | "organizationId" | "createdAt">[] = [];
  const profiles = current.intelligence?.salesRepProfiles ?? [];

  for (const p of profiles) {
    const key         = `${p.salesRepId}_${p.line}`;
    const prevPressure = previousPressureByKey.get(key) ?? 0;
    if (p.presionOperacional >= 50 && prevPressure < 50) {
      events.push({
        type:      "vendedor_en_presion",
        severity:  p.presionOperacional >= 70 ? "critical" : "warning",
        title:     `Vendedor en presión · ${p.salesRepName} (${p.line})`,
        body:      `${p.salesRepName} alcanzó presión operacional ${p.presionOperacional}% en línea ${p.line}. ` +
                   `${p.refsAgotadas} agotadas · ${p.refsBajoMinimo} bajo mínimo · riesgo ${p.riesgoComercial}.`,
        salesRepId: p.salesRepId,
        line:       p.line,
        evidence:   buildEvidence({
          presionOperacional:  p.presionOperacional,
          prevPressure,
          riesgoComercial:     p.riesgoComercial,
          refsAgotadas:        p.refsAgotadas,
          refsBajoMinimo:      p.refsBajoMinimo,
        }),
        operationalImpact: `${p.refsAgotadas + p.refsBajoMinimo} referencias requieren acción en maleta ${p.line}.`,
      });
    }
  }

  return events;
}

/**
 * Detect new production-urgente / critica signals that weren't present before.
 */
function detectProduccionUrgente(
  current: MaletasOperationalContext,
  previousProductionRefs: Set<string>,
): Omit<CommercialEventRecord, "id" | "organizationId" | "createdAt">[] {
  const events: Omit<CommercialEventRecord, "id" | "organizationId" | "createdAt">[] = [];
  const productionSignals = current.intelligence?.productionSignals ?? [];

  for (const ps of productionSignals) {
    if (
      (ps.urgency === "urgente" || ps.urgency === "critica") &&
      !previousProductionRefs.has(ps.reference)
    ) {
      events.push({
        type:     "produccion_urgente",
        severity: ps.urgency === "critica" ? "critical" : "warning",
        title:    `Producción ${ps.urgency} · ${ps.reference}`,
        body:     `${ps.description} (${ps.line}) requiere producción ${ps.urgency}. ` +
                  `Faltante: ${ps.totalMissing}u · Sugerido: ${ps.suggestedQty}u · ` +
                  `Afecta ${ps.affectedSalesRepCount} vendedor${ps.affectedSalesRepCount > 1 ? "es" : ""}.`,
        refCode:  ps.reference,
        line:     ps.line,
        evidence: buildEvidence({
          urgency:              ps.urgency,
          totalMissing:         ps.totalMissing,
          suggestedQty:         ps.suggestedQty,
          affectedReps:         ps.affectedSalesRepCount,
          coverageDaysRemaining: ps.coverageDaysRemaining,
          batchInProcess:       ps.batchInProcess,
        }),
        operationalImpact: ps.affectedSalesRepCount > 1
          ? `Bloquea ${ps.affectedSalesRepCount} maletas sin lote disponible.`
          : null,
      });
    }
  }

  return events;
}

/**
 * Detect new dead stock signals.
 */
function detectStockMuerto(
  current: MaletasOperationalContext,
  previousDeadRefs: Set<string>,
): Omit<CommercialEventRecord, "id" | "organizationId" | "createdAt">[] {
  const events: Omit<CommercialEventRecord, "id" | "organizationId" | "createdAt">[] = [];
  const deadStock = current.intelligence?.deadStockSignals ?? [];

  for (const ds of deadStock) {
    if (!previousDeadRefs.has(ds.refCode)) {
      events.push({
        type:     "stock_muerto",
        severity: ds.commercialRisk >= 70 ? "warning" : "info",
        title:    `Stock sin rotación · ${ds.refCode}`,
        body:     `${ds.description} (${ds.line}) identificado como stock sin rotación. ` +
                  `Motivo: ${ds.reason} · Disponible: ${ds.disponible}u · ` +
                  `Sugerencia: ${ds.disposalSuggestion}.`,
        refCode:  ds.refCode,
        line:     ds.line,
        evidence: buildEvidence({
          reason:           ds.reason,
          disponible:       ds.disponible,
          daysSinceLastSale: ds.daysSinceLastSale,
          commercialRisk:   ds.commercialRisk,
          disposalSuggestion: ds.disposalSuggestion,
        }),
        operationalImpact: ds.commercialRisk >= 70
          ? `Capital inmovilizado en ${ds.disponible} unidades de ${ds.line}.`
          : null,
      });
    }
  }

  return events;
}

// ─── Previous state loader ────────────────────────────────────────────────────

interface PreviousState {
  criticalRefs:     Set<string>;
  pressureByKey:    Map<string, number>; // "repId_line" → presion
  productionRefs:   Set<string>;         // refs with urgente/critica production
  deadRefs:         Set<string>;
}

async function loadPreviousState(orgId: string): Promise<PreviousState> {
  // Get the last snapshot batch time
  const lastCoverage = await prisma.commercialCoverageSnapshot.findFirst({
    where:   { organizationId: orgId },
    orderBy: { snapshotAt: "desc" },
    select:  { snapshotAt: true },
  });

  if (!lastCoverage) {
    return {
      criticalRefs:   new Set(),
      pressureByKey:  new Map(),
      productionRefs: new Set(),
      deadRefs:       new Set(),
    };
  }

  const at = lastCoverage.snapshotAt;

  const [prevCoverage, prevProfiles, prevProduction, prevDead] = await Promise.all([
    prisma.commercialCoverageSnapshot.findMany({
      where:  { organizationId: orgId, snapshotAt: at },
      select: { refCode: true, status: true },
    }),
    prisma.commercialSalesRepProfileSnapshot.findMany({
      where:  { organizationId: orgId, snapshotAt: at },
      select: { salesRepId: true, line: true, presionOperacional: true },
    }),
    prisma.commercialProductionSignal.findMany({
      where:  { organizationId: orgId, resolved: false },
      select: { reference: true, urgency: true },
    }),
    prisma.commercialDeadStockSignal.findMany({
      where:  { organizationId: orgId, resolved: false },
      select: { refCode: true },
    }),
  ]);

  const criticalRefs = new Set(
    prevCoverage
      .filter((c) => c.status === "sin_stock" || c.status === "ruptura_inminente")
      .map((c) => c.refCode),
  );

  const pressureByKey = new Map(
    prevProfiles.map((p) => [`${p.salesRepId}_${p.line}`, p.presionOperacional]),
  );

  const productionRefs = new Set(
    prevProduction
      .filter((p) => p.urgency === "urgente" || p.urgency === "critica")
      .map((p) => p.reference),
  );

  const deadRefs = new Set(prevDead.map((d) => d.refCode));

  return { criticalRefs, pressureByKey, productionRefs, deadRefs };
}

// ─── Main event generator ─────────────────────────────────────────────────────

/**
 * Generate and persist operational events by comparing current snapshot
 * against the most recent previous state in Prisma.
 *
 * Called by the ingestion pipeline after snapshot persistence.
 */
export async function generateAndPersistOperationalEvents(
  orgId: string,
  current: MaletasOperationalContext,
): Promise<CommercialEventRecord[]> {
  const prev = await loadPreviousState(orgId);

  const rawEvents = [
    ...detectRupturaInminente(current, prev.criticalRefs),
    ...detectCoberturaRecuperada(current, prev.criticalRefs),
    ...detectVendedorEnPresion(current, prev.pressureByKey),
    ...detectProduccionUrgente(current, prev.productionRefs),
    ...detectStockMuerto(current, prev.deadRefs),
  ];

  if (!rawEvents.length) return [];

  const now = new Date();
  const created = await prisma.$transaction(
    rawEvents.map((e) =>
      prisma.commercialOperationalEvent.create({
        data: {
          organizationId:   orgId,
          type:             e.type,
          severity:         e.severity,
          title:            e.title,
          body:             e.body,
          refCode:          e.refCode ?? null,
          line:             e.line ?? null,
          salesRepId:       e.salesRepId ?? null,
          evidence:         e.evidence,
          operationalImpact: e.operationalImpact ?? null,
          createdAt:        now,
        },
      }),
    ),
  );

  return created.map((row) => ({
    id:                row.id,
    organizationId:    row.organizationId,
    type:              row.type as CommercialEventType,
    severity:          row.severity as CommercialEventSeverity,
    title:             row.title,
    body:              row.body,
    refCode:           row.refCode ?? undefined,
    line:              row.line ?? undefined,
    salesRepId:        row.salesRepId ?? undefined,
    evidence:          row.evidence as Record<string, string | number | boolean | null>,
    operationalImpact: row.operationalImpact,
    createdAt:         row.createdAt.toISOString(),
  }));
}

// ─── Event reader (for timeline + copilot) ────────────────────────────────────

/**
 * Load the most recent operational events for an org.
 * Used by the timeline builder and copilot signal enrichment.
 */
export async function loadRecentOperationalEvents(
  orgId: string,
  opts: { daysBack?: number; limit?: number; types?: CommercialEventType[] } = {},
): Promise<CommercialEventRecord[]> {
  const { daysBack = 30, limit = 100, types } = opts;

  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const rows = await prisma.commercialOperationalEvent.findMany({
    where: {
      organizationId: orgId,
      createdAt:      { gte: since },
      ...(types?.length ? { type: { in: types } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take:    limit,
  });

  return rows.map((row) => ({
    id:                row.id,
    organizationId:    row.organizationId,
    type:              row.type as CommercialEventType,
    severity:          row.severity as CommercialEventSeverity,
    title:             row.title,
    body:              row.body,
    refCode:           row.refCode ?? undefined,
    line:              row.line ?? undefined,
    salesRepId:        row.salesRepId ?? undefined,
    evidence:          row.evidence as Record<string, string | number | boolean | null>,
    operationalImpact: row.operationalImpact,
    createdAt:         row.createdAt.toISOString(),
  }));
}
