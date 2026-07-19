/**
 * lib/agents/runtime/index.ts
 *
 * Agentik — Agent Runtime Public Barrel
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Exports all public symbols from the agent runtime domain.
 * Nothing here is server-only — this barrel is safe to import from any layer.
 */

// Types
export type {
  AgentId,
  AgentRunId,
  AgentRuntimeId,
  AgentCapabilityId,
  AgentMemoryId,
  AgentRuntimeStatus,
  AgentRuntimeMode,
  AgentRuntimeDomain,
  AgentRuntimeEventType,
  AgentRuntimeActionType,
  AgentRiskLevel,
  AgentRuntimeAuditEvent,
} from "./agent-runtime-types";

// Profile
export type { AgentProfile } from "./agent-profile";
export {
  DIEGO_FINANCE_AGENT,
  LUCA_MARKETING_AGENT,
  MILA_COMMERCIAL_AGENT,
  SYSTEM_AGENT,
} from "./agent-profile";

// Context
export type {
  AgentActiveTaskRef,
  AgentPendingApprovalRef,
  AgentRecentExecutionRef,
  AgentWorkflowRunRef,
  AgentRuntimeContext,
} from "./agent-context";
export { buildAgentContextFromDecisionContext } from "./agent-context";

// Capabilities
export type { AgentCapability } from "./agent-capabilities";
export {
  AGENT_CAPABILITIES,
  getCapabilitiesForAgent,
  getCapabilitiesForDomain,
  getCapabilityById,
} from "./agent-capabilities";

// Permissions
export {
  canAgentPerformAction,
  requiresApproval,
  canAgentUseDomain,
  isActionAllowedByMode,
  isActionPermitted,
} from "./agent-permissions";

// Memory
export type {
  ShortTermMemoryEntry,
  LongTermMemoryRef,
  RecentDecisionRef,
  RecentRecommendationRef,
  UserPreference,
  TenantRule,
  RiskNote,
  AgentMemorySnapshot,
} from "./agent-memory";
export {
  createEmptyAgentMemory,
  mergeAgentMemorySnapshot,
  summarizeAgentMemoryForDecision,
} from "./agent-memory";

// State
export type { AgentRuntimeState } from "./agent-state";
export {
  createInitialAgentState,
  transitionAgentState,
  isTerminalAgentState,
  isValidTransition,
} from "./agent-state";

// Result
export type { ProposedAction, AgentRuntimeResult } from "./agent-runtime-result";

// Audit
export type { AgentRuntimeValidationResult } from "./agent-runtime-audit";
export {
  validateAgentRuntimeContext,
  validateAgentProfile,
  validateProposedAction,
  auditAgentRuntimeRun,
  createAgentRuntimeAuditEvent,
} from "./agent-runtime-audit";

// Registry
export {
  AGENT_REGISTRY,
  getAgentProfileById,
  getAgentsByDomain,
  getActiveAgents,
  resolveAgentForModule,
  resolveAgentForDomain,
} from "./agent-runtime-registry";

// Engine
export { runAgentRuntime, mapRecommendationToProposedAction } from "./agent-runtime-engine";

// Fixtures
export {
  castillitosDiegoRuntimeContext,
  castillitosLucaRuntimeContext,
  castillitosMilaRuntimeContext,
  diegoPreviewContext,
  diegoFullSignalsContext,
} from "./agent-runtime-fixtures";
