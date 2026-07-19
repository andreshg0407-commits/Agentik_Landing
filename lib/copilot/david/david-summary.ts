/**
 * lib/copilot/david/david-summary.ts
 *
 * David Commercial Copilot — Summary Builder.
 *
 * buildDavidCommercialSummary(orgId) orchestrates:
 *   1. buildMaletasRuntime(orgId)         → operational context (coverage, PD, vendor)
 *   2. buildReferenceDecisions(...)        → per-reference operational states
 *   3. evaluateDavidSignals(...)           → typed commercial signals
 *
 * Output language rules:
 *   - Operational, enterprise, concise.
 *   - No GPT-style preamble. No greetings. No "podría".
 *   - Numbers when available. States when not.
 *
 * Confidence rules:
 *   - EMPTY data (source="empty") → David does NOT invent signals.
 *     Reports data unavailability instead.
 *
 * Sprint: AGENTIK-AGENT-DAVID-COMMERCIAL-TOOLS-01
 */

import { buildMaletasRuntime }              from "@/lib/comercial/maletas/maletas-runtime";
import { buildReferenceDecisions }           from "@/lib/comercial/maletas/reference-decision-engine";
import { getVendorRegistry }                 from "@/lib/comercial/maletas/maletas-normalizer";
import { getDefaultCoverageRules }           from "@/lib/comercial/maletas/coverage-rule-types";
import { deriveSagInventoryFromContext }     from "@/lib/comercial/maletas/sag-inventory-adapter";
import { deriveAssignmentsFromContext }      from "@/lib/comercial/maletas/case-assignment-types";
import { evaluateDavidSignals }              from "./david-signal-engine";
import type {
  DavidCommercialSummary,
  DavidCriticalRef,
  DavidProductionSuggestion,
  DavidKpis,
  DavidSeverity,
  DavidSummarySerial,
} from "./david-types";

export type { DavidCommercialSummary, DavidSummarySerial };

// ── Headline builder ──────────────────────────────────────────────────────────
//
// Deterministic: never invents. Uses real counts from the engine.

function buildHeadline(
  agotadoCount:  number,
  producirCount: number,
  totalRefs:     number,
  dataState:     DavidCommercialSummary["dataState"],
): string {
  if (dataState === "EMPTY") return "Sin datos de inventario · Configurar fuente SAG";

  const critical = agotadoCount + producirCount;

  if (agotadoCount > 0 && producirCount > 0) {
    return `${agotadoCount} referencia${agotadoCount > 1 ? "s" : ""} agotada${agotadoCount > 1 ? "s" : ""} · ${producirCount} requieren producción`;
  }
  if (agotadoCount > 0) {
    return `${agotadoCount} referencia${agotadoCount > 1 ? "s" : ""} agotada${agotadoCount > 1 ? "s" : ""} · Producción requerida`;
  }
  if (producirCount > 0) {
    return `${producirCount} referencia${producirCount > 1 ? "s" : ""} en estado producir urgente`;
  }
  if (critical === 0 && totalRefs > 0) {
    return `${totalRefs} referencias activas · Sin alertas críticas`;
  }
  return "Módulo comercial activo · Sin señales críticas";
}

function buildOperationalSummary(
  kpis: DavidKpis,
  dataState: DavidCommercialSummary["dataState"],
): string {
  if (dataState === "EMPTY") {
    return "CommercialCoverageSnapshot sin datos. Activar sincronización SAG → Prisma para habilitar inteligencia comercial.";
  }

  const parts: string[] = [];
  if (kpis.totalRefs > 0)        parts.push(`${kpis.totalRefs} referencias monitoreadas`);
  if (kpis.coverageCritical > 0) parts.push(`${kpis.coverageCritical} en estado crítico`);
  if (kpis.coverageLow > 0)      parts.push(`${kpis.coverageLow} bajo mínimo`);
  if (kpis.readyToReplenish > 0) parts.push(`${kpis.readyToReplenish} listas para reposición`);

  return parts.length > 0 ? parts.join(" · ") + "." : "Cobertura operativa nominal.";
}

function buildRecommendedFocus(
  topSuggestion: DavidProductionSuggestion | null,
  agotadoCount:  number,
  vendorDepletion: boolean,
  dataState:     DavidCommercialSummary["dataState"],
): string {
  if (dataState === "EMPTY") return "Activar fuente SAG en Configuración → Conectores";
  if (topSuggestion && agotadoCount > 0) {
    return `Gestionar producción ${topSuggestion.reference} (${topSuggestion.qty} uds)`;
  }
  if (vendorDepletion) return "Reponer maletas de vendedores con stock disponible";
  if (topSuggestion) return `Solicitar producción ${topSuggestion.reference} (${topSuggestion.qty} uds)`;
  return "Revisar cobertura mínima por referencia";
}

