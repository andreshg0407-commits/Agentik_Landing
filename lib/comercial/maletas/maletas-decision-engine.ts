/**
 * lib/comercial/maletas/maletas-decision-engine.ts
 *
 * Commercial Decision Engine — transforms operational signals into
 * prioritized, actionable commercial decisions.
 *
 * PRINCIPLE: Every output answers exactly one of:
 *   qué producir / cuánto / por qué / a qué vendedor le falta /
 *   qué referencias se agotan / qué muestras no rotan /
 *   qué decisiones debe tomar la administradora HOY.
 *
 * No Prisma. No Excel. No AI. No side effects.
 * Pure deterministic computation from MaletasOperationalContext.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-DECISION-ENGINE-01
 */

import type {
  MaletasOperationalContext,
  CommercialCaseLine,
  CaseAlert,
} from "./maletas-types";
import type { CoverageSignal } from "./maletas-intelligence-types";

// ─── Enumerations ──────────────────────────────────────────────────────────────

export type DecisionType =
  | "produce"
  | "replenish_case"
  | "remove_non_rotation"
  | "transfer_inventory"
  | "wait_production"
  | "review_pd"
  | "review_rule"
  | "review_shortage";

export type DecisionSeverity = "critical" | "high" | "medium" | "low";

export type DecisionReason =
  | "pd_alto_disponible_bajo"
  | "cobertura_insuficiente"
  | "sin_stock_multi_vendedor"
  | "sin_stock"
  | "bajo_minimo"
  | "sin_rotacion_30d"
  | "cobertura_excesiva"
  | "lote_en_proceso"
  | "presion_pd_linea"
  | "maleta_incompleta"
  | "sobre_comprometido";

export type DecisionAction =
  | "enviar_a_produccion"
  | "reponer_maleta"
  | "retirar_muestra"
  | "reubicar_inventario"
  | "esperar_lote"
  | "revisar_pedido"
  | "revisar_regla"
  | "revisar_escasez"
  | "marcar_revisado"
  | "posponer";

// ─── Core decision model ───────────────────────────────────────────────────────

export interface CommercialDecision {
  /** Stable deterministic ID — reference-scoped */
  id:                     string;
  type:                   DecisionType;
  severity:               DecisionSeverity;
  /** Short imperative title — operator reads at a glance */
  title:                  string;
  /** One-line context: units · vendors · PD */
  summary:                string;
  reference?:             string;
  line?:                  CommercialCaseLine;
  category?:              string;
  affectedSalesReps:      string[];
  affectedCases:          string[];
  pendingOrdersQty:       number;
  availableForCases:      number;
  productionSuggestedQty: number;
  currentCoverage:        number | null;
  minimumRequired:        number;
  rotationDays:           number | null;
  reason:                 DecisionReason;
  ruleTriggered:          string | null;
  recommendedAction:      DecisionAction;
  /** Causal explanation — deterministic, human-readable, no AI */
  operationalImpact:      string;
  createdAt:              string;
}

// ─── Priority stack ────────────────────────────────────────────────────────────

export interface OperationalPriorityStack {
  critical:      CommercialDecision[];
  high:          CommercialDecision[];
  medium:        CommercialDecision[];
  low:           CommercialDecision[];
  totalCount:    number;
  criticalCount: number;
  generatedAt:   string;
}

// ─── Line pressure ─────────────────────────────────────────────────────────────

export interface CommercialLinePressure {
  line:                   CommercialCaseLine;
  pressureScore:          number;             // 0–100
  coverageAvgDays:        number | null;
  refsAtRisk:             number;             // sin_stock + ruptura_inminente
  refsLow:                number;             // cobertura_baja
  refsHot:                number;             // critica/urgente production signals
  pendingOrdersTotal:     number;
  productionSuggestedQty: number;
  rotationAvgDays:        number | null;
  status:                 "critica" | "presion" | "estable" | "lenta";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEV_ORDER: Record<DecisionSeverity, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
};

function nowIso(): string {
  return new Date().toISOString();
}

function sortBySeverity(decisions: CommercialDecision[]): CommercialDecision[] {
  return decisions.sort(
    (a, b) =>
      SEV_ORDER[a.severity] - SEV_ORDER[b.severity] ||
      b.pendingOrdersQty - a.pendingOrdersQty,
  );
}

// ─── Phase 2 — Production decisions ───────────────────────────────────────────
//
// Source: context.productionRecommendations (items where recommendedAction === "PRODUCIR")
// Enriched with: coverage signals, PD pending orders, batch status.

