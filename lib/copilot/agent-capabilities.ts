/**
 * lib/copilot/agent-capabilities.ts
 *
 * Agentik Copilot — Agent Specialization Matrix
 *
 * Defines what each agent can and cannot do per module.
 * Used to:
 *   1. Drive capability hints in the rail memory section
 *   2. Guard action chips (only show actions the active agent can execute)
 *   3. Power the /agentik/agentes capability display
 *
 * Decision authority levels:
 *   - suggest_only          → Agent can generate recommendations, nothing else
 *   - suggest_and_draft     → Agent can pre-fill forms, draft documents
 *   - execute_with_approval → Agent can trigger actions that require operator confirmation
 *
 * Sprint: AGENTIK-COPILOT-SIGNAL-ENGINE-01
 */

// ── Capability types ──────────────────────────────────────────────────────────

export type CopilotAgentId = "diego" | "luca" | "mila" | "sofi";

export type AgentExpertise =
  | "finance"
  | "marketing"
  | "operations"
  | "sales"
  | "executive";

export type AgentDecisionAuthority =
  | "suggest_only"
  | "suggest_and_draft"
  | "execute_with_approval";

export interface AgentModuleCapability {
  module:                        string;      // e.g. "finanzas/tesoreria"
  expertise:                     AgentExpertise;
  canCreateTasks:                boolean;     // Can create actionable tasks from signals
  canGenerateRecommendations:    boolean;     // Can produce next-step recommendations
  canTriggerActions:             boolean;     // Can initiate module-level actions
  canSimulate:                   boolean;     // Can run what-if projections
  canExplainMetrics:             boolean;     // Can provide context for KPIs
  decisionAuthority:             AgentDecisionAuthority;
}

export interface AgentProfile {
  agentId:             CopilotAgentId;
  knowledgeDomains:    string[];       // High-level expertise areas
  riskAwareness:       boolean;        // Can the agent detect risk convergence?
  multiModuleContext:  boolean;        // Can the agent cross-reference modules?
  defaultAuthority:    AgentDecisionAuthority;
  capabilities:        AgentModuleCapability[];
}

// ── Capability registry ───────────────────────────────────────────────────────

