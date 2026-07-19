/**
 * lib/operational-map/certification/operational-kpi-gap-detector.ts
 *
 * KPI Gap Detector — Identifies missing KPIs by domain.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Compares the set of registered + custom KPIs against a known "expected" set
 * per domain. Surfaces critical KPIs that are missing from the system.
 *
 * Sprint: AGENTIK-LIVE-KPI-CERTIFICATION-WORKSPACE-01
 */

// ─── Expected KPI catalog per domain ─────────────────────────────────────────
// Represents the business-defined "minimum viable KPI set" per domain.
// Keys are normalized labels used for gap detection (not entityKeys).

interface ExpectedKpi {
  label:       string;
  priority:    "critical" | "high" | "medium";
  reason:      string;
  domain:      string;
  suggestedSourceOfTruth: string;
}

const EXPECTED_KPI_CATALOG: ExpectedKpi[] = [
  // ── Torre de Control ──────────────────────────────────────────────────────
  { domain: "torre_control", label: "Ventas del Día F1",           priority: "critical", reason: "KPI de ingreso primario. Sin él, Torre de Control no puede calcular liquidez ni cierre.", suggestedSourceOfTruth: "SAG" },
  { domain: "torre_control", label: "Ventas del Día F2",           priority: "critical", reason: "Ventas F2 (remisiones) deben separarse de F1 para tracking de pipeline.", suggestedSourceOfTruth: "SAG" },
  { domain: "torre_control", label: "Pedidos del Día",             priority: "critical", reason: "Pedidos confirmados antes del corte. Alimenta proyección de despacho y liquidez.", suggestedSourceOfTruth: "SAG" },
  { domain: "torre_control", label: "Pedidos Confirmados",         priority: "high",     reason: "Pedidos con aprobación de crédito listos para facturar.", suggestedSourceOfTruth: "SAG" },
  { domain: "torre_control", label: "Caja Bancaria",               priority: "critical", reason: "Posición de caja real del día. Sin esto, liquidez operativa es estimado.", suggestedSourceOfTruth: "Banco" },

  // ── Comercial ─────────────────────────────────────────────────────────────
  { domain: "comercial", label: "Ventas F1 por Representante",    priority: "critical", reason: "Performance individual de ventas facturadas. Core de comisiones.", suggestedSourceOfTruth: "SAG" },
  { domain: "comercial", label: "Ventas F2 por Representante",    priority: "high",     reason: "Pipeline de ventas aún en despacho/remisión por rep.", suggestedSourceOfTruth: "SAG" },
  { domain: "comercial", label: "Ventas Tiendas",                 priority: "high",     reason: "Ventas por canal tienda física. Separado de ruta.", suggestedSourceOfTruth: "SAG" },
  { domain: "comercial", label: "Ventas Web / Shopify",           priority: "medium",   reason: "Ventas digitales vía Shopify. Fuente externa pendiente de integración.", suggestedSourceOfTruth: "Agentik" },
  { domain: "comercial", label: "Meta de Ventas",                 priority: "high",     reason: "Target de ventas del período. Denominador para % cumplimiento.", suggestedSourceOfTruth: "Agentik" },
  { domain: "comercial", label: "Cumplimiento de Meta",           priority: "critical", reason: "KPI de rendimiento comercial. Sin meta vs real, la Torre de Control no puede alertar.", suggestedSourceOfTruth: "Agentik" },

  // ── Cobranza ──────────────────────────────────────────────────────────────
  { domain: "cobranza", label: "Cobros Identificados del Día",    priority: "critical", reason: "Pagos recibidos y aplicados hoy. Alimenta liquidez y cartera.", suggestedSourceOfTruth: "SAG" },
  { domain: "cobranza", label: "Consignaciones Pendientes",       priority: "critical", reason: "Consignaciones en tránsito sin aplicar. Riesgo de doble cobro.", suggestedSourceOfTruth: "SAG" },
  { domain: "cobranza", label: "Cartera F1 Vencida",              priority: "critical", reason: "Cartera facturada vencida. Fuente principal de gestión de cobranza.", suggestedSourceOfTruth: "SAG" },
  { domain: "cobranza", label: "Cartera F2 (Remisiones)",         priority: "high",     reason: "Cartera de remisiones pendiente de conversión a factura F1.", suggestedSourceOfTruth: "SAG" },
  { domain: "cobranza", label: "Tickets de Cobranza Activos",     priority: "high",     reason: "Gestiones de cobranza sin resultado final. KPI de productividad.", suggestedSourceOfTruth: "Agentik" },

  // ── Tesorería ─────────────────────────────────────────────────────────────
  { domain: "tesoreria", label: "Liquidez Operativa del Día",     priority: "critical", reason: "Caja bancaria + cobros − pagos programados. KPI fundamental de tesorería.", suggestedSourceOfTruth: "Banco" },
  { domain: "tesoreria", label: "Cobros del Día (Tesorería)",     priority: "critical", reason: "Entradas de efectivo confirmadas hoy.", suggestedSourceOfTruth: "SAG" },
  { domain: "tesoreria", label: "Pagos Programados Hoy",          priority: "high",     reason: "Compromisos de pago del día actual. Crítico para disponibilidad de caja.", suggestedSourceOfTruth: "SAG" },

  // ── Finanzas ──────────────────────────────────────────────────────────────
  { domain: "finanzas", label: "Ventas Brutas F1 Acumuladas",     priority: "critical", reason: "Ventas reconocidas del período para cierre contable.", suggestedSourceOfTruth: "SAG" },
  { domain: "finanzas", label: "Devoluciones y Notas Crédito",    priority: "high",     reason: "Descuentos comerciales y devoluciones. Reduce ventas netas.", suggestedSourceOfTruth: "SAG" },
  { domain: "finanzas", label: "Ingresos F2 Pendientes",          priority: "high",     reason: "Remisiones F2 no convertidas. Ingreso diferido hasta facturación.", suggestedSourceOfTruth: "SAG" },

  // ── Inventario ────────────────────────────────────────────────────────────
  { domain: "inventario", label: "Entradas de Inventario",        priority: "high",     reason: "Recepciones de mercancía del período. Alimenta disponibilidad.", suggestedSourceOfTruth: "SAG" },
  { domain: "inventario", label: "Salidas de Inventario",         priority: "high",     reason: "Despachos confirmados del período. Contra-parte de entradas.", suggestedSourceOfTruth: "SAG" },
  { domain: "inventario", label: "Ajustes de Inventario",         priority: "medium",   reason: "Ajustes manuales SAG. Identifica diferencias físicas.", suggestedSourceOfTruth: "SAG" },

  // ── Logística ─────────────────────────────────────────────────────────────
  { domain: "logistica", label: "Remisiones del Día",             priority: "critical", reason: "F2 despachados hoy. Alimenta Torre de Control con pipeline.", suggestedSourceOfTruth: "SAG" },
  { domain: "logistica", label: "Tasa de Entrega",                priority: "high",     reason: "% pedidos entregados / pedidos despachados. KPI de logística.", suggestedSourceOfTruth: "SAG" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KpiGap {
  domain:                 string;
  domainLabel:            string;
  missingLabel:           string;
  priority:               "critical" | "high" | "medium";
  reason:                 string;
  suggestedSourceOfTruth: string;
  /** True if a similar KPI exists but under a different name */
  possibleMatch:          string | null;
}

export interface KpiGapReport {
  totalGaps:    number;
  criticalGaps: number;
  highGaps:     number;
  byDomain:     Record<string, KpiGap[]>;
  gaps:         KpiGap[];
}

// ─── Domain labels ────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  torre_control: "Torre de Control", comercial: "Comercial",
  inventario: "Inventario", produccion: "Producción",
  cartera: "Cartera", cobranza: "Cobranza", tesoreria: "Tesorería",
  finanzas: "Finanzas", logistica: "Logística",
};

// ─── Gap detection ────────────────────────────────────────────────────────────

/**
 * Detect missing KPIs by comparing expected catalog against registered KPI labels.
 * Uses fuzzy string matching (includes substring) to detect partial matches.
 */
export function detectKpiGaps(
  registeredLabels: string[],
): KpiGapReport {
  const normalizedRegistered = registeredLabels.map(l => l.toLowerCase());

  const gaps: KpiGap[] = [];

  for (const expected of EXPECTED_KPI_CATALOG) {
    const expectedNorm = expected.label.toLowerCase();

    // Check if any registered KPI contains key words from the expected label
    const isRegistered = normalizedRegistered.some(reg =>
      reg.includes(expectedNorm) || expectedNorm.includes(reg.slice(0, 8))
    );

    if (isRegistered) continue;

    // Look for a possible match (partial overlap)
    const words   = expectedNorm.split(/\s+/);
    const match   = registeredLabels.find(reg => {
      const regNorm = reg.toLowerCase();
      return words.filter(w => w.length > 3).some(w => regNorm.includes(w));
    });

    gaps.push({
      domain:                 expected.domain,
      domainLabel:            DOMAIN_LABELS[expected.domain] ?? expected.domain,
      missingLabel:           expected.label,
      priority:               expected.priority,
      reason:                 expected.reason,
      suggestedSourceOfTruth: expected.suggestedSourceOfTruth,
      possibleMatch:          match ?? null,
    });
  }

  const byDomain: Record<string, KpiGap[]> = {};
  for (const gap of gaps) {
    if (!byDomain[gap.domain]) byDomain[gap.domain] = [];
    byDomain[gap.domain].push(gap);
  }

  return {
    totalGaps:    gaps.length,
    criticalGaps: gaps.filter(g => g.priority === "critical").length,
    highGaps:     gaps.filter(g => g.priority === "high").length,
    byDomain,
    gaps,
  };
}
