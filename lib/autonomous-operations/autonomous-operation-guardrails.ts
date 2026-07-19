/**
 * lib/autonomous-operations/autonomous-operation-guardrails.ts
 *
 * Agentik — Autonomous Operations Guardrails
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Hard-coded safety rules that override any policy.
 * These guardrails can never be disabled by policy configuration.
 *
 * Pure domain. No Prisma. No React. No Next.
 * Never throws — always returns structured result.
 */

import type {
  AutonomousOperationInput,
  AutonomousOperationRiskLevel,
  AutonomousOperationDecision,
} from "./autonomous-operation-types";
import type { AutonomousOperationPolicy } from "./autonomous-operation-policy";

// ── Guardrail result ──────────────────────────────────────────────────────────

export interface GuardrailEvaluationResult {
  allowed:    boolean;
  decision:   AutonomousOperationDecision;
  riskLevel:  AutonomousOperationRiskLevel;
  errors:     string[];
  warnings:   string[];
  /** Which guardrail triggered if blocked. */
  triggeredGuardrail?: string;
}

// ── Forbidden keywords / domains for auto-execution ──────────────────────────

/**
 * Signal types that can NEVER be auto-executed in this sprint.
 * These represent real-world effects that require human sign-off.
 */
const BLOCKED_PAYLOAD_KEYWORDS = [
  "financial_transfer",
  "money_transfer",
  "bank_transfer",
  "payment_dispatch",
  "marketing_publish",
  "social_publish",
  "campaign_publish",
  "customer_message",
  "customer_email",
  "customer_sms",
  "whatsapp_send",
  "inventory_move",
  "inventory_transfer",
  "stock_adjustment",
  "purchase_order",
];

function payloadContainsForbiddenKeyword(payload: Record<string, unknown>): string | null {
  const payloadStr = JSON.stringify(payload).toLowerCase();
  for (const keyword of BLOCKED_PAYLOAD_KEYWORDS) {
    if (payloadStr.includes(keyword)) return keyword;
  }
  return null;
}

// ── Risk level calculator ─────────────────────────────────────────────────────

export function calculateRiskLevel(
  input: AutonomousOperationInput,
): AutonomousOperationRiskLevel {
  const { proposedAction } = input;
  const actionType         = proposedAction.type;
  const confidence         = proposedAction.confidence;
  const score              = proposedAction.score;

  // Workflow starts are always HIGH risk
  if (actionType === "START_WORKFLOW_DRAFT") return "HIGH";

  // Approval drafts are MEDIUM risk
  if (actionType === "CREATE_APPROVAL_DRAFT") return "MEDIUM";

  // Task drafts: risk depends on confidence and score
  if (actionType === "CREATE_TASK_DRAFT") {
    if ((confidence === "VERY_HIGH" || confidence === "HIGH") && score >= 50) return "LOW";
    if (confidence === "MEDIUM") return "MEDIUM";
    return "MEDIUM";
  }

  // Escalations are always LOW
  if (actionType === "ESCALATE_TO_USER") return "LOW";

  // NO_ACTION is always LOW
  if (actionType === "NO_ACTION") return "LOW";

  return "MEDIUM";
}

// ── Main guardrail evaluator ──────────────────────────────────────────────────

