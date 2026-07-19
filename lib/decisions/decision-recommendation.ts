/**
 * lib/decisions/decision-recommendation.ts
 *
 * Agentik — Decision Recommendation
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * A DecisionRecommendation is the engine's output for a single
 * (signal, rule) pair. It is fully serializable — no functions.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type {
  DecisionRecommendationId,
  DecisionRunId,
  DecisionSignalId,
  DecisionRuleId,
  DecisionDomain,
  DecisionSeverity,
  DecisionConfidence,
  DecisionActionType,
} from "./decision-types";

// ── Recommendation ────────────────────────────────────────────────────────────

export interface DecisionRecommendation {
  id:             DecisionRecommendationId;
  decisionRunId:  DecisionRunId;
  signalId:       DecisionSignalId;
  ruleId:         DecisionRuleId;
  domain:         DecisionDomain;
  title:          string;
  description:    string;
  actionType:     DecisionActionType;
  severity:       DecisionSeverity;
  confidence:     DecisionConfidence;
  score:          number;
  scoreBreakdown: {
    severityWeight:       number;
    confidenceWeight:     number;
    urgencyWeight:        number;
    businessImpactWeight: number;
    duplicationPenalty:   number;
  };
  reasoning:            string;
  businessImpact?:      string;
  recommendedNextStep?: string;
  requiresApproval:     boolean;
  canAutoExecute:       boolean;
  /** Deep-link route for the agent or user to navigate to. */
  navigationTarget?:    string;
  relatedEntity?: {
    type:   string;
    id:     string;
    label?: string;
  };
  /** Suggested payload for the action (e.g. task title, workflow ID). */
  suggestedPayload?: Record<string, unknown>;
  metadata?:         Record<string, unknown>;
  generatedAt:       string;
}