export function buildProductionDecisions(
  context: MaletasOperationalContext,
): CommercialDecision[] {
  const intel   = context.intelligence;
  const decisions: CommercialDecision[] = [];

  // Coverage map
  const covByRef = new Map<string, CoverageSignal>();
  for (const cov of intel?.coverage ?? []) {
    covByRef.set(cov.refCode.toUpperCase(), cov);
  }

  // PD pending orders: pdDemandSignals is the authoritative source
  const pdByRef = new Map<string, number>();
  if (intel?.pdDemandSignals?.length) {
    for (const pd of intel.pdDemandSignals) {
      pdByRef.set(pd.reference.toUpperCase(), pd.totalPendingOrders);
    }
  } else {
    for (const cov of intel?.coverage ?? []) {
      if ((cov.pendingOrdersQty ?? 0) > 0) {
        pdByRef.set(cov.refCode.toUpperCase(), cov.pendingOrdersQty!);
      }
    }
  }

  for (const rec of context.productionRecommendations) {
    const refKey = rec.reference.toUpperCase();
    const cov    = covByRef.get(refKey);
    const pdQty  = pdByRef.get(refKey) ?? 0;

    // Batch status from items
    const item           = context.items.find(i => i.reference.toUpperCase() === refKey);
    const batchInProcess = item?.productionInProcess ?? false;
    const batchLabel     = item?.productionBatchLabel ?? null;

    const repNames = rec.affectedSalesReps.map(
      id => context.salesReps.find(r => r.id === id)?.name ?? id,
    );

    // ── Severity rules (Phase 2) ─────────────────────────────────────────────
    // lote en proceso → lower urgency regardless of demand
    // PD alto + disponible bajo → critical/high depending on vendor count
    // sin stock + multi-vendor → high
    // Otherwise → medium

    let severity: DecisionSeverity;
    if (batchInProcess) {
      severity = "low";
    } else if (pdQty > 0 && rec.availableToReplenish <= 0) {
      severity = rec.affectedSalesReps.length >= 2 ? "critical" : "high";
    } else if (rec.affectedSalesReps.length >= 3) {
      severity = "high";
    } else if (rec.availableToReplenish <= 0) {
      severity = "high";
    } else {
      severity = "medium";
    }

    const type: DecisionType = batchInProcess ? "wait_production" : "produce";

    // ── Causal explanation (Phase 6) ────────────────────────────────────────
    const impactParts: string[] = [];
    if (repNames.length > 0) {
      impactParts.push(
        `${repNames.length} vendedor${repNames.length > 1 ? "es" : ""} sin stock (${repNames.join(", ")})`,
      );
    }
    if (pdQty > 0) {
      impactParts.push(
        `${pdQty} pedido${pdQty > 1 ? "s" : ""} PD pendiente${pdQty > 1 ? "s" : ""} sin cobertura`,
      );
    }
    if (cov?.coverageDays !== null && cov?.coverageDays !== undefined && !batchInProcess) {
      impactParts.push(`${cov.coverageDays} día${cov.coverageDays !== 1 ? "s" : ""} de cobertura restantes`);
    }
    if (batchInProcess && batchLabel) {
      impactParts.push(`Lote "${batchLabel}" en proceso — aguardar resultado`);
    }

    const reason: DecisionReason =
      pdQty > 0 && rec.availableToReplenish <= 0
        ? "pd_alto_disponible_bajo"
        : rec.affectedSalesReps.length >= 2
          ? "sin_stock_multi_vendedor"
          : rec.availableToReplenish <= 0
            ? "sin_stock"
            : "cobertura_insuficiente";

    decisions.push({
      id:                     `produce_${rec.reference}`,
      type,
      severity,
      title:                  batchInProcess
                                ? `Esperar lote: ${rec.description}`
                                : `Producir ${rec.description}`,
      summary:                [
                                `${rec.suggestedProductionQty} uds sugeridas`,
                                `${rec.affectedSalesReps.length} vendedor${rec.affectedSalesReps.length !== 1 ? "es" : ""} afectado${rec.affectedSalesReps.length !== 1 ? "s" : ""}`,
                                ...(pdQty > 0 ? [`${pdQty} PD pendientes`] : []),
                              ].join(" · "),
      reference:              rec.reference,
      line:                   rec.line,
      affectedSalesReps:      rec.affectedSalesReps,
      affectedCases:          rec.affectedSalesReps.map(id => `${id}_${rec.line}`),
      pendingOrdersQty:       pdQty,
      availableForCases:      rec.availableToReplenish,
      productionSuggestedQty: rec.suggestedProductionQty,
      currentCoverage:        cov?.coverageDays ?? null,
      minimumRequired:        rec.totalMissing,
      rotationDays:           null,
      reason,
      ruleTriggered:          null,
      recommendedAction:      batchInProcess ? "esperar_lote" : "enviar_a_produccion",
      operationalImpact:      impactParts.length > 0
                                ? impactParts.join(". ") + "."
                                : "Sin cobertura operacional para este período.",
      createdAt:              nowIso(),
    });
  }

  return sortBySeverity(decisions);
}

