/**
 * lib/comercial/maletas/maletas-production.ts
 *
 * Production intelligence — translates shortfalls → enriched production signals.
 * Takes raw alerts + coverage signals → ProductionSignal[] with urgency, reasoning.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-INTELLIGENCE-01
 */

import type {
  ProductionSignal,
  ProductionUrgency,
  CoverageSignal,
} from "./maletas-intelligence-types";
import type { CaseItem, CaseAlert } from "./maletas-types";
import { computeSuggestedProductionQty } from "./maletas-rules";

// ─── Urgency thresholds ────────────────────────────────────────────────────────

const URGENCY_CRITICA_VENDORS   = 3;  // 3+ vendors affected
const URGENCY_COVERAGE_URGENTE  = 3;  // < 3 coverage days
const URGENCY_COVERAGE_ALTA     = 7;  // 3–7 coverage days
const URGENCY_COVERAGE_IMPORTANTE = 14; // 7–14 coverage days

// ─── Core function ─────────────────────────────────────────────────────────────

/**
 * Build enriched production signals from items and coverage data.
 * Groups by reference across all vendors — one signal per ref.
 *
 * @param pendingOrdersMap — SAG PD quantities per ref (key = UPPERCASE refCode).
 *   When provided, refs with PD > 0 and no stock get elevated urgency and
 *   have pendingOrdersQty/demandPressureScore populated on the output signal.
 */
export function buildProductionSignals(
  items: CaseItem[],
  alerts: CaseAlert[],
  coverageSignals: CoverageSignal[],
  pendingOrdersMap?: Map<string, number>,
): ProductionSignal[] {
  // Build coverage lookup
  const coverageByRef = new Map<string, CoverageSignal>();
  for (const cs of coverageSignals) {
    coverageByRef.set(cs.refCode.toUpperCase(), cs);
  }

  // Collect items that need production or replenishment decision
  const productionItems = items.filter(
    (i) =>
      i.recommendedAction === "PRODUCIR" ||
      i.recommendedAction === "ESPERAR_LOTE" ||
      i.status === "sin_stock" ||
      i.status === "bajo_minimo",
  );

  // Group by reference
  const byRef = new Map<
    string,
    {
      item: CaseItem;
      affectedRepIds: Set<string>;
      totalMissing: number;
    }
  >();

  for (const item of productionItems) {
    const key = item.reference.toUpperCase();
    if (!byRef.has(key)) {
      byRef.set(key, {
        item,
        affectedRepIds: new Set(item.assignedToSalesReps),
        totalMissing: item.missingUnits * item.assignedToSalesReps.length,
      });
    } else {
      const entry = byRef.get(key)!;
      for (const repId of item.assignedToSalesReps) {
        entry.affectedRepIds.add(repId);
      }
      // Update total missing (max across vendors, since each gets 1 unit minimum)
      entry.totalMissing = Math.max(
        entry.totalMissing,
        item.missingUnits * entry.affectedRepIds.size,
      );
    }
  }

  const signals: ProductionSignal[] = [];

  for (const [refUpper, { item, affectedRepIds, totalMissing }] of byRef) {
    const coverage = coverageByRef.get(refUpper);
    const affectedCount = affectedRepIds.size;
    const pendingOrdersQty = pendingOrdersMap?.get(refUpper) ?? 0;

    const urgency = computeUrgency(
      item.status,
      coverage?.coverageDays ?? null,
      affectedCount,
      item.productionInProcess,
    );

    const priority = computeProductionSignalPriority(
      urgency,
      affectedCount,
      totalMissing,
      item.availableToReplenish,
    );

    const suggestedQty = computeSuggestedProductionQty(totalMissing);

    // Demand pressure score: boosted when PD orders exist with no stock
    const demandPressureScore =
      pendingOrdersQty > 0
        ? Math.min(100, (coverage?.operationalScore ?? 0) + (item.currentUnits <= 0 ? 20 : 10))
        : undefined;

    signals.push({
      reference: item.reference,
      description: item.description,
      line: item.line,
      affectedSalesRepIds: [...affectedRepIds],
      affectedSalesRepCount: affectedCount,
      totalMissing,
      coverageDaysRemaining: coverage?.coverageDays ?? null,
      batchInProcess: item.productionInProcess,
      batchLabel: item.productionBatchLabel,
      availableToReplenish: item.availableToReplenish,
      urgency,
      priority,
      suggestedQty,
      reasoning: buildReasoning(
        urgency,
        item,
        affectedCount,
        coverage?.coverageDays ?? null,
      ),
      ...(pendingOrdersQty > 0 && { pendingOrdersQty, demandPressureScore }),
    });
  }

  return signals.sort((a, b) => a.priority - b.priority);
}

