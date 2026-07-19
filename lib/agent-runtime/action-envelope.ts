/**
 * lib/agent-runtime/action-envelope.ts
 *
 * Agentik Agent Runtime — Action Envelope
 *
 * ActionEnvelope is the unified runtime + persistence + UI representation of an agent action.
 * It bridges AgentAction (runtime) and ActionTask (Prisma), without merging those models yet.
 *
 * Deriving from both sources:
 *   - ActionTask (Prisma) → persistent record, approval history, status
 *   - AgentAction (queue)  → live runtime state, audit trail, execution context
 *
 * When only one source is available, the other fields are null/derived.
 * V2: When Prisma gains an AgentAction model, this envelope maps 1:1.
 *
 * Sprint: AGENTIK-AGENT-APPROVAL-CENTER-01
 */

import type { AgentRuntimeId, AgentDomain, ActionStatus, ActionSeverity } from "./agent-types";

// ── Serializable envelope ─────────────────────────────────────────────────────
// All dates are ISO strings for safe cross-boundary (RSC → client) transport.

export interface ActionEnvelope {
  // ── Identity ─────────────────────────────────────────────────────────────
  id:               string;       // actionTaskId (primary) or agentActionId
  actionTaskId:     string | null;
  agentActionId:    string | null;

  // ── Type / intent ─────────────────────────────────────────────────────────
  type:             string;       // "create_production_request" | other
  title:            string;
  description:      string | null;

  // ── Agent identity ────────────────────────────────────────────────────────
  sourceAgentId:    AgentRuntimeId | string;
  domain:           AgentDomain | string;
  moduleKey:        string;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  /** Runtime lifecycle status from agent-types ActionStatus */
  agentStatus:      ActionStatus;
  /** Prisma ActionTask status — PENDING | COMPLETED | CANCELED | RUNNING | FAILED */
  taskStatus:       string | null;

  // ── Priority / severity ───────────────────────────────────────────────────
  priority:         string;       // "HIGH" | "MEDIUM" | "LOW" | "URGENT"
  severity:         ActionSeverity;
  requiresApproval: boolean;
  executionMode:    string;       // "supervised" | "queued" | "instant"

  // ── Actors ────────────────────────────────────────────────────────────────
  proposedBy:       string | null;
  approvedBy:       string | null;
  rejectedBy:       string | null;
  rejectionReason:  string | null;

  // ── Timestamps (ISO strings) ──────────────────────────────────────────────
  createdAt:        string;
  updatedAt:        string;
  approvedAt:       string | null;
  rejectedAt:       string | null;

  // ── Display payload — key fields for Approval Center UI ──────────────────
  payloadSummary:   Record<string, unknown>;
}

// ── Timeline event ────────────────────────────────────────────────────────────

export interface RuntimeTimelineEvent {
  id:           string;
  eventType:    string;   // "action.pending_approval" | "action.approved" | etc.
  agentId:      string;
  moduleKey:    string;
  actionId:     string | null;
  actionType:   string | null;
  summary:      string;
  timestamp:    string;   // ISO
  userId?:      string;
}

// ── Agent load snapshot ───────────────────────────────────────────────────────

export interface AgentLoadSnapshot {
  agentId:        AgentRuntimeId | string;
  label:          string;
  proposed:       number;
  pendingApproval: number;
  approved:       number;
  rejected:       number;
  failed:         number;
  executing:      number;
}

// ── Runtime metrics ───────────────────────────────────────────────────────────