// ─── Phase 3 — Case replenishment decisions ────────────────────────────────────
//
// Source: context.alerts filtered to recommendedAction === "REPONER_MALETA"
// Grouped per salesRep × line → one decision per case.

export function buildCaseReplenishmentDecisions(
  context: MaletasOperationalContext,
): CommercialDecision[] {
  const decisions: CommercialDecision[] = [];

  type RepGroup = {
    repId:   string;
    repName: string;
    line:    CommercialCaseLine;
    alerts:  CaseAlert[];
  };

  const groups = new Map<string, RepGroup>();

  for (const alert of context.alerts) {
    if (alert.recommendedAction !== "REPONER_MALETA") continue;
    const key = `${alert.salesRepId}_${alert.line}`;
    if (!groups.has(key)) {
      groups.set(key, { repId: alert.salesRepId, repName: alert.salesRepName, line: alert.line, alerts: [] });
    }
    groups.get(key)!.alerts.push(alert);
  }

  for (const [, g] of groups) {
    const agotadas    = g.alerts.filter(a => a.type === "SIN_STOCK").length;
    const bajoMin     = g.alerts.filter(a => a.type === "BAJO_MINIMO").length;
    const enProceso   = g.alerts.filter(a => a.type === "EN_PROCESO").length;
    const totalMissing = g.alerts.length;
    const disponible  = g.alerts.reduce((s, a) => s + a.availableToReplenish, 0);

    const impactParts: string[] = [];
    if (agotadas > 0) impactParts.push(`${agotadas} referencia${agotadas > 1 ? "s" : ""} agotada${agotadas > 1 ? "s" : ""} en maleta`);
    if (bajoMin > 0) impactParts.push(`${bajoMin} bajo mínimo`);
    if (enProceso > 0) impactParts.push(`${enProceso} en proceso de producción`);
    if (disponible > 0) impactParts.push(`${disponible} uds disponibles para reposición inmediata`);

    decisions.push({
      id:                     `replenish_${g.repId}_${g.line}`,
      type:                   "replenish_case",
      severity:               agotadas >= 3 ? "high" : agotadas > 0 ? "medium" : "low",
      title:                  `Reponer maleta ${g.repName} · ${g.line}`,
      summary:                [
                                `${totalMissing} referencia${totalMissing !== 1 ? "s" : ""} incompleta${totalMissing !== 1 ? "s" : ""}`,
                                ...(disponible > 0 ? [`${disponible} uds disponibles`] : []),
                              ].join(" · "),
      line:                   g.line,
      affectedSalesReps:      [g.repId],
      affectedCases:          [`${g.repId}_${g.line}`],
      pendingOrdersQty:       0,
      availableForCases:      disponible,
      productionSuggestedQty: 0,
      currentCoverage:        null,
      minimumRequired:        totalMissing,
      rotationDays:           null,
      reason:                 agotadas > 0 ? "sin_stock" : "bajo_minimo",
      ruleTriggered:          null,
      recommendedAction:      "reponer_maleta",
      operationalImpact:      impactParts.join(". ") + ".",
      createdAt:              nowIso(),
    });
  }

  return sortBySeverity(decisions);
}

// ─── Phase 4 — Non-rotation decisions ─────────────────────────────────────────
//
// Source: context.intelligence.deadStockSignals
// Rule: references with no sales in configured window occupying case space.

