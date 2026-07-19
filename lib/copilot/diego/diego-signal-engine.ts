/**
 * lib/copilot/diego/diego-signal-engine.ts
 *
 * Diego CFO Copilot — Financial Signal Engine.
 *
 * Produces DiegoSignal[] from real financial data:
 *   - Financial Graph integrity (getGraphHealthSummary)
 *   - Cash flow confidence (computeCashFlowConfidence)
 *   - Source quality (computeSourceConfidence)
 *   - Banking runtime (getBankingSnapshot)
 *
 * Rules:
 *   - NO mock data. If a source is unavailable, no signal is emitted.
 *   - If evidence is PARTIAL or STALE, signal is marked accordingly.
 *   - Signals sorted: critical → high → medium → low.
 *   - All org-scoped. Cross-tenant reads are impossible by design.
 *
 * Sprint: AGENTIK-DIEGO-COPILOT-01
 */

import { getGraphHealthSummary }                        from "@/lib/finance/graph";
import { computeSourceConfidence, computeCashFlowConfidence } from "@/lib/finance/source-confidence";
import { getBankingSnapshot }                           from "@/lib/finance/banking";
import type { DiegoSignal, DiegoSeverity, DiegoDataState, DiegoSignalType } from "./diego-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSignal(
  type:          DiegoSignalType,
  severity:      DiegoSeverity,
  title:         string,
  body:          string,
  source:        string,
  confidence:    number,
  dataState:     DiegoDataState,
  affectedAreas: string[],
): DiegoSignal {
  return {
    id:          `diego:${type}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
    type,
    severity,
    title,
    body,
    source,
    confidence,
    dataState,
    affectedAreas,
    traceable:   confidence > 0.6 && dataState !== "MISSING" && dataState !== "BROKEN",
    generatedAt: new Date(),
  };
}

const SEVERITY_ORDER: Record<DiegoSeverity, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
};

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Evaluate all Diego financial signals for an organization.
 * All signals are derived from real runtime data — nothing is invented.
 */
export async function evaluateDiegoSignals(orgId: string): Promise<DiegoSignal[]> {
  const [graphHealth, sourceConf, cashConf, bankingSnapshot] = await Promise.all([
    getGraphHealthSummary(orgId).catch(() => null),
    computeSourceConfidence(orgId).catch(() => null),
    computeCashFlowConfidence(orgId).catch(() => null),
    getBankingSnapshot(orgId).catch(() => null),
  ]);

  // Multi-tenant guard: log if all sources returned null
  if (!graphHealth && !sourceConf && !cashConf) {
    console.warn(
      `DIEGO_TENANT_ISOLATION_WARNING: No financial data available for org ${orgId} — all sources returned null`,
    );
    return [];
  }

  const signals: DiegoSignal[] = [];

  // ── Graph integrity ────────────────────────────────────────────────────────
  if (graphHealth) {
    if (graphHealth.criticalIssues > 0) {
      const n = graphHealth.criticalIssues;
      signals.push(makeSignal(
        "integrity_issue", "critical",
        `${n} inconsistencia${n > 1 ? "s" : ""} crítica${n > 1 ? "s" : ""} en el grafo financiero`,
        `${n} relación${n > 1 ? "es" : ""} crítica${n > 1 ? "s" : ""} sin resolver · ${graphHealth.unresolvedCount} nodos sin cruce · ${graphHealth.totalNodes} nodos total`,
        "FinancialGraph · integrityIssues (severity=critical)",
        0.92,
        "REAL",
        ["conciliacion", "cierre"],
      ));
    }

    if (graphHealth.warningIssues > 3) {
      const n = graphHealth.warningIssues;
      signals.push(makeSignal(
        "reconciliation_attention", "high",
        `${n} alertas de conciliación en grafo financiero`,
        `${n} relaciones con advertencias · ${graphHealth.orphanCount} documentos huérfanos · ${graphHealth.unresolvedCount} sin cruce`,
        "FinancialGraph · integrityIssues (severity=warning)",
        0.85,
        "REAL",
        ["conciliacion", "tesoreria"],
      ));
    } else if (graphHealth.warningIssues > 0) {
      signals.push(makeSignal(
        "reconciliation_attention", "medium",
        `${graphHealth.warningIssues} advertencias de conciliación activas`,
        `${graphHealth.unresolvedCount} relaciones pendientes de cruce · ${graphHealth.orphanCount} huérfanos`,
        "FinancialGraph · integrityIssues (severity=warning)",
        0.80,
        "REAL",
        ["conciliacion"],
      ));
    }

    if (graphHealth.unresolvedCount > 20 && graphHealth.criticalIssues === 0) {
      signals.push(makeSignal(
        "unresolved_financial_relations", "medium",
        `${graphHealth.unresolvedCount} relaciones financieras sin resolver`,
        `Volumen de nodos sin contrapartida identificada supera umbral operacional · ${graphHealth.orphanCount} huérfanos`,
        "FinancialGraph · unresolvedCount",
        0.80,
        "REAL",
        ["conciliacion", "cierre", "tesoreria"],
      ));
    }
  }

  // ── Cash confidence ────────────────────────────────────────────────────────
  if (cashConf) {
    if (cashConf.level === "LOW") {
      const reasons = cashConf.reasons.slice(0, 2).join(" · ");
      signals.push(makeSignal(
        "confidence_warning", "high",
        "Liquidez con trazabilidad insuficiente",
        reasons || "Banco, SAG y presupuestos insuficientes para confirmar estado de liquidez",
        "SourceConfidence · cashFlow (level=LOW)",
        Math.max(0.1, cashConf.score / 100),
        "PARTIAL",
        ["tesoreria", "planeacion", "cierre"],
      ));
    } else if (cashConf.level === "MEDIUM") {
      const reason = cashConf.reasons[0] ?? "banco o presupuestos con datos incompletos";
      signals.push(makeSignal(
        "treasury_alert", "medium",
        "Liquidez con trazabilidad parcial",
        reason,
        "SourceConfidence · cashFlow (level=MEDIUM)",
        Math.max(0.3, cashConf.score / 100),
        "PARTIAL",
        ["tesoreria", "planeacion"],
      ));
    }
  }

  // ── Banking runtime ────────────────────────────────────────────────────────
  if (bankingSnapshot) {
    const h = bankingSnapshot.health;

    if (h.level === "critical") {
      signals.push(makeSignal(
        "bank_sync_problem", "critical",
        `Estado bancario crítico · ${h.staleAccounts > 0 ? `${h.staleAccounts} cuenta${h.staleAccounts > 1 ? "s" : ""} desactualizada${h.staleAccounts > 1 ? "s" : ""}` : "sin datos"}`,
        h.label,
        "BankingRuntime · health (level=critical)",
        0.88,
        bankingSnapshot.hasRealData ? "STALE" : "MISSING",
        ["tesoreria", "conciliacion"],
      ));
    } else if (h.level === "attention") {
      signals.push(makeSignal(
        "bank_sync_problem", "medium",
        "Sincronización bancaria requiere atención",
        `${h.staleAccounts} cuenta${h.staleAccounts !== 1 ? "s" : ""} desactualizada${h.staleAccounts !== 1 ? "s" : ""} · ${h.unreconciledCount} movimientos sin conciliar`,
        "BankingRuntime · health (level=attention)",
        0.78,
        "PARTIAL",
        ["tesoreria"],
      ));
    } else if (!bankingSnapshot.hasRealData) {
      signals.push(makeSignal(
        "bank_sync_problem", "low",
        "Sin cuentas bancarias conectadas",
        "Tesorería opera sin datos bancarios en tiempo real · impacta confianza de liquidez y conciliación",
        "BankingRuntime · bankAccounts (count=0)",
        0.60,
        "MISSING",
        ["tesoreria", "conciliacion"],
      ));
    }
  } else {
    // Banking snapshot failed entirely — not just "no data"
    signals.push(makeSignal(
      "bank_sync_problem", "low",
      "Estado bancario no disponible",
      "No fue posible obtener snapshot de tesorería bancaria",
      "BankingRuntime · getBankingSnapshot (unavailable)",
      0.40,
      "MISSING",
      ["tesoreria"],
    ));
  }

  // ── Source quality ─────────────────────────────────────────────────────────
  if (sourceConf) {
    const broken = sourceConf.sources.filter(s => s.status === "BROKEN");
    const stale  = sourceConf.sources.filter(s => s.status === "STALE");

    if (broken.length > 0) {
      signals.push(makeSignal(
        "integrity_issue", "high",
        `${broken.length} fuente${broken.length > 1 ? "s" : ""} de datos con error`,
        broken.map(s => s.source).join(", ") + " — requiere diagnóstico de conexión",
        "SourceConfidence · sources (status=BROKEN)",
        0.90,
        "BROKEN",
        ["cierre", "conciliacion"],
      ));
    }

    if (stale.length > 1 && !broken.length) {
      signals.push(makeSignal(
        "operational_focus", "medium",
        `${stale.length} fuentes de datos desactualizadas`,
        stale.map(s => s.source).join(", ") + " — sincronización pendiente",
        "SourceConfidence · sources (status=STALE)",
        0.75,
        "STALE",
        ["tesoreria", "cierre"],
      ));
    }
  }

  // ── Collection pressure (graph-derived proxy) ──────────────────────────────
  if (graphHealth && graphHealth.unresolvedCount > 30 && !signals.some(s => s.type === "collection_pressure")) {
    signals.push(makeSignal(
      "collection_pressure", "medium",
      `Presión de cartera elevada · ${graphHealth.unresolvedCount} cobros sin cruzar`,
      "Volumen de cobros sin relación establecida supera umbral · revisión de Torre de Control recomendada",
      "FinancialGraph · collectionRecords (unresolved proxy)",
      0.70,
      "PARTIAL",
      ["tesoreria", "conciliacion"],
    ));
  }

  return signals.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