export function evaluateAutonomousGuardrails(
  input:  AutonomousOperationInput,
  policy: AutonomousOperationPolicy,
): GuardrailEvaluationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // ── 1. Basic field validation ──────────────────────────────────────────────

  if (!input.orgSlug) {
    errors.push("orgSlug is required");
    return { allowed: false, decision: "BLOCK", riskLevel: "CRITICAL", errors, warnings, triggeredGuardrail: "missing_org_slug" };
  }
  if (!input.agentId) {
    errors.push("agentId is required");
    return { allowed: false, decision: "BLOCK", riskLevel: "CRITICAL", errors, warnings, triggeredGuardrail: "missing_agent_id" };
  }
  if (!input.proposedAction) {
    errors.push("proposedAction is required");
    return { allowed: false, decision: "BLOCK", riskLevel: "CRITICAL", errors, warnings, triggeredGuardrail: "missing_proposed_action" };
  }

  // ── 2. Score validation ────────────────────────────────────────────────────

  const score = input.proposedAction.score;
  if (typeof score !== "number" || score < 0 || score > 100) {
    errors.push(`Invalid score: ${score}. Must be 0–100.`);
    return { allowed: false, decision: "BLOCK", riskLevel: "HIGH", errors, warnings, triggeredGuardrail: "invalid_score" };
  }

  // ── 3. Policy must be active ───────────────────────────────────────────────

  if (!policy.isActive) {
    errors.push(`Policy ${policy.id} is inactive`);
    return { allowed: false, decision: "BLOCK", riskLevel: "HIGH", errors, warnings, triggeredGuardrail: "inactive_policy" };
  }

  // ── 4. Calculate risk level ────────────────────────────────────────────────

  const riskLevel = calculateRiskLevel(input);

  // ── 5. CRITICAL risk — never auto-execute ─────────────────────────────────

  if (riskLevel === "CRITICAL" && policy.canAutoExecute) {
    errors.push("CRITICAL risk operations can never be auto-executed");
    return { allowed: false, decision: "REQUIRE_APPROVAL", riskLevel, errors, warnings, triggeredGuardrail: "critical_auto_execute_blocked" };
  }

  // ── 6. START_WORKFLOW_DRAFT — never auto-execute in this sprint ────────────

  if (input.proposedAction.type === "START_WORKFLOW_DRAFT" && policy.canAutoExecute) {
    errors.push("START_WORKFLOW_DRAFT cannot be auto-executed in this sprint — must go through approval");
    return { allowed: false, decision: "REQUIRE_APPROVAL", riskLevel: "HIGH", errors, warnings, triggeredGuardrail: "workflow_auto_execute_blocked" };
  }

  // ── 7. Forbidden payload keywords ─────────────────────────────────────────

  const forbiddenKeyword = payloadContainsForbiddenKeyword(input.proposedAction.payload ?? {});
  if (forbiddenKeyword) {
    errors.push(`Operation payload contains forbidden keyword "${forbiddenKeyword}" — auto-execution blocked`);
    return {
      allowed:              false,
      decision:             "REQUIRE_APPROVAL",
      riskLevel:            "HIGH",
      errors,
      warnings,
      triggeredGuardrail:   `forbidden_keyword:${forbiddenKeyword}`,
    };
  }

  // ── 8. Financial transfer guard ────────────────────────────────────────────

  const signalType = (input.proposedAction.payload?.signalType as string | undefined) ?? "";
  if (
    signalType.includes("transfer") ||
    signalType.includes("payment") ||
    signalType.includes("disbursement")
  ) {
    if (policy.canAutoExecute) {
      warnings.push(`Signal type "${signalType}" looks financial — auto-execution blocked as precaution`);
      return {
        allowed:             false,
        decision:            "REQUIRE_APPROVAL",
        riskLevel:           "HIGH",
        errors,
        warnings,
        triggeredGuardrail:  "financial_signal_auto_execute_blocked",
      };
    }
  }

  // ── 9. Runtime mode check ──────────────────────────────────────────────────

  if (input.runtimeMode === "PREVIEW" && policy.canAutoExecute) {
    errors.push("PREVIEW mode cannot auto-execute any operation");
    return { allowed: false, decision: "NO_ACTION", riskLevel, errors, warnings, triggeredGuardrail: "preview_mode_blocked" };
  }

  if (input.runtimeMode === "AUTONOMOUS_DISABLED" && policy.canAutoExecute) {
    errors.push("AUTONOMOUS_DISABLED mode cannot auto-execute operations");
    return { allowed: false, decision: "ESCALATE_TO_USER", riskLevel, errors, warnings, triggeredGuardrail: "autonomous_disabled_blocked" };
  }

  // ── All guardrails passed ──────────────────────────────────────────────────

  return {
    allowed:   true,
    decision:  policy.decision,
    riskLevel,
    errors:    [],
    warnings,
  };
}
