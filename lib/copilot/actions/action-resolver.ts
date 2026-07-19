/**
 * lib/copilot/actions/action-resolver.ts
 *
 * Agentik Copilot — Action Resolver
 * Sprint: AGENTIK-COPILOT-ACTION-SYSTEM-01
 *
 * Pure functions that map Copilot context (drawer category, navigation target)
 * to available action definitions.
 *
 * No React. No router. No Prisma. No side effects.
 */

import type { CopilotActionDefinition, CopilotActionKind } from "./action-types";
import { ACTION_REGISTRY, getActionDefinition }             from "./action-registry";
import type { DrawerCategoryKey }                           from "@/lib/copilot/navigation/copilot-action-map";
import type { CopilotNavigationTarget }                     from "@/lib/copilot/navigation/copilot-navigation";

// ── Category → action kind map ─────────────────────────────────────────────────

const CATEGORY_ACTION_KINDS: Record<DrawerCategoryKey, CopilotActionKind[]> = {
  attention: [
    "OPEN_MODULE",
    "CREATE_TASK",
    "SCHEDULE_FOLLOWUP",
    "GENERATE_REPORT",
  ],
  activeWork: [
    "OPEN_MODULE",
    "GENERATE_REPORT",
    "CREATE_TASK",
  ],
  pendingApprovals: [
    "OPEN_MODULE",
    "REQUEST_APPROVAL",
    "SCHEDULE_FOLLOWUP",
  ],
  suggestions: [
    "OPEN_MODULE",
    "CREATE_TASK",
    "GENERATE_REPORT",
  ],
  opportunities: [
    "OPEN_MODULE",
    "CREATE_TASK",
    "GENERATE_REPORT",
    "SEND_MESSAGE",
  ],
  followups: [
    "OPEN_MODULE",
    "SCHEDULE_FOLLOWUP",
    "CREATE_TASK",
    "GENERATE_REPORT",
  ],
  recentActivity: [
    "OPEN_MODULE",
    "GENERATE_REPORT",
    "CREATE_TASK",
  ],
  insights: [
    "OPEN_MODULE",
    "GENERATE_REPORT",
    "CREATE_ALERT",
    "PREPARE_DOCUMENT",
  ],
};

// ── Navigation target → primary action kind ───────────────────────────────────

const TARGET_PRIMARY_ACTION: Partial<Record<CopilotNavigationTarget, CopilotActionKind>> = {
  CONCILIATION: "OPEN_MODULE",
  TREASURY:     "OPEN_MODULE",
  PORTFOLIO:    "OPEN_MODULE",
  CLOSING:      "GENERATE_REPORT",
  PLANNING:     "GENERATE_REPORT",
  COMMERCIAL:   "OPEN_MODULE",
  APPROVALS:    "REQUEST_APPROVAL",
  REPORTS:      "GENERATE_REPORT",
  DOCUMENTS:    "PREPARE_DOCUMENT",
};

// ── Resolver functions ────────────────────────────────────────────────────────

/**
 * Get the CopilotActionDefinition for a given kind.
 */
export function getCopilotActionDefinition(kind: CopilotActionKind): CopilotActionDefinition {
  return getActionDefinition(kind);
}

/**
 * Get all action definitions with status "available" or "requires_confirmation".
 */
export function getAvailableCopilotActions(): CopilotActionDefinition[] {
  return Object.values(ACTION_REGISTRY).filter(
    def => def.status === "available" || def.status === "requires_confirmation",
  );
}

/**
 * Get all actions appropriate for a given drawer category.
 */
export function resolveActionsForDrawerCategory(
  category: DrawerCategoryKey,
): CopilotActionDefinition[] {
  const kinds = CATEGORY_ACTION_KINDS[category] ?? ["OPEN_MODULE"];
  return kinds.map(k => ACTION_REGISTRY[k]);
}

/**
 * Get the primary action kind for a navigation target.
 * Falls back to OPEN_MODULE.
 */
export function resolveActionsForNavigationTarget(
  target: CopilotNavigationTarget,
): CopilotActionDefinition {
  const kind = TARGET_PRIMARY_ACTION[target] ?? "OPEN_MODULE";
  return ACTION_REGISTRY[kind];
}

/**
 * Given a drawer category and item count, resolve the single primary
 * action the agent should surface.
 *
 * Rules:
 *   pendingApprovals → REQUEST_APPROVAL
 *   attention (count >= 3) → CREATE_TASK
 *   everything else → OPEN_MODULE
 */
export function resolvePrimaryActionForContext(
  category: DrawerCategoryKey,
  count:     number,
): CopilotActionDefinition {
  if (category === "pendingApprovals") return ACTION_REGISTRY["REQUEST_APPROVAL"];
  if (category === "attention" && count >= 3) return ACTION_REGISTRY["CREATE_TASK"];
  return ACTION_REGISTRY["OPEN_MODULE"];
}
