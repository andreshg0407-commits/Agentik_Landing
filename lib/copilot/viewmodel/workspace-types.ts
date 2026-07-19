/**
 * lib/copilot/viewmodel/workspace-types.ts
 *
 * Agentik Copilot — Workspace ViewModel Types
 * Sprint: AGENTIK-COPILOT-WORKSPACE-01
 *
 * Extends the ViewModel layer with operational workspace state.
 * Strictly a UI projection layer — no runtime, no engine, no DB.
 *
 * These types represent the agent's work state as surfaced to the user:
 *   - Active work in progress
 *   - Items pending human approval
 *   - Recently completed work
 *   - Scheduled follow-ups
 *   - Incoming request history (prepares future chat integration)
 *
 * Architecture note: these are optional fields on CopilotViewModel.
 * They are populated by fixtures in dev; future integration will wire
 * them through the ViewModel builder.
 */

// ── Shared primitive types ────────────────────────────────────────────────────

export type WorkItemPriority = "high" | "medium" | "low";
export type WorkItemStatus   = "running" | "analyzing" | "paused";
export type ApprovalRisk     = "high" | "medium" | "low";
export type ApprovalStatus   = "pending_approval" | "pending_review";
export type RequestStatus    = "completed" | "in_progress" | "pending";

// ── Active Work ───────────────────────────────────────────────────────────────

/**
 * A task the agent is currently executing.
 * Progress is 0–100 (visual only, not a real percentage).
 */
export interface ActiveWorkItem {
  id:          string;
  title:       string;
  /** 0–100 — display-only progress indicator */
  progress:    number;
  priority:    WorkItemPriority;
  domain?:     string;
  status:      WorkItemStatus;
  statusLabel: string;
}

// ── Pending Approvals ─────────────────────────────────────────────────────────

/**
 * An action the agent wants to take but needs human authorization to proceed.
 */
export interface PendingApprovalItem {
  id:          string;
  action:      string;
  impact:      string;
  risk:        ApprovalRisk;
  riskLabel:   string;
  status:      ApprovalStatus;
  statusLabel: string;
  domain?:     string;
}

// ── Completed Work ────────────────────────────────────────────────────────────

/**
 * A task the agent has recently finished.
 */
export interface CompletedWorkItem {
  id:             string;
  title:          string;
  /** Human-readable relative time, e.g. "Hace 5 min" */
  completedLabel: string;
  domain?:        string;
  /** Short outcome description, e.g. "3 excepciones detectadas" */
  outcome?:       string;
}

// ── Followup Items ────────────────────────────────────────────────────────────

/**
 * A scheduled follow-up action the agent is tracking.
 */
export interface FollowupItem {
  id:       string;
  title:    string;
  /** Human-readable due window, e.g. "En 24 horas" */
  due:      string;
  domain?:  string;
  priority: WorkItemPriority;
}

// ── Request Inbox ─────────────────────────────────────────────────────────────

/**
 * A request made to the agent (prepares future chat integration).
 */
export interface RequestInboxItem {
  id:          string;
  request:     string;
  status:      RequestStatus;
  statusLabel: string;
  domain?:     string;
}
