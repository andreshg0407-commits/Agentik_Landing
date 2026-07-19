/**
 * lib/agents/runtime/agent-runtime-result.ts
 *
 * Agentik — Agent Runtime Result
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * The complete output of one agent runtime run.
 * Pure domain. No Prisma. No React. No Next.
 */

import type { AgentId, AgentRunId, AgentRuntimeStatus, AgentRuntimeActionType, AgentRuntimeAuditEvent } from "./agent-runtime-types";
import type { DecisionEngineResult } from "../../decisions/decision-result";

// ── Proposed action ───────────────────────────────────────────────────────────

export interface ProposedAction {
  id:                      string;
  type:                    AgentRuntimeActionType;
  label:                   string;
  description:             string;
  targetDomain:            string;
  targetModule:            string;
  requiresApproval:        boolean;
  sourceRecommendationId:  string;
  payload:                 Record<string, unknown>;
  navigationTarget?:       string;
  confidence:              "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  score:                   number;
  metadata?:               Record<string, unknown>;
}

// ── Runtime result ────────────────────────────────────────────────────────────

export interface AgentRuntimeResult {
  /** True if the runtime completed without fatal errors. */
  success:         boolean;
  message:         string;
  runId:           AgentRunId;
  agentId:         AgentId;
  /** Domain the agent operates in: "FINANCE", "MARKETING", etc. */
  agentDomain:     string;
  /** Runtime mode used for this run. */
  agentMode:       string;
  status:          AgentRuntimeStatus;
  /** The underlying Decision Engine result (if executed). */
  decisionResult?: DecisionEngineResult;
  /** Proposed actions filtered and ordered by score, ready for user review. */
  proposedActions: ProposedAction[];
  recommendationCount?: number;
  auditTrail:      AgentRuntimeAuditEvent[];
  errors:          string[];
  warnings:        string[];
  completedAt?:    string;
  metadata?:       Record<string, unknown>;
}