export interface RuntimeMetrics {
  total:            number;
  pendingApproval:  number;
  approvedToday:    number;
  rejectedToday:    number;
  executing:        number;
  failed:           number;
  /** avg ms between createdAt → approvedAt for actions approved today */
  avgApprovalMs:    number | null;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

/** Map a serialized ActionTask (from Prisma, JSON-safe) to ActionEnvelope. */
export function envelopeFromTask(task: {
  id:            string;
  title:         string;
  description:   string | null;
  actionType:    string;
  status:        string;
  priority:      string;
  sourceModule:  string | null;
  createdAt:     string;
  updatedAt:     string;
  payloadJson:   Record<string, unknown> | null;
}): ActionEnvelope {
  const p = task.payloadJson ?? {};

  const agentStatus: ActionStatus =
    (p.agentActionStatus as ActionStatus | undefined) ??
    (task.status === "COMPLETED" ? "approved"
    : task.status === "CANCELED" ? "rejected"
    : task.status === "RUNNING"  ? "executing"
    : task.status === "FAILED"   ? "failed"
    : "pending_approval");

  return {
    id:               task.id,
    actionTaskId:     task.id,
    agentActionId:    (p.agentActionId as string | null) ?? null,

    type:             "create_production_request",
    title:            task.title,
    description:      task.description,

    sourceAgentId:    (p.sourceAgentId as string | undefined) ?? "david_commercial",
    domain:           "commercial",
    moduleKey:        task.sourceModule ?? "comercial.maletas",

    agentStatus,
    taskStatus:       task.status,

    priority:         task.priority,
    severity:         "high",
    requiresApproval: (p.requiresApproval as boolean | undefined) ?? true,
    executionMode:    "supervised",

    proposedBy:       (p.proposedBy as string | null) ?? null,
    approvedBy:       (p.approvedBy as string | null) ?? null,
    rejectedBy:       (p.rejectedBy as string | null) ?? null,
    rejectionReason:  (p.rejectionReason as string | null) ?? null,

    createdAt:        task.createdAt,
    updatedAt:        task.updatedAt,
    approvedAt:       (p.approvedAt as string | null) ?? null,
    rejectedAt:       (p.rejectedAt as string | null) ?? null,

    payloadSummary: {
      reference:   p.reference ?? null,
      description: p.description ?? null,
      qty:         p.qty ?? null,
      line:        p.line ?? null,
      reason:      p.reason ?? null,
    },
  };
}

/** Derive a timeline from a list of envelopes (no real event store yet). */
export function deriveTimeline(envelopes: ActionEnvelope[]): RuntimeTimelineEvent[] {
  const events: RuntimeTimelineEvent[] = [];
  let seq = 0;

  for (const env of envelopes) {
    // Proposed / pending_approval
    events.push({
      id:          `tl_${env.id}_proposed_${++seq}`,
      eventType:   "action.pending_approval",
      agentId:     env.sourceAgentId,
      moduleKey:   env.moduleKey,
      actionId:    env.agentActionId ?? env.actionTaskId,
      actionType:  env.type,
      summary:     `${agentLabel(env.sourceAgentId)} propuso "${env.title}"`,
      timestamp:   env.createdAt,
      userId:      env.proposedBy ?? undefined,
    });

    if (env.approvedAt && env.approvedBy) {
      events.push({
        id:        `tl_${env.id}_approved_${++seq}`,
        eventType: "action.approved",
        agentId:   env.sourceAgentId,
        moduleKey: env.moduleKey,
        actionId:  env.agentActionId ?? env.actionTaskId,
        actionType: env.type,
        summary:   `"${env.title}" aprobada por ${env.approvedBy}`,
        timestamp: env.approvedAt,
        userId:    env.approvedBy,
      });
    }

    if (env.rejectedAt && env.rejectedBy) {
      events.push({
        id:        `tl_${env.id}_rejected_${++seq}`,
        eventType: "action.rejected",
        agentId:   env.sourceAgentId,
        moduleKey: env.moduleKey,
        actionId:  env.agentActionId ?? env.actionTaskId,
        actionType: env.type,
        summary:   `"${env.title}" rechazada por ${env.rejectedBy}`,
        timestamp: env.rejectedAt,
        userId:    env.rejectedBy,
      });
    }
  }

  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Derive per-agent load from a list of envelopes. */
export function deriveAgentLoad(envelopes: ActionEnvelope[]): AgentLoadSnapshot[] {
  const AGENTS: Array<{ id: AgentRuntimeId; label: string }> = [
    { id: "david_commercial", label: "David" },
    { id: "diego_finance",    label: "Diego" },
    { id: "luca_marketing",   label: "Luca"  },
    { id: "mila_collections", label: "Mila"  },
  ];

  return AGENTS.map(ag => {
    const mine = envelopes.filter(e => e.sourceAgentId === ag.id);
    return {
      agentId:         ag.id,
      label:           ag.label,
      proposed:        mine.length,
      pendingApproval: mine.filter(e => e.agentStatus === "pending_approval").length,
      approved:        mine.filter(e => e.agentStatus === "approved" || e.agentStatus === "executed").length,
      rejected:        mine.filter(e => e.agentStatus === "rejected" || e.agentStatus === "dismissed").length,
      failed:          mine.filter(e => e.agentStatus === "failed").length,
      executing:       mine.filter(e => e.agentStatus === "executing").length,
    };
  });
}

/** Compute runtime metrics from envelopes. */
export function deriveMetrics(envelopes: ActionEnvelope[]): RuntimeMetrics {
  const today = new Date().toISOString().slice(0, 10);

  const approvedToday  = envelopes.filter(e => e.approvedAt?.startsWith(today));
  const rejectedToday  = envelopes.filter(e => e.rejectedAt?.startsWith(today));

  const avgMs = approvedToday.length > 0
    ? approvedToday.reduce((sum, e) => {
        if (!e.approvedAt) return sum;
        return sum + (new Date(e.approvedAt).getTime() - new Date(e.createdAt).getTime());
      }, 0) / approvedToday.length
    : null;

  return {
    total:           envelopes.length,
    pendingApproval: envelopes.filter(e => e.agentStatus === "pending_approval").length,
    approvedToday:   approvedToday.length,
    rejectedToday:   rejectedToday.length,
    executing:       envelopes.filter(e => e.agentStatus === "executing").length,
    failed:          envelopes.filter(e => e.agentStatus === "failed").length,
    avgApprovalMs:   avgMs,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function agentLabel(agentId: string): string {
  const map: Record<string, string> = {
    david_commercial: "David",
    diego_finance:    "Diego",
    luca_marketing:   "Luca",
    mila_collections: "Mila",
    agentik_copilot:  "Agentik",
  };
  return map[agentId] ?? agentId;
}
