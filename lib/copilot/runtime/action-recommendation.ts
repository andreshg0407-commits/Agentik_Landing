/**
 * lib/copilot/runtime/action-recommendation.ts
 *
 * Agentik Copilot Runtime — Action Recommendation
 * Sprint: AGENTIK-COPILOT-CONTEXT-BRIDGE-01
 *
 * Converts a CopilotRuntimeContext + discovered capabilities into
 * a ranked list of recommended actions the agent can suggest.
 *
 * Recommendation algorithm:
 *   1. Start from lead agent's declared actions
 *   2. Score by: capability prerequisites met + domain relevance + risk level
 *   3. Filter by: user permissions + blocked actions
 *   4. Group into: immediate / contextual / destructive
 *
 * No DB calls. No I/O. Pure computation.
 */

import type { ActionId } from "../knowledge/action-registry";
import type { CapabilityId } from "../knowledge/capability-registry";
import {
  ACTION_REGISTRY,
  getAllActions,
  type ActionDefinition,
  type ActionRisk,
} from "../knowledge/action-registry";
import type { CopilotRuntimeContext } from "./context-builder";
import type { CapabilityDiscoveryResult } from "./capability-discovery";

// ── Recommendation result ───────────────────────────────────────────────────

export interface ActionRecommendationResult {
  /** High-priority, safe, immediately usable actions */
  immediate:    RecommendedAction[];
  /** Relevant actions requiring more context or confirmation */
  contextual:   RecommendedAction[];
  /** Destructive or high-risk actions (shown with warning) */
  destructive:  RecommendedAction[];
  /** All recommended actions, ranked */
  all:          RecommendedAction[];
}

export interface RecommendedAction {
  action:              ActionDefinition;
  score:               number;
  prerequisitesMet:    boolean;
  missingCapabilities: CapabilityId[];
  reason:              string;
}

// ── Recommendation engine ────────────────────────────────────────────────────

/**
 * Produces action recommendations from the runtime context.
 *
 * Scoring:
 *   +4  all required capabilities are available
 *   +2  action is declared by lead agent
 *   +1  action is declared by a supporting agent
 *   -1  riskLevel = "medium"
 *   -3  riskLevel = "high"
 *   -5  riskLevel = "critical"
 *
 * Actions with no available capabilities AND no agent declaration are excluded.
 */
export function recommendActions(
  ctx: CopilotRuntimeContext,
  capabilityResult?: CapabilityDiscoveryResult,
): ActionRecommendationResult {
  if (!ctx.user.permissions.canExecuteActions) {
    return { immediate: [], contextual: [], destructive: [], all: [] };
  }

  const availableCapSet = new Set(ctx.availableCapabilities);
  const blockedSet      = new Set(ctx.user.permissions.blockedActions);
  const leadActionSet   = new Set(ctx.leadAgent?.actions ?? []);
  const supportActionSet = new Set(
    ctx.supportingAgents.flatMap(a => a.actions)
  );

  const allActions = getAllActions();
  const recommendations: RecommendedAction[] = [];

  for (const action of allActions) {
    // Skip user-blocked actions
    if (blockedSet.has(action.id)) continue;

    // Must be declared by some agent OR have at least one matching capability
    const isLeadAction    = leadActionSet.has(action.id);
    const isSupportAction = supportActionSet.has(action.id);

    // Check required capabilities
    const missingCapabilities = action.requiredCapabilities.filter(
      c => !availableCapSet.has(c)
    );
    const prerequisitesMet = missingCapabilities.length === 0;

    // Exclude actions with no agent claim and no prerequisites met
    if (!isLeadAction && !isSupportAction && !prerequisitesMet) continue;

    // Score
    let score = 0;

    if (prerequisitesMet)  score += 4;
    if (isLeadAction)      score += 2;
    if (isSupportAction)   score += 1;

    const riskPenalty: Record<ActionRisk, number> = {
      low:    0,
      medium: -1,
      high:   -3,
    };
    score += riskPenalty[action.riskLevel];

    // Build reason string
    const reason = buildReason(action, prerequisitesMet, isLeadAction, isSupportAction);

    recommendations.push({
      action,
      score,
      prerequisitesMet,
      missingCapabilities,
      reason,
    });
  }

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  // Partition into groups
  const immediate:   RecommendedAction[] = [];
  const contextual:  RecommendedAction[] = [];
  const destructive: RecommendedAction[] = [];

  for (const rec of recommendations) {
    if (rec.action.riskLevel === "high") {
      destructive.push(rec);
    } else if (rec.prerequisitesMet && rec.score >= 4) {
      immediate.push(rec);
    } else {
      contextual.push(rec);
    }
  }

  return { immediate, contextual, destructive, all: recommendations };
}

// ── Reason builder ────────────────────────────────────────────────────────────

function buildReason(
  action:           ActionDefinition,
  prerequisitesMet: boolean,
  isLeadAction:     boolean,
  isSupportAction:  boolean,
): string {
  if (isLeadAction && prerequisitesMet) {
    return `Acción principal disponible: ${action.name}`;
  }
  if (isLeadAction && !prerequisitesMet) {
    return `Acción del agente principal — requiere capacidades adicionales`;
  }
  if (isSupportAction && prerequisitesMet) {
    return `Acción de agente de soporte disponible: ${action.name}`;
  }
  if (prerequisitesMet) {
    return `Acción disponible por capacidades activas: ${action.name}`;
  }
  return `Acción identificada — capacidades incompletas`;
}

// ── Targeted queries ─────────────────────────────────────────────────────────

/**
 * Returns only the action IDs available to the user, ranked.
 */
export function getAvailableActionIds(ctx: CopilotRuntimeContext): ActionId[] {
  return recommendActions(ctx).all
    .filter(r => r.prerequisitesMet)
    .map(r => r.action.id);
}

/**
 * Returns true if a specific action is recommended and executable.
 */
export function isActionRecommended(
  ctx: CopilotRuntimeContext,
  actionId: ActionId,
): boolean {
  return recommendActions(ctx).all.some(
    r => r.action.id === actionId && r.prerequisitesMet
  );
}

/**
 * Returns the top N immediate actions.
 */
export function getTopImmediateActions(
  ctx: CopilotRuntimeContext,
  n: number = 3,
): RecommendedAction[] {
  return recommendActions(ctx).immediate.slice(0, n);
}
