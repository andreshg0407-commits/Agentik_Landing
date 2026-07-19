/**
 * lib/copilot/contextual-activation.ts
 *
 * Agentik Copilot — Contextual Activation Rules
 *
 * Sprint: AGENTIK-COPILOT-SURFACE-SEGREGATION-01 — Block B2
 *
 * Fine-grained rules for when each contextual section should activate.
 * These drive the SurfaceResolutionContext signals.
 *
 * PRINCIPLE: A healthy, idle system shows FEWER sections — not more.
 * Sections appear when there is something actionable to show.
 */

// ── Activation inputs ─────────────────────────────────────────────────────────

export interface RuntimeActivationInput {
  runtimeState:   string;   // HEALTHY | DEGRADED | BLOCKED | OFFLINE
  lastPulseAge:   number;   // seconds since last runtime pulse
}

export interface DispatchActivationInput {
  hasPendingDispatches: boolean;
  blockedDispatchCount: number;
  pendingApprovalCount: number;
}

export interface ReplayActivationInput {
  replayAvailable:  boolean;
  integrity:        string;   // intact | partial | incomplete | corrupt
  hasReplayRef:     boolean;
}

export interface IncidentActivationInput {
  totalIncidents:    number;
  criticalIncidents: number;
}

export interface InfrastructureActivationInput {
  isInternalRole:   boolean;
  runtimeDegraded:  boolean;
  vaultCritical:    boolean;
  incidentCount:    number;
}

// ── Per-section activation functions ─────────────────────────────────────────

/**
 * Runtime section: only show when runtime is not healthy or pulse is stale.
 * Healthy idle runtime = hidden (nothing actionable).
 */
export function shouldShowRuntime(input: RuntimeActivationInput): boolean {
  if (input.runtimeState !== "HEALTHY") return true;
  if (input.lastPulseAge > 300) return true;  // >5 min stale
  return false;
}

/**
 * Dispatch section: show when there is an active dispatch situation.
 * No pending dispatches + no blocks + no approvals = hidden.
 */
export function shouldShowDispatch(input: DispatchActivationInput): boolean {
  return (
    input.hasPendingDispatches ||
    input.blockedDispatchCount > 0 ||
    input.pendingApprovalCount > 0
  );
}

/**
 * Replay section: show when replay is available and there is
 * something to review (non-intact integrity or explicit replay ref).
 */
export function shouldShowReplay(input: ReplayActivationInput): boolean {
  if (!input.replayAvailable) return false;
  if (input.integrity === "incomplete" || input.integrity === "corrupt") return true;
  if (input.hasReplayRef) return true;
  return false;
}

/**
 * Incidents section: show when there are active incidents.
 * Zero incidents = hidden.
 */
export function shouldShowIncidents(input: IncidentActivationInput): boolean {
  return input.totalIncidents > 0;
}

/**
 * Infrastructure sections (runtime, vault, dispatch, replay, bridge, etc.):
 * Only show on internal roles. Internal role with any signal = show.
 * Tenant = never.
 */
export function shouldShowInfrastructure(input: InfrastructureActivationInput): boolean {
  return input.isInternalRole;
}

/**
 * Alerts section: show when there are active alerts.
 */
export function shouldShowAlerts(alertCount: number): boolean {
  return alertCount > 0;
}

/**
 * Tasks section: show when there are active tasks.
 */
export function shouldShowTasks(taskCount: number): boolean {
  return taskCount > 0;
}

/**
 * Supervised execution section: show when there is an active or pending
 * supervised execution.
 */
export function shouldShowSupervisedExecution(
  hasSupervisedExec: boolean,
  hasPendingApproval: boolean,
): boolean {
  return hasSupervisedExec || hasPendingApproval;
}

/**
 * Strategic memory section: show when there is relevant memory context.
 * Show on enterprise/executive when memory depth >= low-water mark.
 */
export function shouldShowStrategicMemory(
  memoryEntryCount: number,
  minThreshold = 1,
): boolean {
  return memoryEntryCount >= minThreshold;
}

/**
 * Capabilities section: show when there are active/available capabilities.
 */
export function shouldShowCapabilities(capabilityCount: number): boolean {
  return capabilityCount > 0;
}

/**
 * Collaboration section: show when there is an active copilot collaboration
 * thread or a pending IA request.
 */
export function shouldShowCollaboration(
  hasActiveThread: boolean,
  hasPendingRequest: boolean,
): boolean {
  return hasActiveThread || hasPendingRequest;
}

// ── Bulk activation builder ───────────────────────────────────────────────────

/**
 * Builds a complete activation signal map from all available inputs.
 * Output feeds directly into SurfaceResolutionContext.
 */
export interface ActivationSignals {
  hasActiveAlerts:         boolean;
  hasActiveTasks:          boolean;
  hasSupervisedExec:       boolean;
  hasIncidents:            boolean;
  runtimeHealthy:          boolean;
  governanceBlocked:       boolean;
  hasCollaborationContext: boolean;
  hasStrategicMemory:      boolean;
  hasCapabilities:         boolean;
}

export function buildActivationSignals(params: {
  alertCount:         number;
  taskCount:          number;
  hasSupervisedExec:  boolean;
  hasPendingApproval: boolean;
  incidentCount:      number;
  runtimeState:       string;
  governanceBlocked:  boolean;
  hasActiveThread:    boolean;
  hasPendingRequest:  boolean;
  memoryEntryCount:   number;
  capabilityCount:    number;
}): ActivationSignals {
  return {
    hasActiveAlerts:         shouldShowAlerts(params.alertCount),
    hasActiveTasks:          shouldShowTasks(params.taskCount),
    hasSupervisedExec:       shouldShowSupervisedExecution(params.hasSupervisedExec, params.hasPendingApproval),
    hasIncidents:            shouldShowIncidents({ totalIncidents: params.incidentCount, criticalIncidents: 0 }),
    runtimeHealthy:          params.runtimeState === "HEALTHY",
    governanceBlocked:       params.governanceBlocked,
    hasCollaborationContext: shouldShowCollaboration(params.hasActiveThread, params.hasPendingRequest),
    hasStrategicMemory:      shouldShowStrategicMemory(params.memoryEntryCount),
    hasCapabilities:         shouldShowCapabilities(params.capabilityCount),
  };
}