export function buildNonRotationDecisions(
  context: MaletasOperationalContext,
): CommercialDecision[] {
  const dead = context.intelligence?.deadStockSignals ?? [];

  return sortBySeverity(
    dead.map(signal => {
      const days    = signal.daysSinceLastSale;
      const daysStr = days !== null ? `${days} días sin ventas` : "Sin historial de ventas";

      const action: DecisionAction =
        signal.disposalSuggestion === "descontinuar"
          ? "retirar_muestra"
          : signal.disposalSuggestion === "reubicar"
            ? "reubicar_inventario"
            : "revisar_escasez";

      return {
        id:                     `nonrotation_${signal.refCode}`,
        type:                   "remove_non_rotation" as DecisionType,
        severity:               (signal.commercialRisk >= 70 ? "medium" : "low") as DecisionSeverity,
        title:                  `Retirar muestra: ${signal.description}`,
        summary:                `${daysStr} · ${signal.disponible} uds en maleta`,
        reference:              signal.refCode,
        line:                   signal.line,
        affectedSalesReps:      signal.assignedSalesRepIds,
        affectedCases:          signal.assignedSalesRepIds.map(id => `${id}_${signal.line}`),
        pendingOrdersQty:       0,
        availableForCases:      signal.disponible,
        productionSuggestedQty: 0,
        currentCoverage:        null,
        minimumRequired:        1,
        rotationDays:           days,
        reason:                 "sin_rotacion_30d" as DecisionReason,
        ruleTriggered:          days !== null ? `Sin venta en ${days}+ días` : "Sin historial",
        recommendedAction:      action,
        operationalImpact:      `${daysStr}. Muestra ocupa espacio productivo en maleta. Riesgo comercial: ${signal.commercialRisk}/100.`,
        createdAt:              nowIso(),
      };
    }),
  );
}

// ─── Phase 9 — Line pressure ───────────────────────────────────────────────────
//
// Detects: LT/CS presión, niña bebé creciendo, líneas saturadas/lentas.
// One CommercialLinePressure per commercial line.

export function buildLinePressure(
  context: MaletasOperationalContext,
): CommercialLinePressure[] {
  const intel = context.intelligence;
  if (!intel) return [];

  return (["LT", "CS"] as CommercialCaseLine[]).map(line => {
    const covSignals = intel.coverage.filter(c => c.line === line);

    const refsAtRisk = covSignals.filter(
      c => c.status === "sin_stock" || c.status === "ruptura_inminente",
    ).length;
    const refsLow = covSignals.filter(c => c.status === "cobertura_baja").length;

    const refsHot = intel.productionSignals.filter(
      p => p.line === line && (p.urgency === "critica" || p.urgency === "urgente"),
    ).length;

    const pendingTotal = covSignals.reduce(
      (sum, c) => sum + (c.pendingOrdersQty ?? 0),
      0,
    );

    const prodSuggested = context.productionRecommendations
      .filter(r => r.line === line)
      .reduce((sum, r) => sum + r.suggestedProductionQty, 0);

    const daysArr = covSignals
      .map(c => c.coverageDays)
      .filter((d): d is number => d !== null);
    const coverageAvg =
      daysArr.length > 0
        ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length)
        : null;

    const pressureScore = Math.min(
      100,
      refsAtRisk * 25 + refsLow * 10 + (pendingTotal > 0 ? 15 : 0),
    );

    const status: CommercialLinePressure["status"] =
      pressureScore >= 60
        ? "critica"
        : pressureScore >= 30
          ? "presion"
          : refsHot === 0 && refsLow === 0 && refsAtRisk === 0
            ? "lenta"
            : "estable";

    return {
      line,
      pressureScore,
      coverageAvgDays: coverageAvg,
      refsAtRisk,
      refsLow,
      refsHot,
      pendingOrdersTotal: pendingTotal,
      productionSuggestedQty: prodSuggested,
      rotationAvgDays: null,
      status,
    };
  });
}

// ─── Phase 5 — Operational priority stack ─────────────────────────────────────
//
// Merges all decision types into a single sorted priority stack.
// Operator opens module → sees exactly what to resolve first.

export function buildOperationalPriorityStack(
  context: MaletasOperationalContext,
): OperationalPriorityStack {
  const all = [
    ...buildProductionDecisions(context),
    ...buildCaseReplenishmentDecisions(context),
    ...buildNonRotationDecisions(context),
  ];

  return {
    critical:      all.filter(d => d.severity === "critical"),
    high:          all.filter(d => d.severity === "high"),
    medium:        all.filter(d => d.severity === "medium"),
    low:           all.filter(d => d.severity === "low"),
    totalCount:    all.length,
    criticalCount: all.filter(d => d.severity === "critical").length,
    generatedAt:   new Date().toISOString(),
  };
}
