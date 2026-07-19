/**
 * lib/agent-runtime/event-replay.ts
 *
 * Agentik Runtime Event Store — Replay Preparation Layer
 *
 * Read-only analysis functions for event chains.
 * Does NOT mutate any state — only reads and groups events.
 *
 * Prepares for future full replay capability (V2+).
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EVENT-STORE-01
 */

import type { RuntimeStoredEvent } from "./event-store-types";

// ── Group by correlation ──────────────────────────────────────────────────────

export interface CorrelationGroup {
  correlationId: string;
  events:        RuntimeStoredEvent[];
  startedAt:     string;
  completedAt:   string | null;
  agentsInvolved: string[];
  categories:    string[];
  hasErrors:     boolean;
}

export function groupEventsByCorrelation(
  events: RuntimeStoredEvent[],
): Map<string, CorrelationGroup> {
  const groups = new Map<string, CorrelationGroup>();

  for (const e of events) {
    const cid = e.correlationId ?? `__orphan_${e.id}`;
    let group = groups.get(cid);
    if (!group) {
      group = {
        correlationId:  cid,
        events:         [],
        startedAt:      e.occurredAt,
        completedAt:    null,
        agentsInvolved: [],
        categories:     [],
        hasErrors:      false,
      };
      groups.set(cid, group);
    }
    group.events.push(e);
    if (e.occurredAt < group.startedAt) group.startedAt = e.occurredAt;
    if (!group.completedAt || e.occurredAt > group.completedAt) group.completedAt = e.occurredAt;
    if (e.agentId && !group.agentsInvolved.includes(e.agentId)) {
      group.agentsInvolved.push(e.agentId);
    }
    if (!group.categories.includes(e.category)) group.categories.push(e.category);
    if (e.severity === "critical" || e.eventType.endsWith(".failed")) group.hasErrors = true;
  }

  // Sort events within each group chronologically
  for (const g of groups.values()) {
    g.events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  return groups;
}

// ── Action timeline ───────────────────────────────────────────────────────────

export interface ActionTimeline {
  actionId:   string;
  events:     RuntimeStoredEvent[];
  firstSeen:  string;
  lastSeen:   string;
  finalState: string | null;
  duration:   number; // ms from first to last event
}

export function reconstructActionTimeline(
  actionId: string,
  events:   RuntimeStoredEvent[],
): ActionTimeline {
  const actionEvents = events
    .filter(e => e.actionId === actionId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const first = actionEvents[0];
  const last  = actionEvents.at(-1);
  const finalStatus = last?.payload?.newStatus ?? last?.eventType ?? null;

  return {
    actionId,
    events:     actionEvents,
    firstSeen:  first?.occurredAt ?? "",
    lastSeen:   last?.occurredAt ?? "",
    finalState: typeof finalStatus === "string" ? finalStatus : null,
    duration:   first && last
      ? new Date(last.occurredAt).getTime() - new Date(first.occurredAt).getTime()
      : 0,
  };
}

// ── Delegation timeline ───────────────────────────────────────────────────────

export interface DelegationTimeline {
  delegationId: string;
  events:       RuntimeStoredEvent[];
  firstSeen:    string;
  lastSeen:     string;
  finalState:   string | null;
  agentPath:    string[];  // source → target as seen in events
}

export function reconstructDelegationTimeline(
  delegationId: string,
  events:       RuntimeStoredEvent[],
): DelegationTimeline {
  const delEvents = events
    .filter(e => e.delegationId === delegationId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const agentPath: string[] = [];
  for (const e of delEvents) {
    const src = String(e.metadata.sourceAgentId ?? e.agentId ?? "");
    const tgt = String(e.metadata.targetAgentId ?? "");
    if (src && !agentPath.includes(src)) agentPath.push(src);
    if (tgt && !agentPath.includes(tgt)) agentPath.push(tgt);
  }

  const last = delEvents.at(-1);

  return {
    delegationId,
    events:     delEvents,
    firstSeen:  delEvents[0]?.occurredAt ?? "",
    lastSeen:   last?.occurredAt ?? "",
    finalState: last?.eventType ?? null,
    agentPath,
  };
}

// ── Plan timeline ─────────────────────────────────────────────────────────────

export interface PlanTimeline {
  planId:     string;
  events:     RuntimeStoredEvent[];
  firstSeen:  string;
  lastSeen:   string;
  finalState: string | null;
}

export function reconstructPlanTimeline(
  planId: string,
  events: RuntimeStoredEvent[],
): PlanTimeline {
  const planEvents = events
    .filter(e => e.planId === planId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const last = planEvents.at(-1);

  return {
    planId,
    events:     planEvents,
    firstSeen:  planEvents[0]?.occurredAt ?? "",
    lastSeen:   last?.occurredAt ?? "",
    finalState: last?.eventType ?? null,
  };
}

// ── Missing lifecycle event detection ────────────────────────────────────────

export interface MissingLifecycleEvent {
  entityId:   string;
  entityType: "action" | "delegation" | "plan";
  expected:   string;
  reason:     string;
}

const ACTION_LIFECYCLE = [
  "action.pending_approval",
  "action.approved",
  "action.executed",
];
const DELEGATION_LIFECYCLE = [
  "delegation.proposed",
  "delegation.approved",
  "delegation.completed",
];

export function detectMissingLifecycleEvents(
  events: RuntimeStoredEvent[],
): MissingLifecycleEvent[] {
  const missing: MissingLifecycleEvent[] = [];

  // Group action events by actionId
  const byAction = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.actionId) continue;
    const s = byAction.get(e.actionId) ?? new Set<string>();
    s.add(e.eventType);
    byAction.set(e.actionId, s);
  }

  for (const [actionId, types] of byAction) {
    const hasApproved  = types.has("action.approved");
    const hasPending   = types.has("action.pending_approval");
    const hasExecuted  = types.has("action.executed");
    const hasRejected  = types.has("action.rejected") || types.has("action.dismissed");

    if (hasApproved && !hasPending) {
      missing.push({ entityId: actionId, entityType: "action", expected: "action.pending_approval", reason: "Approved without pending_approval event" });
    }
    if (hasExecuted && !hasApproved && !hasRejected) {
      missing.push({ entityId: actionId, entityType: "action", expected: "action.approved", reason: "Executed without approval event" });
    }
    void ACTION_LIFECYCLE; // Reserved for V2 full chain validation
  }

  // Group delegation events by delegationId
  const byDelegation = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.delegationId) continue;
    const s = byDelegation.get(e.delegationId) ?? new Set<string>();
    s.add(e.eventType);
    byDelegation.set(e.delegationId, s);
  }

  for (const [delegationId, types] of byDelegation) {
    const hasCompleted = types.has("delegation.completed");
    const hasAccepted  = types.has("delegation.accepted");
    const hasApproved  = types.has("delegation.approved");
    const hasProposed  = types.has("delegation.proposed");

    if (hasCompleted && !hasAccepted) {
      missing.push({ entityId: delegationId, entityType: "delegation", expected: "delegation.accepted", reason: "Completed without accepted event" });
    }
    if (hasApproved && !hasProposed) {
      missing.push({ entityId: delegationId, entityType: "delegation", expected: "delegation.proposed", reason: "Approved without proposed event" });
    }
    void DELEGATION_LIFECYCLE; // Reserved for V2
  }

  return missing;
}

// ── Invalid event order detection ─────────────────────────────────────────────

export interface InvalidEventOrder {
  entityId:   string;
  entityType: "action" | "delegation";
  violation:  string;
  events:     string[];
}

export function detectInvalidEventOrder(
  events: RuntimeStoredEvent[],
): InvalidEventOrder[] {
  const violations: InvalidEventOrder[] = [];

  // Action: rejected before pending_approval (no valid path)
  const byAction = new Map<string, RuntimeStoredEvent[]>();
  for (const e of events) {
    if (!e.actionId) continue;
    const arr = byAction.get(e.actionId) ?? [];
    arr.push(e);
    byAction.set(e.actionId, arr);
  }

  for (const [actionId, actionEvents] of byAction) {
    const sorted = [...actionEvents].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const types  = sorted.map(e => e.eventType);

    // Cannot be approved after rejected
    const rejIdx = types.lastIndexOf("action.rejected");
    const appIdx = types.lastIndexOf("action.approved");
    if (rejIdx !== -1 && appIdx !== -1 && appIdx > rejIdx) {
      violations.push({
        entityId:   actionId,
        entityType: "action",
        violation:  "action.approved appears after action.rejected",
        events:     types,
      });
    }
  }

  return violations;
}
