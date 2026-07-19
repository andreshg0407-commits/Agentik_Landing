/**
 * lib/agent-runtime/event-normalizer.ts
 *
 * Agentik Runtime Event Store — Event Normalizer
 *
 * Transforms RuntimeEvent (existing emitter shape) and DelegationEvent
 * into RuntimeStoredEvent for the event store.
 *
 * Guarantees:
 * - orgId always set
 * - eventType always set
 * - category resolved from eventType prefix
 * - severity derived from metadata/eventType
 * - correlationId: use existing or derive stable one from actionId/delegationId
 * - occurredAt: use event timestamp
 * - recordedAt: set at normalization time
 * - schemaVersion: 1
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EVENT-STORE-01
 */

import type { RuntimeEvent }      from "./runtime-events";
import type { RuntimeStoredEvent, EventCategory, EventSeverity } from "./event-store-types";
import { createStoredEvent }  from "./event-store";
import { escorrid }           from "./event-store-types";

// ── Category resolution ───────────────────────────────────────────────────────

function resolveCategory(eventType: string): EventCategory {
  const prefix = eventType.split(".")[0] ?? "";
  switch (prefix) {
    case "action":      return "action";
    case "delegation":  return "delegation";
    case "plan":        return "plan";
    case "memory":      return "memory";
    case "intelligence":return "intelligence";
    case "tool":        return "tool";
    case "workflow":    return "workflow";
    default:            return "system";
  }
}

// ── Severity derivation ────────────────────────────────────────────────────────

const CRITICAL_TYPES = new Set([
  "action.failed", "tool.failed", "workflow.failed",
  "delegation.failed", "delegation.blocked",
]);
const WARNING_TYPES  = new Set([
  "action.rejected", "action.dismissed", "action.expired",
  "delegation.rejected", "delegation.expired",
]);
const NOTICE_TYPES   = new Set([
  "action.approved", "action.executed",
  "delegation.proposed", "delegation.approved", "delegation.accepted",
  "delegation.completed",
  "workflow.completed",
]);

function deriveSeverity(
  eventType: string,
  metadata: Record<string, unknown>,
): EventSeverity {
  if (CRITICAL_TYPES.has(eventType))  return "critical";
  if (WARNING_TYPES.has(eventType))   return "warning";
  if (NOTICE_TYPES.has(eventType))    return "notice";
  // Check explicit severity in metadata
  const sev = String(metadata.severity ?? "");
  if (["debug","info","notice","warning","critical"].includes(sev)) return sev as EventSeverity;
  return "info";
}

// ── Correlation ID resolution ─────────────────────────────────────────────────

function resolveCorrelationId(
  event: RuntimeEvent,
  actionId: string | null,
  delegationId: string | null,
): string | null {
  if (event.correlationId) return event.correlationId;
  if (actionId)     return escorrid(`action:${actionId}`);
  if (delegationId) return escorrid(`delegation:${delegationId}`);
  if (event.organizationId && event.agentId) {
    return null; // No stable base — leave as orphan
  }
  return null;
}

// ── ActionId / DelegationId extraction ───────────────────────────────────────

function extractActionId(metadata: Record<string, unknown>): string | null {
  const v = metadata.actionId ?? metadata.agentActionId ?? metadata.actionTaskId;
  return typeof v === "string" ? v : null;
}

function extractDelegationId(metadata: Record<string, unknown>): string | null {
  const v = metadata.delegationId;
  return typeof v === "string" ? v : null;
}

// ── Main normalizer ───────────────────────────────────────────────────────────

export function normalizeRuntimeEvent(event: RuntimeEvent): RuntimeStoredEvent {
  const category     = resolveCategory(event.type);
  const actionId     = extractActionId(event.metadata);
  const delegationId = extractDelegationId(event.metadata);
  const severity     = deriveSeverity(event.type, event.metadata);
  const correlationId = resolveCorrelationId(event, actionId, delegationId);

  return createStoredEvent({
    orgId:         event.organizationId,
    eventType:     event.type,
    category,
    severity,
    agentId:       typeof event.agentId === "string" ? event.agentId : null,
    moduleKey:     event.moduleKey ?? null,
    actionId,
    delegationId,
    planId:        typeof event.metadata.planId === "string" ? event.metadata.planId : null,
    correlationId,
    causationId:   typeof event.metadata.causationId === "string" ? event.metadata.causationId : null,
    parentEventId: typeof event.metadata.parentEventId === "string" ? event.metadata.parentEventId : null,
    payload:       {
      title:       event.metadata.actionTitle ?? event.metadata.title ?? null,
      actionType:  event.metadata.actionType ?? null,
      newStatus:   event.metadata.newStatus ?? null,
      prevStatus:  event.metadata.prevStatus ?? null,
      userId:      event.metadata.userId ?? null,
    },
    metadata:      event.metadata,
    occurredAt:    event.timestamp,
  });
}