export const AGENT_PROFILES: Record<CopilotAgentId, AgentProfile> = {

  // ── Diego — Financial Operations ────────────────────────────────────────────
  "diego": {
    agentId:            "diego",
    knowledgeDomains:   ["treasury", "reconciliation", "financial-close", "budget-execution"],
    riskAwareness:      true,
    multiModuleContext: true,
    defaultAuthority:   "suggest_and_draft",
    capabilities: [
      {
        module:                     "finanzas/tesoreria",
        expertise:                  "finance",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          true,
        canSimulate:                true,
        canExplainMetrics:          true,
        decisionAuthority:          "execute_with_approval",
      },
      {
        module:                     "finanzas/conciliacion",
        expertise:                  "finance",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          true,
        canSimulate:                false,
        canExplainMetrics:          true,
        decisionAuthority:          "execute_with_approval",
      },
      {
        module:                     "finanzas/cierre",
        expertise:                  "finance",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          false,
        canSimulate:                false,
        canExplainMetrics:          true,
        decisionAuthority:          "suggest_and_draft",
      },
      {
        module:                     "finanzas/planeacion",
        expertise:                  "finance",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          false,
        canSimulate:                true,
        canExplainMetrics:          true,
        decisionAuthority:          "suggest_and_draft",
      },
      {
        module:                     "executive",
        expertise:                  "executive",
        canCreateTasks:             false,
        canGenerateRecommendations: true,
        canTriggerActions:          false,
        canSimulate:                false,
        canExplainMetrics:          true,
        decisionAuthority:          "suggest_only",
      },
    ],
  },

  // ── Luca — Marketing & Creative ─────────────────────────────────────────────
  "luca": {
    agentId:            "luca",
    knowledgeDomains:   ["campaign-management", "content-production", "shopify-sync", "creative-briefs"],
    riskAwareness:      false,
    multiModuleContext: false,
    defaultAuthority:   "suggest_and_draft",
    capabilities: [
      {
        module:                     "agentik/marketing-studio",
        expertise:                  "marketing",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          true,
        canSimulate:                false,
        canExplainMetrics:          true,
        decisionAuthority:          "execute_with_approval",
      },
      {
        module:                     "agentik/marketing-studio/foto-estudio",
        expertise:                  "marketing",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          true,
        canSimulate:                false,
        canExplainMetrics:          false,
        decisionAuthority:          "execute_with_approval",
      },
      {
        module:                     "agentik/marketing-studio/shopify",
        expertise:                  "marketing",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          true,
        canSimulate:                false,
        canExplainMetrics:          true,
        decisionAuthority:          "execute_with_approval",
      },
    ],
  },

  // ── Mila — Sales & Customer Intelligence ────────────────────────────────────
  "mila": {
    agentId:            "mila",
    knowledgeDomains:   ["pipeline-management", "customer-risk", "collections", "deal-velocity"],
    riskAwareness:      true,
    multiModuleContext: true,
    defaultAuthority:   "suggest_and_draft",
    capabilities: [
      {
        module:                     "sales",
        expertise:                  "sales",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          false,
        canSimulate:                true,
        canExplainMetrics:          true,
        decisionAuthority:          "suggest_and_draft",
      },
      {
        module:                     "pipeline",
        expertise:                  "sales",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          false,
        canSimulate:                true,
        canExplainMetrics:          true,
        decisionAuthority:          "suggest_and_draft",
      },
      {
        module:                     "customer-360",
        expertise:                  "sales",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          false,
        canSimulate:                false,
        canExplainMetrics:          true,
        decisionAuthority:          "suggest_only",
      },
      {
        module:                     "collections",
        expertise:                  "operations",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          false,
        canSimulate:                false,
        canExplainMetrics:          true,
        decisionAuthority:          "suggest_and_draft",
      },
    ],
  },

  // ── Sofi — Operations & Integrations ────────────────────────────────────────
  "sofi": {
    agentId:            "sofi",
    knowledgeDomains:   ["connector-health", "sync-status", "automation-monitoring", "data-quality"],
    riskAwareness:      true,
    multiModuleContext: true,
    defaultAuthority:   "suggest_only",
    capabilities: [
      {
        module:                     "integrations",
        expertise:                  "operations",
        canCreateTasks:             true,
        canGenerateRecommendations: true,
        canTriggerActions:          true,
        canSimulate:                false,
        canExplainMetrics:          true,
        decisionAuthority:          "execute_with_approval",
      },
      {
        module:                     "alerts",
        expertise:                  "operations",
        canCreateTasks:             false,
        canGenerateRecommendations: true,
        canTriggerActions:          false,
        canSimulate:                false,
        canExplainMetrics:          true,
        decisionAuthority:          "suggest_only",
      },
      {
        module:                     "reports",
        expertise:                  "operations",
        canCreateTasks:             false,
        canGenerateRecommendations: true,
        canTriggerActions:          false,
        canSimulate:                false,
        canExplainMetrics:          true,
        decisionAuthority:          "suggest_only",
      },
    ],
  },
};

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the capability profile for an agent in a specific module.
 * Falls back to the agent's default authority if no exact module match.
 */
export function getAgentCapability(
  agentId: CopilotAgentId,
  module:  string,
): AgentModuleCapability | null {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) return null;

  // Try exact match, then prefix match
  return (
    profile.capabilities.find(c => c.module === module) ??
    profile.capabilities.find(c => module.startsWith(c.module)) ??
    null
  );
}

/**
 * Returns true if the agent can trigger actions in the given module.
 * Used to guard action chip rendering.
 */
export function agentCanTriggerActions(
  agentId: CopilotAgentId,
  module:  string,
): boolean {
  const cap = getAgentCapability(agentId, module);
  return cap?.canTriggerActions ?? false;
}

/**
 * Returns the decision authority level for an agent in a module.
 */
export function getDecisionAuthority(
  agentId: CopilotAgentId,
  module:  string,
): AgentDecisionAuthority {
  const cap = getAgentCapability(agentId, module);
  if (cap) return cap.decisionAuthority;
  return AGENT_PROFILES[agentId]?.defaultAuthority ?? "suggest_only";
}
