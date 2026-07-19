/**
 * availability-signals.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Signal generators for Commercial Availability Intelligence.
 *
 * Generates Business Signals that are consumable by:
 * - Executive Dashboard
 * - David (copilot)
 * - Decision Engine
 * - Action Engine
 * - Alert Center
 *
 * Signal types generated:
 *   INVENTORY_LOW              — existencia below threshold
 *   INVENTORY_AVAILABLE        — reference has healthy availability
 *   INVENTORY_UNAVAILABLE      — reference has zero availability
 *   MALLETA_REPLACEMENT_REQUIRED — maleta sample needs to be pulled
 *
 * No Prisma. No React. No server-only. Pure domain logic.
 */

import type { BusinessSignal } from "@/lib/business-signals";
import { buildSignal } from "@/lib/business-signals/signal-builder";
import type { CommercialAvailabilityReport } from "./availability-types";
import type { MaletaReplacementReport } from "./availability-types";

// ── Availability Signals ─────────────────────────────────────────────────────

/** Generate signals from the availability report. */
export function buildAvailabilitySignals(opts: {
  organizationId: string;
  report: CommercialAvailabilityReport;
}): BusinessSignal[] {
  const { organizationId, report } = opts;
  const signals: BusinessSignal[] = [];

  for (const row of report.rows) {
    if (row.status === "sin_existencia") {
      signals.push(buildSignal({
        organizationId,
        entityId: row.reference,
        entityType: "product_reference",
        category: "inventory",
        type: "absence_detected",
        title: `INVENTORY_UNAVAILABLE: ${row.reference}`,
        description: `Referencia ${row.reference} (${row.description}) sin existencia en Bodega ${report.sourceBodega}. ` +
          `SubLinea: ${row.subLinea}, SubGrupo: ${row.subGrupo}.`,
        severity: "high",
        priority: "high",
        source: "inventory",
        confidence: report.confidence,
        metadata: {
          signalKind: "INVENTORY_UNAVAILABLE",
          reference: row.reference,
          subLinea: row.subLinea,
          subGrupo: row.subGrupo,
          existenciaBodega01: row.existenciaBodega01,
          pedidosPendientes: row.pedidosPendientes,
          disponibleReal: row.disponibleReal,
          sourceBodega: report.sourceBodega,
        },
      }));
    } else if (row.status === "sobre_comprometido") {
      signals.push(buildSignal({
        organizationId,
        entityId: row.reference,
        entityType: "product_reference",
        category: "inventory",
        type: "threshold_breach",
        title: `INVENTORY_LOW: ${row.reference} (sobre-comprometido)`,
        description: `Referencia ${row.reference} sobre-comprometida: pedidos (${row.pedidosPendientes}) ` +
          `exceden existencia (${row.existenciaBodega01}). Disponible real: ${row.disponibleReal}. ` +
          `SubLinea: ${row.subLinea}.`,
        severity: "critical",
        priority: "highest",
        source: "inventory",
        confidence: report.confidence,
        metadata: {
          signalKind: "INVENTORY_LOW",
          reference: row.reference,
          subLinea: row.subLinea,
          subGrupo: row.subGrupo,
          existenciaBodega01: row.existenciaBodega01,
          pedidosPendientes: row.pedidosPendientes,
          disponibleReal: row.disponibleReal,
          sourceBodega: report.sourceBodega,
        },
      }));
    } else if (row.status === "comprometido") {
      signals.push(buildSignal({
        organizationId,
        entityId: row.reference,
        entityType: "product_reference",
        category: "inventory",
        type: "threshold_breach",
        title: `INVENTORY_LOW: ${row.reference} (comprometido)`,
        description: `Referencia ${row.reference} totalmente comprometida: existencia (${row.existenciaBodega01}) ` +
          `igualada por pedidos (${row.pedidosPendientes}). Disponible real: 0. SubLinea: ${row.subLinea}.`,
        severity: "high",
        priority: "high",
        source: "inventory",
        confidence: report.confidence,
        metadata: {
          signalKind: "INVENTORY_LOW",
          reference: row.reference,
          subLinea: row.subLinea,
          subGrupo: row.subGrupo,
          existenciaBodega01: row.existenciaBodega01,
          pedidosPendientes: row.pedidosPendientes,
          disponibleReal: row.disponibleReal,
          sourceBodega: report.sourceBodega,
        },
      }));
    }
    // INVENTORY_AVAILABLE: only emit for healthy rows if needed downstream
    // Currently omitted to avoid signal noise — add if required.
  }

  return signals;
}

// ── Maleta Replacement Signals ───────────────────────────────────────────────

/** Generate signals from the maleta replacement report. */
export function buildMaletaReplacementSignals(opts: {
  organizationId: string;
  report: MaletaReplacementReport;
}): BusinessSignal[] {
  const { organizationId, report } = opts;
  const signals: BusinessSignal[] = [];

  for (const item of report.items) {
    const hasAffectedSellers = item.vendedoresAfectados.length > 0;
    const severity = item.existenciaActual === 0 ? "critical" as const
      : hasAffectedSellers ? "high" as const
      : "medium" as const;

    signals.push(buildSignal({
      organizationId,
      entityId: item.reference,
      entityType: "product_reference",
      category: "portfolio",
      type: "threshold_breach",
      title: `MALLETA_REPLACEMENT_REQUIRED: ${item.reference}`,
      description: item.motivo + (hasAffectedSellers
        ? ` Vendedores afectados: ${item.vendedoresAfectados.join(", ")}.`
        : ""),
      severity,
      priority: hasAffectedSellers ? "high" : "normal",
      source: "inventory",
      confidence: 90,
      metadata: {
        signalKind: "MALLETA_REPLACEMENT_REQUIRED",
        reference: item.reference,
        description: item.description,
        existenciaActual: item.existenciaActual,
        subLinea: item.subLinea,
        subGrupo: item.subGrupo,
        vendedoresAfectados: item.vendedoresAfectados,
        ruleSubLinea: item.ruleSubLinea,
        ruleThreshold: item.ruleThreshold,
        recomendacion: item.recomendacion,
      },
    }));
  }

  return signals;
}
