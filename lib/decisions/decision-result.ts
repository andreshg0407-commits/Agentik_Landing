/**
 * lib/decisions/decision-result.ts
 *
 * Agentik — Decision Engine Result
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * The complete output of one Decision Engine run.
 * Pure domain. No Prisma. No React. No Next.
 */

import type { DecisionRecommendation } from "./decision-recommendation";
import type { DecisionAuditEvent, DecisionRunId, DecisionSignalId } from "./decision-types";

// ── Dismissed signal record ───────────────────────────────────────────────────

export interface DismissedSignal {
  signalId:    DecisionSignalId;
  reason:      string;
  dismissedAt: string;
}

// ── Engine result ─────────────────────────────────────────────────────────────

export interface DecisionEngineResult {
  /** True if the engine completed without fatal errors. */
  success:          boolean;
  message:          string;
  runId:            DecisionRunId;
  /** Ordered by score descending. */
  recommendations:  DecisionRecommendation[];
  /** Signals that were evaluated but produced no recommendations. */
  dismissedSignals: DismissedSignal[];
  auditTrail:       DecisionAuditEvent[];
  errors:           string[];
  warnings:         string[];
}
