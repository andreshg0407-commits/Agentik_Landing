/**
 * lib/copilot/signal-rules/financial-close-blocked.ts
 *
 * RULE 3: financial_close.blocked
 *
 * Fires when critical reconciliation exceptions have been open for more than
 * 7 days, suggesting that financial close for the current period is at risk.
 *
 * Rationale: Critical exceptions older than 7 days that remain unresolved are
 * a strong indicator that the reconciliation cycle is stuck and close cannot
 * proceed cleanly.
 *
 * Data source:
 *   - ReconciliationException: severity="critical", status="open"|"under_review",
 *     createdAt older than BLOCK_THRESHOLD_DAYS
 *
 * Signal conditions:
 *   - count ≥ 1, oldest ≥ 14 days → critica
 *   - count ≥ 1, oldest ≥  7 days → elevada
 *   - Otherwise: no signal
 *
 * V1 scope: org-level. No session/run scoping — checks all open critical exceptions.
 */

import { prisma }            from "@/lib/prisma";
import { computeConfidence } from "@/lib/copilot/confidence-engine";
import { buildExplicacion }  from "@/lib/copilot/explainability";
import type { CopilotSignal, FinancialCloseBlockedEvidence, SignalSeverity } from "@/lib/copilot/types";

const BLOCK_THRESHOLD_DAYS = 7;  // exceptions older than this block close
const CRITICA_DAYS         = 14; // older than this → critical

export async function evaluateFinancialCloseBlocked(
  orgId: string,
  orgSlug: string,
): Promise<CopilotSignal | null> {
  const now        = new Date();
  const cutoffDate = new Date(now.getTime() - BLOCK_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  // ── Fetch open critical exceptions older than threshold ──────────────────────
  const exceptions = await prisma.reconciliationException.findMany({
    where: {
      organizationId: orgId,
      severity:       "critical",
      status:         { in: ["open", "under_review"] },
      createdAt:      { lt: cutoffDate },
    },
    select: {
      createdAt: true,
      delta:     true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (exceptions.length === 0) return null;

  // ── Compute summary ──────────────────────────────────────────────────────────
  const oldestException    = exceptions[0];
  const oldestExceptionDays = Math.floor(
    (Date.now() - oldestException.createdAt.getTime()) / (24 * 60 * 60 * 1000),
  );
  const totalDeltaBlocked  = exceptions.reduce(
    (sum, ex) => sum + Math.abs(ex.delta ?? 0),
    0,
  );

  // ── Signal severity ──────────────────────────────────────────────────────────
  let severity: SignalSeverity;
  if (oldestExceptionDays >= CRITICA_DAYS) {
    severity = "critica";
  } else {
    severity = "elevada";
  }

  // ── Confidence ───────────────────────────────────────────────────────────────
  const confidence = computeConfidence({
    sources:        [true],                // ReconciliationException is real Prisma data
    dataAgeMinutes: 30,                    // Live query — effectively fresh
    requiredFields: ["criticalExceptionsCount", "oldestExceptionDays"],
    missingFields:  totalDeltaBlocked === 0 ? ["totalDeltaBlocked"] : [],
  });

  const evidence: FinancialCloseBlockedEvidence = {
    type:                    "financial_close_blocked",
    criticalExceptionsCount: exceptions.length,
    oldestExceptionDays,
    totalDeltaBlocked,
    currency:                "COP",
  };

  const signal: CopilotSignal = {
    id:           crypto.randomUUID(),
    ruleId:       "financial_close.blocked",
    orgId,
    severity,
    lifecycle:    "visible",
    targetModule: "cierre",
    titulo:       `Cierre bloqueado — ${exceptions.length} excepción(es) crítica(s) sin resolver`,
    descripcion:  `Hay ${exceptions.length} excepción(es) crítica(s) de conciliación con ${oldestExceptionDays} días sin resolución. El cierre del período no puede completarse hasta que se resuelvan.`,
    accion:       "Resolver bloqueo de cierre",
    targetPath:   `/${orgSlug}/finanzas/conciliacion`,
    confidence,
    evidence,
    explicacion:  buildExplicacion("financial_close.blocked", evidence),
    detectedAt:   now,
  };

  return signal;
}