// ─── Urgency computation ───────────────────────────────────────────────────────

export function computeUrgency(
  itemStatus: CaseItem["status"],
  coverageDays: number | null,
  affectedVendorCount: number,
  batchInProcess: boolean,
): ProductionUrgency {
  // Critica: stockout + multi-vendor + no batch
  if (
    (itemStatus === "sin_stock" || itemStatus === "sobre_comprometido") &&
    affectedVendorCount >= URGENCY_CRITICA_VENDORS &&
    !batchInProcess
  ) {
    return "critica";
  }

  // Urgente: stockout OR near rupture
  if (
    itemStatus === "sobre_comprometido" ||
    (itemStatus === "sin_stock" && !batchInProcess)
  ) {
    return "urgente";
  }

  if (coverageDays !== null) {
    if (coverageDays < URGENCY_COVERAGE_URGENTE) return "urgente";
    if (coverageDays < URGENCY_COVERAGE_ALTA) return "alta";
    if (coverageDays < URGENCY_COVERAGE_IMPORTANTE) return "importante";
  }

  if (batchInProcess) return "normal";

  // bajo_minimo with no coverage data
  if (itemStatus === "bajo_minimo") return "importante";

  return "normal";
}

// ─── Priority score (0 = highest) ─────────────────────────────────────────────

export function computeProductionSignalPriority(
  urgency: ProductionUrgency,
  vendorCount: number,
  totalMissing: number,
  availableToReplenish: number,
): number {
  const urgencyBase: Record<ProductionUrgency, number> = {
    critica:    0,
    urgente:    15,
    alta:       30,
    importante: 50,
    normal:     70,
  };

  let score = urgencyBase[urgency];
  score -= vendorCount * 5;                // more vendors → lower score (higher priority)
  score -= Math.min(20, totalMissing * 2); // more missing → higher priority
  score += availableToReplenish > 0 ? 10 : 0; // stock exists → slight deprioritize production

  return Math.max(0, Math.min(100, score));
}

// ─── Reasoning builder ────────────────────────────────────────────────────────

function buildReasoning(
  urgency: ProductionUrgency,
  item: CaseItem,
  affectedCount: number,
  coverageDays: number | null,
): string {
  const parts: string[] = [];

  if (item.status === "sin_stock") {
    parts.push("Sin stock disponible.");
  } else if (item.status === "sobre_comprometido") {
    parts.push("Inventario comprometido por encima del disponible.");
  } else if (item.status === "bajo_minimo") {
    parts.push(`Stock ${item.currentUnits}u / mínimo ${item.minimumRequired}u.`);
  }

  if (affectedCount > 1) {
    parts.push(`Afecta ${affectedCount} vendedor${affectedCount > 1 ? "es" : ""}.`);
  }

  if (coverageDays !== null) {
    parts.push(`Cobertura estimada: ${Math.round(coverageDays)}d.`);
  }

  if (item.productionInProcess) {
    parts.push(
      `Lote en proceso${item.productionBatchLabel ? `: ${item.productionBatchLabel}` : ""}.`,
    );
  } else if (item.availableToReplenish > 0) {
    parts.push(
      `Disponible para reponer: ${item.availableToReplenish}u. Considerar antes de producir.`,
    );
  }

  const urgencyLabels: Record<ProductionUrgency, string> = {
    critica:    "CRÍTICA — producción inmediata.",
    urgente:    "Urgente — requiere acción esta semana.",
    alta:       "Alta — planificar producción próximos 7 días.",
    importante: "Importante — en próximo ciclo de producción.",
    normal:     "Normal — incluir en planificación regular.",
  };

  parts.push(urgencyLabels[urgency]);

  return parts.join(" ");
}

// ─── Pressure aggregate ───────────────────────────────────────────────────────

/**
 * Compute an aggregate production pressure score (0–100) for the org.
 * Considers urgency distribution and vendor exposure.
 */
export function computeProductionPressure(signals: ProductionSignal[]): number {
  if (signals.length === 0) return 0;

  const urgencyWeights: Record<ProductionUrgency, number> = {
    critica: 100, urgente: 75, alta: 50, importante: 25, normal: 10,
  };

  const totalWeight = signals.reduce(
    (acc, s) => acc + urgencyWeights[s.urgency] * s.affectedSalesRepCount,
    0,
  );

  // Normalize: max theoretical = signals.length * 100 * 4 vendors
  const maxWeight = signals.length * 100 * 4;
  return Math.min(100, Math.round((totalWeight / maxWeight) * 100));
}
