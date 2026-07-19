/**
 * lib/comercial/maletas/maletas-copilot-signals.ts
 *
 * Generates structured CopilotSignal[] for Agentik Copilot / David agent.
 * These signals live in the right rail, NOT inside the operational canvas.
 *
 * All signals are:
 * - Computed deterministically from engine output (no AI generation)
 * - Serializable (flat context object)
 * - Explainable (body is computed, traceable, not LLM-written)
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-INTELLIGENCE-01
 */

import type {
  CopilotSignal,
  CopilotSignalType,
  CopilotSignalSeverity,
  CoverageSignal,
  ProductionSignal,
  DeadStockSignal,
  SalesRepOperationalProfile,
  RefVelocity,
} from "./maletas-intelligence-types";
import type { CommercialCaseLine } from "./maletas-types";

// ─── Signal builder helpers ────────────────────────────────────────────────────

let _signalCounter = 0;
function signalId(type: CopilotSignalType): string {
  return `maletas_${type}_${Date.now()}_${++_signalCounter}`;
}

function makeSignal(
  type: CopilotSignalType,
  severity: CopilotSignalSeverity,
  title: string,
  body: string,
  context: CopilotSignal["context"],
  opts?: Pick<CopilotSignal, "refCode" | "salesRepId" | "line">,
): CopilotSignal {
  return {
    id: signalId(type),
    type,
    severity,
    title,
    body,
    context,
    ...opts,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Signal generators ─────────────────────────────────────────────────────────

/**
 * SIGNAL 1 — cobertura_critica
 * Fired when a ref has ruptura_inminente or sin_stock AND is a hot/active seller.
 */
export function generateCoberturasCriticas(
  coverageSignals: CoverageSignal[],
  velocityMap: Map<string, RefVelocity>,
): CopilotSignal[] {
  return coverageSignals
    .filter(
      (cs) =>
        (cs.status === "ruptura_inminente" || cs.status === "sin_stock") &&
        cs.affectedSalesRepIds.length >= 2,
    )
    .slice(0, 5) // top 5 most urgent
    .map((cs) => {
      const velocity = velocityMap.get(cs.refCode.toUpperCase());
      const days = cs.coverageDays !== null ? `${Math.round(cs.coverageDays)}d` : "stock agotado";
      const vendors = cs.affectedSalesRepIds.length;

      return makeSignal(
        "cobertura_critica",
        "critical",
        `${cs.line} · ${cs.refCode} en ruptura`,
        `${cs.description} tiene cobertura de ${days}. Afecta ${vendors} vendedor${vendors > 1 ? "es" : ""}. ` +
          (velocity?.classification === "caliente" ? "Referencia caliente con alta demanda." : ""),
        {
          refCode: cs.refCode,
          line: cs.line,
          disponible: cs.disponible,
          coverageDays: cs.coverageDays,
          vendorCount: vendors,
          velocity: velocity?.dailyVelocity ?? null,
        },
        { refCode: cs.refCode, line: cs.line as CommercialCaseLine },
      );
    });
}

/**
 * SIGNAL 2 — linea_agotandose
 * Fired when a garment category has > 50% refs in low/no coverage.
 */
export function generateLineaAgotandose(
  coverageSignals: CoverageSignal[],
): CopilotSignal[] {
  // Group by line
  const byLine = new Map<string, { low: number; total: number }>();
  for (const cs of coverageSignals) {
    const key = cs.line;
    if (!byLine.has(key)) byLine.set(key, { low: 0, total: 0 });
    const entry = byLine.get(key)!;
    entry.total++;
    if (
      cs.status === "ruptura_inminente" ||
      cs.status === "sin_stock" ||
      cs.status === "cobertura_baja"
    ) {
      entry.low++;
    }
  }

  const signals: CopilotSignal[] = [];
  for (const [line, { low, total }] of byLine) {
    if (total === 0) continue;
    const pct = low / total;
    if (pct < 0.5) continue;

    signals.push(
      makeSignal(
        "linea_agotandose",
        pct > 0.7 ? "critical" : "warning",
        `Línea ${line} con ${Math.round(pct * 100)}% referencias bajas`,
        `${low} de ${total} referencias de ${line} tienen cobertura baja o agotada. ` +
          `Revisar reposición y planificación de producción para esta línea.`,
        { line, lowRefs: low, totalRefs: total, lowPct: Math.round(pct * 100) },
        { line: line as CommercialCaseLine },
      ),
    );
  }

  return signals;
}

/**
 * SIGNAL 3 — vendedor_en_riesgo
 * Fired when a sales rep has > 30% of refs below minimum.
 */
export function generateVendedorEnRiesgo(
  profiles: SalesRepOperationalProfile[],
): CopilotSignal[] {
  return profiles
    .filter((p) => p.presionOperacional >= 30)
    .sort((a, b) => b.presionOperacional - a.presionOperacional)
    .slice(0, 4)
    .map((p) =>
      makeSignal(
        "vendedor_en_riesgo",
        p.presionOperacional >= 60 ? "critical" : "warning",
        `${p.salesRepName} · ${p.line} con ${p.presionOperacional}% presión`,
        `${p.refsAgotadas} referencias agotadas y ${p.refsBajoMinimo} bajo mínimo en maleta ${p.line}. ` +
          (p.dependenciaProduccion > 50
            ? `Alta dependencia de producción (${p.dependenciaProduccion}%).`
            : `Disponible para reponer: ${p.dependenciaReposicion}% de las referencias.`),
        {
          presion: p.presionOperacional,
          agotadas: p.refsAgotadas,
          bajoMinimo: p.refsBajoMinimo,
          depProduccion: p.dependenciaProduccion,
          riesgo: p.riesgoComercial,
        },
        { salesRepId: p.salesRepId, line: p.line as CommercialCaseLine },
      ),
    );
}

/**
 * SIGNAL 4 — produccion_insuficiente
 * Fired when production signals are urgente/critica.
 */
export function generateProduccionInsuficiente(
  productionSignals: ProductionSignal[],
): CopilotSignal[] {
  return productionSignals
    .filter((ps) => ps.urgency === "critica" || ps.urgency === "urgente")
    .slice(0, 5)
    .map((ps) =>
      makeSignal(
        "produccion_insuficiente",
        ps.urgency === "critica" ? "critical" : "warning",
        `Producir ${ps.reference} · ${ps.urgency.toUpperCase()}`,
        `${ps.reasoning}`,
        {
          reference: ps.reference,
          line: ps.line,
          urgency: ps.urgency,
          totalMissing: ps.totalMissing,
          suggestedQty: ps.suggestedQty,
          vendorCount: ps.affectedSalesRepCount,
          batchInProcess: ps.batchInProcess,
        },
        { refCode: ps.reference, line: ps.line as CommercialCaseLine },
      ),
    );
}

/**
 * SIGNAL 5 — referencia_caliente
 * Hot ref with velocity data — replenish before stockout.
 */
export function generateReferenciaCaliente(
  velocityMap: Map<string, RefVelocity>,
  coverageSignals: CoverageSignal[],
): CopilotSignal[] {
  const coverageByRef = new Map<string, CoverageSignal>();
  for (const cs of coverageSignals) {
    coverageByRef.set(cs.refCode.toUpperCase(), cs);
  }

  const hotRefs = [...velocityMap.values()]
    .filter((v) => v.classification === "caliente")
    .sort((a, b) => (b.dailyVelocity ?? 0) - (a.dailyVelocity ?? 0))
    .slice(0, 3);

  return hotRefs
    .map((v) => {
      const coverage = coverageByRef.get(v.refCode.toUpperCase());
      if (!coverage) return null;
      // Only signal if coverage is not high
      if (coverage.status === "cobertura_alta") return null;

      return makeSignal(
        "referencia_caliente",
        coverage.status === "ruptura_inminente" || coverage.status === "sin_stock"
          ? "critical"
          : "warning",
        `${v.refCode} caliente · ${Math.round((v.dailyVelocity ?? 0) * 10) / 10}u/día`,
        `${v.description} tiene alta rotación (${v.units30d ?? "?"} unidades en 30d). ` +
          `Cobertura actual: ${coverage.coverageDays !== null ? Math.round(coverage.coverageDays) + "d" : "desconocida"}. ` +
          `Priorizar reposición.`,
        {
          refCode: v.refCode,
          line: v.line,
          dailyVelocity: v.dailyVelocity,
          units30d: v.units30d,
          coverageDays: coverage.coverageDays,
          coverageStatus: coverage.status,
        },
        { refCode: v.refCode, line: v.line as CommercialCaseLine },
      );
    })
    .filter((s): s is CopilotSignal => s !== null);
}

/**
 * SIGNAL 6 — referencia_muerta
 * Dead stock ref with high disponible.
 */
export function generateReferenciaMuerta(
  deadStockSignals: DeadStockSignal[],
): CopilotSignal[] {
  return deadStockSignals
    .filter((d) => d.commercialRisk >= 60)
    .slice(0, 3)
    .map((d) =>
      makeSignal(
        "referencia_muerta",
        d.commercialRisk >= 80 ? "warning" : "info",
        `${d.refCode} sin movimiento · ${d.disponible}u disponible`,
        `${d.description} ocupa espacio comercial sin rotar. ` +
          (d.reason === "sin_ventas_30d"
            ? "Sin ventas en 30 días."
            : d.reason === "cobertura_excesiva"
              ? `Cobertura excesiva — stock para más de 90 días.`
              : "Sin rotación conocida.") +
          ` Sugerencia: ${d.disposalSuggestion}.`,
        {
          refCode: d.refCode,
          line: d.line,
          disponible: d.disponible,
          reason: d.reason,
          disposalSuggestion: d.disposalSuggestion,
          commercialRisk: d.commercialRisk,
        },
        { refCode: d.refCode, line: d.line as CommercialCaseLine },
      ),
    );
}

/**
 * SIGNAL 7 — dependencia_alta_reposicion
 * Fired when > 40% of all refs need replenishment decisions.
 */
export function generateDependenciaReposicion(
  profiles: SalesRepOperationalProfile[],
): CopilotSignal[] {
  const highDep = profiles.filter((p) => p.dependenciaReposicion >= 40);
  if (highDep.length === 0) return [];

  const avgDep = Math.round(
    highDep.reduce((a, p) => a + p.dependenciaReposicion, 0) / highDep.length,
  );

  return [
    makeSignal(
      "dependencia_alta_reposicion",
      avgDep >= 60 ? "warning" : "info",
      `${highDep.length} vendedor${highDep.length > 1 ? "es" : ""} con alta dependencia de reposición`,
      `${highDep.map((p) => p.salesRepName).join(", ")} tienen en promedio ${avgDep}% de sus referencias ` +
        `listas para reponer. Coordinar logística de reposición esta semana.`,
      {
        vendorCount: highDep.length,
        avgDependency: avgDep,
        vendors: highDep.map((p) => p.salesRepId).join(","),
      },
    ),
  ];
}

// ─── PD demand signal generators (AGENTIK-SAG-PD-DEMAND-LAYER-01) ─────────────

/**
 * SIGNAL 8 — pedidos_sin_cobertura
 * Fired when pending PD orders exist for refs with no stock or imminent rupture.
 * These are the most commercially urgent: ordered but cannot fulfill.
 */
export function generatePedidosSinCobertura(
  coverageSignals: CoverageSignal[],
  pendingOrdersMap: Map<string, number>,
): CopilotSignal[] {
  return coverageSignals
    .filter((cs) => {
      const pending = pendingOrdersMap.get(cs.refCode.toUpperCase()) ?? 0;
      return (
        pending > 0 &&
        (cs.status === "sin_stock" || cs.status === "ruptura_inminente")
      );
    })
    .sort((a, b) => {
      const pa = pendingOrdersMap.get(a.refCode.toUpperCase()) ?? 0;
      const pb = pendingOrdersMap.get(b.refCode.toUpperCase()) ?? 0;
      return pb - pa;
    })
    .slice(0, 5)
    .map((cs) => {
      const pending = pendingOrdersMap.get(cs.refCode.toUpperCase()) ?? 0;
      const days = cs.coverageDays !== null ? `${Math.round(cs.coverageDays)}d cobertura` : "sin stock";
      return makeSignal(
        "pedidos_sin_cobertura",
        "critical",
        `${cs.refCode} · ${pending} pedidos sin stock`,
        `Hay ${pending} unidades en pedidos (PD) para ${cs.description} pero el disponible es ${cs.disponible}u (${days}). ` +
          `Producir o reponer antes de confirmar los pedidos.`,
        {
          refCode:      cs.refCode,
          line:         cs.line,
          pendingQty:   pending,
          disponible:   cs.disponible,
          coverageDays: cs.coverageDays,
          status:       cs.status,
        },
        { refCode: cs.refCode, line: cs.line as CommercialCaseLine },
      );
    });
}

/**
 * SIGNAL 9 — linea_caliente_pedidos
 * Fired when a commercial line has 3+ refs with pending PD orders + low/no coverage.
 * Indicates systemic production pressure on a line.
 */
export function generateLineaCalientePedidos(
  coverageSignals: CoverageSignal[],
  pendingOrdersMap: Map<string, number>,
  threshold = 3,
): CopilotSignal[] {
  const byLine = new Map<string, { count: number; totalPending: number }>();

  for (const cs of coverageSignals) {
    const pending = pendingOrdersMap.get(cs.refCode.toUpperCase()) ?? 0;
    if (pending <= 0) continue;

    const isCritical =
      cs.status === "sin_stock" ||
      cs.status === "ruptura_inminente" ||
      cs.status === "cobertura_baja";
    if (!isCritical) continue;

    const entry = byLine.get(cs.line) ?? { count: 0, totalPending: 0 };
    entry.count++;
    entry.totalPending += pending;
    byLine.set(cs.line, entry);
  }

  const signals: CopilotSignal[] = [];
  for (const [line, { count, totalPending }] of byLine) {
    if (count < threshold) continue;
    signals.push(
      makeSignal(
        "linea_caliente_pedidos",
        count >= 5 ? "critical" : "warning",
        `Línea ${line} · ${count} refs con pedidos y cobertura baja`,
        `${count} referencias de línea ${line} tienen pedidos pendientes (${totalPending} unidades totales) ` +
          `pero cobertura insuficiente. Requiere plan de producción urgente para esta línea.`,
        { line, pressuredRefCount: count, totalPendingQty: totalPending },
        { line: line as CommercialCaseLine },
      ),
    );
  }

  return signals;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildCopilotSignals(
  coverageSignals: CoverageSignal[],
  productionSignals: ProductionSignal[],
  deadStockSignals: DeadStockSignal[],
  profiles: SalesRepOperationalProfile[],
  velocityMap: Map<string, RefVelocity>,
  pendingOrdersMap?: Map<string, number>,
): CopilotSignal[] {
  const pdMap = pendingOrdersMap ?? new Map<string, number>();

  const signals: CopilotSignal[] = [
    ...generateCoberturasCriticas(coverageSignals, velocityMap),
    ...generateLineaAgotandose(coverageSignals),
    ...generateVendedorEnRiesgo(profiles),
    ...generateProduccionInsuficiente(productionSignals),
    ...generateReferenciaCaliente(velocityMap, coverageSignals),
    ...generateReferenciaMuerta(deadStockSignals),
    ...generateDependenciaReposicion(profiles),
    ...(pdMap.size > 0 ? generatePedidosSinCobertura(coverageSignals, pdMap) : []),
    ...(pdMap.size > 0 ? generateLineaCalientePedidos(coverageSignals, pdMap) : []),
  ];

  // Sort: critical first, then warning, then info; within same severity by generatedAt (natural order)
  const severityOrder: Record<CopilotSignalSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
