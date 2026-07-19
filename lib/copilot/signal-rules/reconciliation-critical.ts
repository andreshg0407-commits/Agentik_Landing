/**
 * lib/copilot/signal-rules/reconciliation-critical.ts
 *
 * RULE 4: reconciliation.pending_critical
 *
 * Fires whenever there are open critical severity reconciliation exceptions —
 * regardless of age.  This is a real-time signal: any critical open exception
 * is actionable immediately.
 *
 * Data source:
 *   - ReconciliationException: severity="critical", status="open"
 *
 * Signal conditions:
 *   - openCriticalCount ≥ 5  → critica
 *   - openCriticalCount ≥ 2  → elevada
 *   - openCriticalCount = 1  → vigilancia
 *   - count = 0: no signal
 *
 * V1 scope: org-level aggregate across all reconciliation sessions.
 */

import { prisma }            from "@/lib/prisma";
import { computeConfidence } from "@/lib/copilot/confidence-engine";
import { buildExplicacion }  from "@/lib/copilot/explainability";
import type { CopilotSignal, ReconciliationCriticalEvidence, SignalSeverity } from "@/lib/copilot/types";

export async function evaluateReconciliationCritical(
  orgId: string,
  orgSlug: string,
): Promise<CopilotSignal | null> {
  const now = new Date();

  // ── Fetch open critical exceptions ───────────────────────────────────────────
  const exceptions = await prisma.reconciliationException.findMany({
    where: {
      organizationId: orgId,
      severity:       "critical",
      status:         "open",
    },
    select: {
      createdAt: true,
      delta:     true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (exceptions.length === 0) return null;

  // ── Compute summary ──────────────────────────────────────────────────────────
  const oldestException  = exceptions[0];
  const oldestAgeHours   = Math.floor(
    (Date.now() - oldestException.createdAt.getTime()) / (60 * 60 * 1000),
  );
  const totalDelta       = exceptions.reduce(
    (sum, ex) => sum + Math.abs(ex.delta ?? 0),
    0,
  );
  const count            = exceptions.length;

  // ── Severity ─────────────────────────────────────────────────────────────────
  let severity: SignalSeverity;
  if (count >= 5) {
    severity = "critica";
  } else if (count >= 2) {
    severity = "elevada";
  } else {
    severity = "vigilancia";
  }

  // ── Confidence ───────────────────────────────────────────────────────────────
  const confidence = computeConfidence({
    sources:        [true],   // ReconciliationException is real live Prisma data
    dataAgeMinutes: 15,       // Live query
    requiredFields: ["openCriticalCount", "totalDelta"],
    missingFields:  totalDelta === 0 ? ["totalDelta"] : [],
  });

  const evidence: ReconciliationCriticalEvidence = {
    type:              "reconciliation_critical",
    openCriticalCount: count,
    totalDelta,
    oldestAgeHours,
    currency:          "COP",
  };

  const signal: CopilotSignal = {
    id:           crypto.randomUUID(),
    ruleId:       "reconciliation.pending_critical",
    orgId,
    severity,
    lifecycle:    "visible",
    targetModule: "conciliacion",
    titulo:       `${count} excepción(es) crítica(s) abiertas en conciliación`,
    descripcion:  `Existen ${count} excepción(es) crítica(s) de conciliación sin resolver con una diferencia acumulada de $${new Intl.NumberFormat("es-CO").format(totalDelta)} COP.`,
    accion:       "Resolver excepciones",
    targetPath:   `/${orgSlug}/finanzas/conciliacion`,
    confidence,
    evidence,
    explicacion:  buildExplicacion("reconciliation.pending_critical", evidence),
    detectedAt:   now,
  };

  return signal;
}
