/**
 * lib/copilot/diego/diego-priority-engine.ts
 *
 * Diego CFO Copilot — Priority Engine.
 *
 * Pure rule-based prioritization. No AI. No randomness.
 * Input: DiegoSignal[] + financial state.
 * Output: DiegoPriorityItem[] sorted by operational urgency.
 *
 * Rules:
 *   1. Critical integrity issues → always first.
 *   2. Low cash confidence → blocks close and planning — always second if present.
 *   3. High severity signals → ordered by graph impact.
 *   4. Missing bank sync → medium urgency unless critical signal already covers it.
 *   5. Unresolved relations above threshold → medium urgency.
 *   6. Medium signals → remaining slots (max 2).
 *   Max output: 5 priority items.
 *
 * Sprint: AGENTIK-DIEGO-COPILOT-01
 */

import type { DiegoSignal, DiegoPriorityItem, DiegoSeverity, DiegoSignalType } from "./diego-types";

// ── Action labels per signal type ─────────────────────────────────────────────

function recommendedAction(type: DiegoSignalType | string, areas: string[]): string {
  switch (type) {
    case "integrity_issue":
      return "Revisar inconsistencias en conciliación inteligente";
    case "reconciliation_attention":
      return "Ejecutar conciliación · Cruzar cobros vs facturas";
    case "unresolved_financial_relations":
      return "Conciliar documentos huérfanos en módulo de Conciliación";
    case "bank_sync_problem":
      return "Actualizar sincronización bancaria o cargar movimientos";
    case "collection_pressure":
      return "Revisar cartera vencida · Torre de Control";
    case "close_blocker":
      return "Resolver bloqueadores antes de iniciar Cierre Financiero";
    case "confidence_warning":
      return "Conectar banco · Verificar presupuestos activos · Revisar fuentes SAG";
    case "liquidity_risk":
      return "Revisar runway de liquidez en Tesorería Operativa";
    case "treasury_alert":
      return "Verificar flujo de caja en Tesorería Operativa";
    case "operational_focus":
      return `Sincronizar fuente · verificar conexión SAG`;
    default:
      return `Revisar estado en ${areas[0] ?? "Finanzas"}`;
  }
}

// ── Main priority engine ───────────────────────────────────────────────────────

export function prioritizeDiegoSignals(
  signals:             DiegoSignal[],
  graphIssueCount:     number,
  cashConfidenceLevel: "HIGH" | "MEDIUM" | "LOW",
  unresolvedCount:     number,
  bankSyncOk:          boolean,
): DiegoPriorityItem[] {
  const items: DiegoPriorityItem[] = [];
  let priority = 1;
  const coveredTypes = new Set<string>();

  // 1. Critical signals — always first, all of them
  for (const s of signals.filter(s => s.severity === "critical")) {
    if (coveredTypes.has(s.type)) continue;
    coveredTypes.add(s.type);
    items.push({
      priority:          priority++,
      category:          s.type,
      reason:            s.title,
      severity:          "critical",
      recommendedAction: recommendedAction(s.type, s.affectedAreas),
      traceable:         s.traceable,
    });
  }

  // 2. Low cash confidence — blocks close + planning
  if (cashConfidenceLevel === "LOW" && !coveredTypes.has("confidence_warning")) {
    coveredTypes.add("confidence_warning");
    items.push({
      priority:          priority++,
      category:          "confidence_warning",
      reason:            "Trazabilidad de liquidez insuficiente · estado financiero no verificable",
      severity:          "high",
      recommendedAction: "Conectar banco · Activar presupuestos · Revisar fuentes SAG",
      traceable:         false,
    });
  }

  // 3. High severity signals
  for (const s of signals.filter(s => s.severity === "high")) {
    if (coveredTypes.has(s.type)) continue;
    coveredTypes.add(s.type);
    items.push({
      priority:          priority++,
      category:          s.type,
      reason:            s.title,
      severity:          "high",
      recommendedAction: recommendedAction(s.type, s.affectedAreas),
      traceable:         s.traceable,
    });
  }

  // 4. Missing bank sync (not already covered by critical)
  if (!bankSyncOk && !coveredTypes.has("bank_sync_problem")) {
    coveredTypes.add("bank_sync_problem");
    items.push({
      priority:          priority++,
      category:          "bank_sync_problem",
      reason:            "Liquidez calculada sin respaldo bancario en tiempo real",
      severity:          "medium",
      recommendedAction: "Integrar cuenta bancaria o cargar movimientos manualmente",
      traceable:         false,
    });
  }

  // 5. High unresolved count
  if (unresolvedCount > 15 && !coveredTypes.has("unresolved_financial_relations")) {
    coveredTypes.add("unresolved_financial_relations");
    items.push({
      priority:          priority++,
      category:          "unresolved_financial_relations",
      reason:            `${unresolvedCount} relaciones sin resolver · confianza del cierre reducida`,
      severity:          "medium",
      recommendedAction: "Ejecutar conciliación · Revisar cobros sin cruce",
      traceable:         true,
    });
  }

  // 6. Medium signals (max 2, avoid duplicates)
  for (const s of signals.filter(s => s.severity === "medium")) {
    if (items.length >= 5) break;
    if (coveredTypes.has(s.type)) continue;
    coveredTypes.add(s.type);
    items.push({
      priority:          priority++,
      category:          s.type,
      reason:            s.title,
      severity:          "medium",
      recommendedAction: recommendedAction(s.type, s.affectedAreas),
      traceable:         s.traceable,
    });
  }

  return items.slice(0, 5);
}
