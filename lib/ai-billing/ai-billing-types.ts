/**
 * lib/ai-billing/ai-billing-types.ts
 *
 * Agentik — AI Billing Foundation — Core Domain Types
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Pure domain. No Prisma. No React. No server-only.
 * Client-safe.
 */

// ── Branded ID types ──────────────────────────────────────────────────────────

export type AiUsageId        = string & { readonly __brand: "AiUsageId" };
export type AiCreditLedgerId = string & { readonly __brand: "AiCreditLedgerId" };

export function toAiUsageId(id: string): AiUsageId {
  return id as AiUsageId;
}
export function toAiCreditLedgerId(id: string): AiCreditLedgerId {
  return id as AiCreditLedgerId;
}

// ── Billing scope ─────────────────────────────────────────────────────────────

/**
 * The dimension along which usage is attributed.
 */
export type AiBillingScope =
  | "TENANT"
  | "MODULE"
  | "AGENT"
  | "FEATURE"
  | "WORKFLOW"
  | "COPILOT"
  | "MARKETING_STUDIO"
  | "AUTONOMOUS_OPERATION";

// ── Billing source ─────────────────────────────────────────────────────────────

/**
 * Which system layer originated the AI usage.
 */
export type AiBillingSource =
  | "AI_LAYER"
  | "AGENT_RUNTIME"
  | "COPILOT"
  | "MARKETING_STUDIO"
  | "WORKFLOW_EXECUTION"
  | "AUTONOMOUS_OPERATION"
  | "MANUAL_ADJUSTMENT"
  | "SYSTEM";

// ── Billing status ─────────────────────────────────────────────────────────────

/**
 * Lifecycle state of an AI usage record.
 *
 * RECORDED    — written at request time (may be estimated)
 * ESTIMATED   — cost is not final; based on model averages
 * RECONCILED  — cost confirmed against provider invoice
 * VOIDED      — cancelled / refunded; does not count toward balance
 * FAILED      — usage attempt failed; still counted for observability
 */
export type AiBillingStatus =
  | "RECORDED"
  | "ESTIMATED"
  | "RECONCILED"
  | "VOIDED"
  | "FAILED";

// ── Usage kind ────────────────────────────────────────────────────────────────

/**
 * The type of AI work being performed.
 * Determines pricing tier and credit cost.
 */
export type AiUsageKind =
  | "TEXT_GENERATION"
  | "JSON_REASONING"
  | "CLASSIFICATION"
  | "DOCUMENT_ANALYSIS"
  | "IMAGE_GENERATION"
  | "VIDEO_GENERATION"
  | "EMBEDDING"
  | "TRANSCRIPTION"
  | "VISION_ANALYSIS"
  | "TOOL_CALL";

// ── Cost mode ─────────────────────────────────────────────────────────────────

/**
 * Whether the cost figure is estimated, actual, or manually set.
 */
export type AiCostMode =
  | "ESTIMATED"
  | "ACTUAL"
  | "MANUAL";
