/**
 * lib/agent-runtime/index.ts
 *
 * Agentik Agent Runtime — Public API
 *
 * Framework-agnostic base contracts for the Agentik agent runtime.
 * No Prisma, no LLM calls, no React — pure types and routing logic.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-ARCHITECTURE-01
 */

// Core types
export type {
  AgentRuntimeId,
  AgentDomain,
  AgentContext,
  AgentTool,
  AgentAction,
  ActionStatus,
  ActionSeverity,
  AuditEntry,
  AgentSignal,
  SignalSeverity,
  SourceHealth,
  SourceHealthStatus,
  ToolPermission,
  ToolExecutionMode,
} from "./agent-types";

// Router
export { routeToAgent, AGENT_ROUTES } from "./agent-router";
export type { AgentRoute, AgentRouteResult } from "./agent-router";

// Tool registry
export { getToolById, getToolsForAgent } from "./tool-registry";

// Memory types
export type {
  MemoryScope,
  MemoryEntry,
  TenantMemoryContent,
  ModuleMemoryContent,
  AgentMemoryContent,
  UserMemoryContent,
  OperationalMemoryContent,
} from "./agent-memory";

// Workflow types
export type {
  WorkflowExecutor,
  WorkflowStatus,
  AgentWorkflow,
  WorkflowStep,
  RetryPolicy,
} from "./workflow-router";
export { DEFAULT_RETRY_POLICY } from "./workflow-router";

// Runtime events
export type {
  RuntimeEventType,
  RuntimeEvent,
  AgentInvokedEvent,
  ToolCalledEvent,
  ActionStatusEvent,
} from "./runtime-events";
export { buildRuntimeEvent } from "./runtime-events";

// Audit
export type {
  AuditRecordType,
  AuditRecord,
  ActionAuditRecord,
  ToolAuditRecord,
  AuditTrail,
} from "./audit";
export { createAgentAuditRecord } from "./audit";

// Action lifecycle (AGENTIK-AGENT-ACTION-LIFECYCLE-01)
export {
  createAgentActionDraft,
  markActionPendingApproval,
  approveAgentAction,
  rejectAgentAction,
  markActionExecuting,
  markActionExecuted,
  markActionFailed,
  dismissAgentAction,
  expireAgentAction,
  isTerminalStatus,
  isAwaitingApproval,
  canApprove,
  canReject,
  ActionTransitionError,
} from "./action-lifecycle";

// Action queue (AGENTIK-AGENT-ACTION-LIFECYCLE-01)
export {
  enqueueAgentAction,
  getAgentAction,
  listPendingAgentActions,
  updateAgentActionStatus,
  setActionQueueAdapter,
} from "./action-queue";
export type { AgentActionFilter, AgentActionQueueAdapter } from "./action-queue";

// Action executor (AGENTIK-AGENT-ACTION-LIFECYCLE-01)
export {
  canExecuteAction,
  resolveActionHandler,
  executeAgentAction,
  resolveExecutionMode,
  registerActionHandler,
} from "./action-executor";
export type { ActionHandlerContext, ActionHandlerFn, ExecutionGateResult } from "./action-executor";

// Runtime event emitter
export { emitAgentRuntimeEvent } from "./runtime-events";

// Action Envelope (AGENTIK-AGENT-APPROVAL-CENTER-01)
export type {
  ActionEnvelope,
  RuntimeTimelineEvent,
  AgentLoadSnapshot,
  RuntimeMetrics,
} from "./action-envelope";
export {
  envelopeFromTask,
  deriveTimeline,
  deriveAgentLoad,
  deriveMetrics,
} from "./action-envelope";
