/**
 * lib/agent-runtime/action-tool-mapper.ts
 *
 * Agentik Runtime Tool Execution Kernel — Action → Tool Mapping
 *
 * Resolves which tool ID should execute for a given action type.
 * V1: Static mapping — deterministic, no LLM.
 *
 * Sprint: AGENTIK-AGENT-TOOL-EXECUTION-KERNEL-01
 */

import type { ActionEnvelope } from "./action-envelope";

// ── V1 static mapping ─────────────────────────────────────────────────────────
// actionType → toolId
// Tools marked (no_handler) have no registered handler in V1.
// Calling execute() on them will fail with GUARD_DENIED / HANDLER_NOT_FOUND.

const ACTION_TOOL_MAP: Record<string, string> = {
  // Commercial — David
  "create_production_request":          "commercial.createProductionRequestDraft",

  // Commercial — David (no_handler in V1)
  "mark_reference_paused":              "commercial.markReferenceAsPaused",
  "trigger_replenishment_alert":        "commercial.triggerReplenishmentAlert",

  // Collections — Mila (no_handler in V1)
  "create_collection_action":           "collections.createFollowupAction",
  "escalate_collection":                "collections.escalateToManager",

  // Finance — Diego (no_handler in V1)
  "reconcile_payment_candidate":        "finance.reconcilePaymentCandidate",
  "create_collection_followup":         "finance.createCollectionAction",

  // Marketing — Luca (no_handler in V1)
  "create_campaign_task":               "marketing.createCreativeTask",
  "generate_campaign_brief":            "marketing.generateCampaignBrief",
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolves the tool ID for a given action envelope.
 * Returns null if no mapping exists.
 */
export function resolveToolForAction(envelope: ActionEnvelope): string | null {
  // Try direct type match
  const direct = ACTION_TOOL_MAP[envelope.type];
  if (direct) return direct;

  // Try from payloadSummary.toolId (agent can suggest a specific tool)
  const suggested = envelope.payloadSummary?.toolId;
  if (typeof suggested === "string" && suggested) return suggested;

  return null;
}

/**
 * Returns true if the action type has a known tool mapping.
 */
export function hasToolMapping(actionType: string): boolean {
  return actionType in ACTION_TOOL_MAP;
}

/**
 * Returns all registered action type → tool ID mappings.
 */
export function getActionToolMappings(): Record<string, string> {
  return { ...ACTION_TOOL_MAP };
}