// ── Main builder ──────────────────────────────────────────────────────────────

export async function buildDavidCommercialSummary(
  orgId: string,
): Promise<DavidCommercialSummary> {
  // 1. Load Maletas operational context (Prisma → SaleRecord → Excel → empty)
  const runtime = await buildMaletasRuntime(orgId);
  const context = runtime.context;

  // 2. Determine data state
  const dataState: DavidCommercialSummary["dataState"] =
    runtime.source === "empty" ? "EMPTY" :
    runtime.source === "excel" ? "PARTIAL" :
    "REAL";

  // 3. Build reference decisions from the engine
  //    — uses the same inputs as the UI page (no duplicate computation)
  const salesReps   = getVendorRegistry(orgId);
  const rules       = getDefaultCoverageRules(orgId);
  const inventory   = deriveSagInventoryFromContext(context);
  const assignments = deriveAssignmentsFromContext(context);
  const decisions   = buildReferenceDecisions(
    inventory,
    rules.filter(r => r.active),
    assignments,
    salesReps,
  );

  // 4. Evaluate signals
  const signals = evaluateDavidSignals(context, decisions);

  // 5. KPIs
  const { agotadoCount, producirCount, reponerCount, riesgoPdCount } = decisions.stats;

  const topPdRef = decisions.topPdPressureReferences[0];

  const kpis: DavidKpis = {
    totalRefs:           decisions.stats.totalRefs,
    coverageCritical:    agotadoCount + producirCount,
    producirUrgente:     producirCount,
    coverageLow:         decisions.states.filter(s => s.opState === "bajo_minimo").length,
    operationalPressure: context.intelligence?.operationalPressure ?? 0,
    readyToReplenish:    reponerCount,
    topPdPressureRef:    topPdRef?.reference ?? null,
  };

  // 6. Top 3 critical refs for rail display
  const CRITICAL_STATES = new Set(["agotado", "producir_urgente", "riesgo_pd", "reponer_maletas", "bajo_minimo"]);
  const criticalRefs: DavidCriticalRef[] = decisions.states
    .filter(s => CRITICAL_STATES.has(s.opState))
    .slice(0, 3)
    .map(s => ({
      reference:    s.reference,
      description:  s.description,
      opState:      s.opState,
      disponible:   s.disponible,
      minRequired:  s.minRequired,
      suggestedQty: s.suggestedProductionQty,
      pdPending:    s.pdPending,
      line:         s.line,
    }));

  // 7. Top production suggestion
  const topForProduction = decisions.states
    .filter(s => s.suggestedProductionQty > 0 && ["agotado", "producir_urgente", "bajo_minimo"].includes(s.opState))
    .sort((a, b) => b.operationalScore - a.operationalScore)[0];

  const topProductionSuggestion: DavidProductionSuggestion | null = topForProduction
    ? {
        reference:   topForProduction.reference,
        description: topForProduction.description,
        qty:         topForProduction.suggestedProductionQty,
        reason:      `${topForProduction.opState} · disponible=${topForProduction.disponible} / min=${topForProduction.minRequired}`,
        severity:    topForProduction.opState === "agotado" ? "critical" : topForProduction.opState === "producir_urgente" ? "high" : "medium",
        line:        topForProduction.line,
      }
    : null;

  // 8. Headlines
  const vendorDepletionActive = signals.some(s => s.type === "vendor_depletion");

  const executiveHeadline = buildHeadline(agotadoCount, producirCount, decisions.stats.totalRefs, dataState);
  const operationalSummary = buildOperationalSummary(kpis, dataState);
  const recommendedFocus = buildRecommendedFocus(topProductionSuggestion, agotadoCount, vendorDepletionActive, dataState);

  return {
    orgId,
    generatedAt:              new Date(),
    executiveHeadline,
    operationalSummary,
    recommendedFocus,
    kpis,
    criticalRefs,
    topProductionSuggestion,
    signals,
    dataState,
  };
}

// ── Serializer ────────────────────────────────────────────────────────────────

export function serializeDavidSummary(
  s: DavidCommercialSummary,
): DavidSummarySerial {
  const topSig = s.signals.length > 0 ? s.signals[0]! : null;
  const severityOrder: DavidSeverity[] = ["critical", "high", "medium", "low"];
  const topSeverity = s.signals.length > 0
    ? (severityOrder.find(sev => s.signals.some(sig => sig.severity === sev)) ?? null)
    : null;

  return {
    executiveHeadline:       s.executiveHeadline,
    operationalSummary:      s.operationalSummary,
    recommendedFocus:        s.recommendedFocus,
    kpis:                    s.kpis,
    criticalRefs:            s.criticalRefs,
    topProductionSuggestion: s.topProductionSuggestion,
    signalCount:             s.signals.length,
    dataState:               s.dataState,
    topSignalSeverity:       topSeverity,
  };
}
