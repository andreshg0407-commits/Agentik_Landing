/**
 * lib/copilot/david/david-signal-engine.ts
 *
 * David Commercial Copilot — Signal Engine.
 *
 * Reads the Maletas operational context and converts it to typed DavidSignals.
 * Signals map to real operational states from the reference-decision-engine.
 *
 * Source: buildMaletasRuntime() + buildReferenceDecisions()
 * No invented signals. No fake thresholds. All data comes from the engine.
 *
 * Sprint: AGENTIK-AGENT-DAVID-COMMERCIAL-TOOLS-01
 */

import type { DavidSignal, DavidSeverity } from "./david-types";
import type { MaletasOperationalContext }  from "@/lib/comercial/maletas/maletas-types";
import type { ReferenceDecisionSummary }   from "@/lib/comercial/maletas/reference-decision-engine";

let _sigSeq = 0;
function sigId() { return `david_${Date.now()}_${++_sigSeq}`; }

// ── Signal builders ───────────────────────────────────────────────────────────

function buildCoverageCriticalSignal(
  agotadoCount:  number,
  producirCount: number,
): DavidSignal | null {
  const total = agotadoCount + producirCount;
  if (total === 0) return null;

  const severity: DavidSeverity = agotadoCount > 0 ? "critical" : "high";

  const parts: string[] = [];
  if (agotadoCount > 0) parts.push(`${agotadoCount} agotada${agotadoCount > 1 ? "s" : ""}`);
  if (producirCount > 0) parts.push(`${producirCount} con producción urgente`);

  return {
    id:          sigId(),
    type:        "coverage_critical",
    severity,
    title:       `${total} referencia${total > 1 ? "s" : ""} en estado crítico`,
    body:        parts.join(" · ") + ". Atención inmediata requerida.",
    source:      "reference-decision-engine",
    generatedAt: new Date(),
  };
}

function buildProductionUrgentSignal(
  states: ReferenceDecisionSummary["states"],
): DavidSignal | null {
  const urgent = states.filter(s => s.opState === "producir_urgente");
  if (urgent.length === 0) return null;

  const topRef   = urgent[0]!;
  const moreText = urgent.length > 1 ? ` (+${urgent.length - 1} más)` : "";

  return {
    id:          sigId(),
    type:        "production_urgent",
    severity:    "high",
    title:       `Producción urgente — ${topRef.reference}${moreText}`,
    body:        `${topRef.reference}: disponible ${topRef.disponible} / min ${topRef.minRequired}. Sugerido: ${topRef.suggestedProductionQty} uds.`,
    reference:   topRef.reference,
    source:      "reference-decision-engine",
    generatedAt: new Date(),
  };
}

function buildPdPressureSignal(
  states: ReferenceDecisionSummary["states"],
): DavidSignal | null {
  const highPd = states.filter(s => s.pdPressureRatio > 0.6);
  if (highPd.length === 0) return null;

  const topRef = highPd.sort((a, b) => b.pdPressureRatio - a.pdPressureRatio)[0]!;
  const pctStr = Math.round(topRef.pdPressureRatio * 100);

  return {
    id:          sigId(),
    type:        "pd_pressure_high",
    severity:    topRef.pdPressureRatio > 0.8 ? "high" : "medium",
    title:       `Presión PD elevada — ${highPd.length} ref${highPd.length > 1 ? "s" : ""}`,
    body:        `${topRef.reference}: ${pctStr}% del inventario en pedidos pendientes (PD).`,
    reference:   topRef.reference,
    source:      "reference-decision-engine",
    generatedAt: new Date(),
  };
}

function buildVendorDepletionSignal(
  states: ReferenceDecisionSummary["states"],
): DavidSignal | null {
  const depleted = states.filter(s => s.depletedRepCount > 0 && s.disponible > 0);
  if (depleted.length === 0) return null;

  const totalDepleted = depleted.reduce((sum, s) => sum + s.depletedRepCount, 0);

  return {
    id:          sigId(),
    type:        "vendor_depletion",
    severity:    "medium",
    title:       `${depleted.length} ref${depleted.length > 1 ? "s" : ""} con maletas agotadas`,
    body:        `${totalDepleted} maleta${totalDepleted > 1 ? "s" : ""} vacía${totalDepleted > 1 ? "s" : ""} en ${depleted.length} referencia${depleted.length > 1 ? "s" : ""}. Stock disponible para reposición.`,
    source:      "reference-decision-engine",
    generatedAt: new Date(),
  };
}

function buildCoverageLowSignal(
  bajoMinCount: number,
): DavidSignal | null {
  if (bajoMinCount === 0) return null;

  return {
    id:          sigId(),
    type:        "coverage_low",
    severity:    "low",
    title:       `${bajoMinCount} referencia${bajoMinCount > 1 ? "s" : ""} bajo mínimo`,
    body:        `Cobertura inferior al mínimo requerido. Sin urgencia inmediata.`,
    source:      "reference-decision-engine",
    generatedAt: new Date(),
  };
}

function buildDataUnavailableSignal(): DavidSignal {
  return {
    id:          sigId(),
    type:        "data_unavailable",
    severity:    "medium",
    title:       "Fuente de inventario no disponible",
    body:        "CommercialCoverageSnapshot sin datos. Configurar sync SAG para activar David.",
    source:      "maletas-runtime",
    generatedAt: new Date(),
  };
}

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Evaluate David signals from the Maletas operational context.
 * Returns an empty array (not null) when there are no signals.
 */
export function evaluateDavidSignals(
  context: MaletasOperationalContext,
  decisions: ReferenceDecisionSummary,
): DavidSignal[] {
  const signals: DavidSignal[] = [];

  const { agotadoCount, producirCount } = decisions.stats;

  // Critical coverage
  const criticalSig = buildCoverageCriticalSignal(agotadoCount, producirCount);
  if (criticalSig) signals.push(criticalSig);

  // Urgent production refs
  const prodSig = buildProductionUrgentSignal(decisions.states);
  if (prodSig && !criticalSig) signals.push(prodSig); // don't duplicate if already in critical

  // PD pressure
  const pdSig = buildPdPressureSignal(decisions.states);
  if (pdSig) signals.push(pdSig);

  // Vendor depletion
  const vendorSig = buildVendorDepletionSignal(decisions.states);
  if (vendorSig) signals.push(vendorSig);

  // Low coverage
  const bajoMinCount = decisions.states.filter(s => s.opState === "bajo_minimo").length;
  const lowSig = buildCoverageLowSignal(bajoMinCount);
  if (lowSig) signals.push(lowSig);

  // Data unavailable (only if truly empty)
  if (context.summary.totalReferences === 0) {
    signals.push(buildDataUnavailableSignal());
  }

  return signals;
}
