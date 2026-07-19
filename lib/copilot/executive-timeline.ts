/**
 * lib/copilot/executive-timeline.ts
 *
 * Agentik Copilot — Executive Activity Timeline V1
 *
 * Builds a lightweight timeline of recent Copilot activity.
 * V1: deterministic, mock-safe — no DB queries.
 * V2: driven by Prisma.CopilotExecutionLog + real signal history.
 *
 * Each event represents something the Copilot system observed or did.
 * Shown in the rail as a compact vertical feed — max 3 visible items.
 *
 * Sprint: AGENTIK-COPILOT-ADAPTIVE-RAIL-01
 */

import type { CopilotContextSnapshot }       from "./context-engine";
import type { ExecutiveIntent }              from "./executive-intent";
import type { CompoundOperation }            from "./compound-operations";
import type { AccountabilitySignal }         from "./accountability-engine";
import type { FollowUpMemory }               from "./followup-memory";
import type { AgentCollaboration }           from "./agent-collaboration";
import type { ExecutionBundle }              from "./execution-bundles";
import type { StrategicMemoryEntry }         from "./strategic-memory";
import type { CapabilityAvailabilityResult } from "./capability-resolver";
import type { SupervisedExecution }          from "./supervised-execution";
import type { ExecutionLifecycle }           from "./execution-lifecycle";

// ── Timeline event types ───────────────────────────────────────────────────────

export type CopilotTimelineEventType =
  | "signal_detected"          // A signal was detected and activated
  | "recommendation_generated" // A recommendation was generated from context
  | "action_executed"          // A Copilot action was executed (future)
  | "approval_requested"       // An approval was submitted to the queue
  | "context_shift"            // The active module or agent changed
  | "sync_warning"             // A sync/runtime degradation was detected
  | "intent_started"           // A new executive intent was created
  | "intent_continued"         // An existing intent was carried forward from memory
  | "intent_escalated"         // An intent was escalated to urgent
  | "intent_resolved"          // An intent was resolved
  | "operation_proposed"       // A compound operation plan was proposed
  | "operation_ready"          // A compound operation reached ready state
  | "operation_blocked"        // A compound operation is blocked by dependencies
  | "operation_completed"      // A compound operation was completed
  | "operation_progressed"     // A compound operation made measurable progress
  | "operation_stalled"        // A compound operation stalled due to runtime or blockers
  | "operation_escalated"      // A compound operation was escalated due to risk
  | "blocker_detected"         // A blocking condition was identified
  | "accountability_followup"  // Copilot maintained follow-up across sessions
  | "handoff_proposed"         // An agent handoff was proposed
  | "handoff_active"           // An agent handoff is in progress
  | "handoff_blocked"          // An agent handoff is blocked
  | "handoff_resolved"         // An agent handoff was resolved
  | "agent_consulted"          // A target agent was consulted by the active agent
  | "bundle_created"           // An execution bundle was prepared
  | "governance_denied"        // Governance engine denied execution
  | "execution_ready"          // A bundle is ready for supervised execution
  | "execution_blocked"        // A bundle is blocked by dependencies
  | "execution_supervised"     // A supervised execution is in progress
  // Phase A4: Strategic Memory events
  | "memory_pattern_detected"  // A recurring operational pattern was detected
  | "memory_referenced"        // A past memory entry was referenced in current context
  | "recurring_issue_detected" // A known recurring issue is active again
  | "strategic_context_updated"// The strategic context was updated with new signals
  // Phase B8: Capability events
  | "capability_blocked"       // A capability was blocked by governance
  | "capability_delegated"     // A capability was delegated to another agent
  | "capability_shared"        // A capability is being shared across agents
  | "capability_restricted"    // A capability is active but restricted
  | "strategic_memory_referenced"  // Strategic memory was surfaced in current session
  // Phase 10 (V3): Supervised Execution events
  | "execution_prepared"           // A supervised execution draft was prepared
  | "confirmation_requested"       // Human confirmation was requested for execution
  | "execution_approved"           // Operator approved the supervised execution
  | "execution_started"            // Supervised execution began
  | "execution_completed"          // Supervised execution completed successfully
  | "execution_failed"             // Supervised execution failed
  | "rollback_available"           // Rollback is available for a completed execution
  | "rollback_requested";          // Rollback was triggered by operator

export type TimelineSeverity = "critical" | "elevated" | "normal";

export interface CopilotTimelineEvent {
  id:            string;
  timestamp:     Date;
  agentId:       string;
  type:          CopilotTimelineEventType;
  title:         string;
  description:   string;
  severity:      TimelineSeverity;
  relatedModule: string;
}

// ── Serializable version (safe for RSC props) ──────────────────────────────────

export interface CopilotTimelineEventSerial {
  id:            string;
  type:          CopilotTimelineEventType;
  title:         string;
  relativeTime:  string;   // e.g. "hace 2h", "ayer"
  severity:      TimelineSeverity;
  module:        string;
}

// ── Relative time formatter ────────────────────────────────────────────────────

function toRelativeTime(ts: Date): string {
  const diff = Date.now() - ts.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (days >= 2)    return `hace ${days} días`;
  if (days === 1)   return "ayer";
  if (hours >= 2)   return `hace ${hours}h`;
  if (hours === 1)  return "hace 1h";
  if (mins >= 5)    return `hace ${mins}m`;
  return "justo ahora";
}

// ── Signal → timeline event ────────────────────────────────────────────────────

const SIGNAL_TITLE: Record<string, string> = {
  "treasury.low_coverage":           "Cobertura de caja baja detectada",
  "financial_close.blocked":         "Cierre financiero bloqueado",
  "reconciliation.pending_critical": "Excepciones críticas en conciliación",
  "budget.velocity_exceeded":        "Velocidad presupuestal excedida",
};

const SIGNAL_MODULE: Record<string, string> = {
  "treasury.low_coverage":           "finanzas/tesoreria",
  "financial_close.blocked":         "finanzas/cierre",
  "reconciliation.pending_critical": "finanzas/conciliacion",
  "budget.velocity_exceeded":        "finanzas/planeacion",
};

// ── Context shift events (module-specific, deterministic) ─────────────────────

function makeContextShiftEvent(
  module: string,
  agentId: string,
  minutesAgo: number,
): CopilotTimelineEvent {
  const moduleLabels: Record<string, string> = {
    "executive":             "Torre de Control",
    "finanzas/tesoreria":    "Tesorería Operativa",
    "finanzas/conciliacion": "Conciliación",
    "finanzas/cierre":       "Cierre Financiero",
    "finanzas/planeacion":   "Planeación",
    "sales":                 "Ventas",
    "pipeline":              "Pipeline",
    "agentik/marketing-studio": "Marketing Studio",
  };

  const label = moduleLabels[module] ?? module;
  const ts    = new Date(Date.now() - minutesAgo * 60_000);

  return {
    id:            `ctx-shift-${module.replace(/\//g, "-")}`,
    timestamp:     ts,
    agentId,
    type:          "context_shift",
    title:         `Contexto: ${label}`,
    description:   `Sesión activa en ${label}`,
    severity:      "normal",
    relatedModule: module,
  };
}

// ── Supervised execution status label ─────────────────────────────────────────

function summarizeExecStatus(status: string, mode: string): string {
  const MAP: Record<string, string> = {
    prepared:              "Ejecución preparada",
    awaiting_confirmation: "Confirmación requerida",
    approved:              "Operación aprobada",
    executing:             "Ejecutando…",
    completed:             "Ejecución completada",
    failed:                "Error en ejecución",
    rolled_back:           "Operación revertida",
  };
  return `${MAP[status] ?? status} — modo ${mode}`;
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Builds the executive timeline from the current context snapshot.
 * Returns events in reverse-chronological order (newest first), max 5.
 * V1: deterministic mock — safe for SSR, no side effects.
 * Accepts optional active intents to enrich the timeline.
 */
export function buildExecutiveTimeline(
  context:              CopilotContextSnapshot,
  intents?:             ExecutiveIntent[],
  operations?:          CompoundOperation[],
  accountabilitySignals?: AccountabilitySignal[],
  followupMemory?:        FollowUpMemory | null,
  collaborations?:        AgentCollaboration[],
  executionBundles?:      ExecutionBundle[],
  strategicMemory?:       StrategicMemoryEntry[],
  capabilityResults?:     CapabilityAvailabilityResult[],
  supervisedExecution?:   SupervisedExecution | null,
  executionLifecycle?:    ExecutionLifecycle | null,
): CopilotTimelineEvent[] {
  const events: CopilotTimelineEvent[] = [];

  // ── 1. Signal-detected events (from primary + secondary signals) ──────────
  const allSignals = [
    ...(context.primarySignal ? [context.primarySignal] : []),
    ...context.secondarySignals,
  ];

  for (const sig of allSignals) {
    events.push({
      id:            `sig-${sig.id}`,
      timestamp:     sig.detectedAt,
      agentId:       context.activeAgentId,
      type:          "signal_detected",
      title:         SIGNAL_TITLE[sig.ruleId] ?? "Señal detectada",
      description:   sig.titulo,
      severity:      sig.severity === "critica"   ? "critical"
                   : sig.severity === "elevada"   ? "elevated"
                   : "normal",
      relatedModule: SIGNAL_MODULE[sig.ruleId] ?? context.activeModule,
    });
  }

  // ── 2. Sync warning for degraded/stale runtime ────────────────────────────
  if (context.runtimeState === "DEGRADED" || context.runtimeState === "STALE") {
    events.push({
      id:            "runtime-sync-warn",
      timestamp:     new Date(Date.now() - 15 * 60_000), // 15 min ago
      agentId:       context.activeAgentId,
      type:          "sync_warning",
      title:         context.runtimeState === "DEGRADED"
        ? "Contexto degradado — datos parciales"
        : "Sincronización pendiente",
      description:   "El motor de señales reporta estado no óptimo",
      severity:      context.runtimeState === "DEGRADED" ? "elevated" : "normal",
      relatedModule: "integrations",
    });
  }

  // ── 3. Context shift event for current module ─────────────────────────────
  events.push(makeContextShiftEvent(context.activeModule, context.activeAgentId, 3));

  // ── 4. Intent events — sustained executive priorities ─────────────────────
  if (intents && intents.length > 0) {
    for (const intent of intents.slice(0, 2)) {
      const isContinued = (intent as any).sessionCount > 1;
      const isEscalated = intent.status === "escalated";

      const type: CopilotTimelineEventType =
        isEscalated  ? "intent_escalated"  :
        isContinued  ? "intent_continued"  :
        "intent_started";

      events.push({
        id:            `intent-ev-${intent.id}`,
        timestamp:     new Date(Date.now() - 8 * 60_000), // 8 min ago
        agentId:       intent.agentId,
        type,
        title:         isEscalated ? `${intent.title} — escalado`
                     : isContinued ? `${intent.title} — continúa`
                     : intent.title,
        description:   intent.objective,
        severity:      intent.severity === "critical" ? "critical"
                     : intent.severity === "elevated"  ? "elevated" : "normal",
        relatedModule: intent.module,
      });
    }
  }

  // ── 5. Compound operation events ─────────────────────────────────────────
  if (operations && operations.length > 0) {
    const op = operations[0]!;  // Primary operation only

    const opEventType: CopilotTimelineEventType =
      op.status === "blocked"   ? "operation_blocked"   :
      op.status === "completed" ? "operation_completed"  :
      op.status === "ready"     ? "operation_ready"      :
      "operation_proposed";

    const opSeverity: TimelineSeverity =
      op.riskLevel === "critical" ? "critical" :
      op.riskLevel === "high"     ? "elevated"  : "normal";

    events.push({
      id:            `op-ev-${op.id}`,
      timestamp:     new Date(Date.now() - 5 * 60_000), // 5 min ago
      agentId:       op.agentId,
      type:          opEventType,
      title:         op.status === "blocked"
        ? `Plan bloqueado — ${op.title}`
        : `Plan propuesto — ${op.title}`,
      description:   op.objective,
      severity:      opSeverity,
      relatedModule: op.involvedModules[0] ?? context.activeModule,
    });
  }

  // ── 6. Accountability + follow-up events ────────────────────────────────
  if (accountabilitySignals && accountabilitySignals.length > 0) {
    const primarySig = accountabilitySignals[0]!;

    // Stalled or blocked operation event
    if (primarySig.type === "stalled_operation" || primarySig.type === "blocked_step") {
      const evType: CopilotTimelineEventType =
        primarySig.type === "blocked_step" ? "operation_stalled" : "operation_stalled";

      events.push({
        id:            `acc-ev-${primarySig.id}`,
        timestamp:     new Date(Date.now() - 6 * 60_000), // 6 min ago
        agentId:       context.activeAgentId,
        type:          evType,
        title:         primarySig.title,
        description:   primarySig.description,
        severity:      primarySig.severity === "critical" ? "critical"
                     : primarySig.severity === "elevated"  ? "elevated" : "normal",
        relatedModule: operations?.[0]?.involvedModules?.[0] ?? context.activeModule,
      });
    }

    // Escalated operation if escalation is recommended
    if (primarySig.escalationRecommended) {
      events.push({
        id:            `acc-esc-${primarySig.id}`,
        timestamp:     new Date(Date.now() - 4 * 60_000), // 4 min ago
        agentId:       context.activeAgentId,
        type:          "operation_escalated",
        title:         "Escalación recomendada",
        description:   primarySig.description,
        severity:      "elevated",
        relatedModule: operations?.[0]?.involvedModules?.[0] ?? context.activeModule,
      });
    }

    // Blocker detected if blocked step
    if (primarySig.type === "blocked_step" || primarySig.type === "delayed_execution") {
      events.push({
        id:            `acc-block-${primarySig.id}`,
        timestamp:     new Date(Date.now() - 7 * 60_000), // 7 min ago
        agentId:       context.activeAgentId,
        type:          "blocker_detected",
        title:         primarySig.title,
        description:   primarySig.description,
        severity:      primarySig.severity === "critical" ? "critical" : "elevated",
        relatedModule: operations?.[0]?.involvedModules?.[0] ?? context.activeModule,
      });
    }
  }

  // Follow-up continuity event
  if (followupMemory && followupMemory.followupCount >= 2) {
    events.push({
      id:            `followup-${followupMemory.operationId}`,
      timestamp:     new Date(Date.now() - 2 * 60_000), // 2 min ago
      agentId:       context.activeAgentId,
      type:          "accountability_followup",
      title:         followupMemory.continuityMessage,
      description:   `Seguimiento activo desde ${followupMemory.unresolvedSince}`,
      severity:      followupMemory.escalationLevel >= 2 ? "elevated" : "normal",
      relatedModule: context.activeModule,
    });
  }

  // ── 7. Multi-agent collaboration events ──────────────────────────────────
  if (collaborations && collaborations.length > 0) {
    const primary = collaborations[0]!;

    const COLLAB_TYPE_EVENT: Record<string, CopilotTimelineEventType> = {
      handoff:         "handoff_proposed",
      consultation:    "agent_consulted",
      support_request: "handoff_proposed",
      escalation:      "handoff_active",
      shared_context:  "agent_consulted",
    };

    const STATUS_TYPE_EVENT: Record<string, CopilotTimelineEventType> = {
      active:   "handoff_active",
      blocked:  "handoff_blocked",
      resolved: "handoff_resolved",
      waiting:  "handoff_proposed",
    };

    const evType: CopilotTimelineEventType =
      STATUS_TYPE_EVENT[primary.status] ??
      COLLAB_TYPE_EVENT[primary.type]   ??
      "handoff_proposed";

    const srcName = primary.sourceAgentId.charAt(0).toUpperCase() + primary.sourceAgentId.slice(1);
    const tgtName = primary.targetAgentId.charAt(0).toUpperCase() + primary.targetAgentId.slice(1);

    events.push({
      id:            `collab-ev-${primary.id}`,
      timestamp:     new Date(Date.now() - 3 * 60_000), // 3 min ago
      agentId:       primary.sourceAgentId,
      type:          evType,
      title:         `${srcName} → ${tgtName}: ${primary.reason.split(" — ")[0] ?? primary.reason}`,
      description:   primary.contextSummary,
      severity:      primary.priority === "urgent" ? "critical"
                   : primary.priority === "high"   ? "elevated"
                   : "normal",
      relatedModule: primary.relatedModule,
    });
  }

  // ── 8. Execution bundle events (V2 Foundation) ────────────────────────────
  if (executionBundles && executionBundles.length > 0) {
    const primaryBundle = executionBundles[0]!;

    const bundleEvType: CopilotTimelineEventType =
      primaryBundle.readiness === "blocked"   ? "execution_blocked"   :
      primaryBundle.approvalLevel === "none"  ? "execution_ready"     :
      primaryBundle.approvalLevel === "low"   ? "bundle_created"      :
      "approval_requested";

    const bundleSeverity: TimelineSeverity =
      primaryBundle.readiness === "blocked"                                       ? "critical"  :
      primaryBundle.approvalLevel === "critical" || primaryBundle.approvalLevel === "high" ? "elevated" :
      "normal";

    events.push({
      id:            `bundle-ev-${primaryBundle.id}`,
      timestamp:     new Date(Date.now() - 2 * 60_000), // 2 min ago — most recent prep
      agentId:       context.activeAgentId,
      type:          bundleEvType,
      title:         primaryBundle.readiness === "blocked"
        ? `Ejecución bloqueada — ${primaryBundle.title}`
        : primaryBundle.approvalLevel !== "none"
        ? `Aprobación ${primaryBundle.approvalLevel} requerida — ${primaryBundle.title}`
        : `Bundle listo — ${primaryBundle.title}`,
      description:   primaryBundle.readinessNote,
      severity:      bundleSeverity,
      relatedModule: primaryBundle.affectedModules[0] ?? context.activeModule,
    });
  }

  // ── 9. Strategic memory events (Phase A4) ────────────────────────────────
  if (strategicMemory && strategicMemory.length > 0) {
    // Surface the highest-priority memory entry as a timeline event
    const topMemory = strategicMemory[0]!;

    const memEvType: CopilotTimelineEventType =
      topMemory.type === "recurring_risk"      ? "recurring_issue_detected"   :
      topMemory.type === "unresolved_issue"     ? "recurring_issue_detected"   :
      topMemory.type === "operational_pattern"  ? "memory_pattern_detected"    :
      topMemory.type === "collaboration_pattern"? "strategic_memory_referenced" :
      "memory_referenced";

    const memSeverity: TimelineSeverity =
      topMemory.importance === "critical" ? "critical" :
      topMemory.importance === "high"     ? "elevated"  : "normal";

    events.push({
      id:            `mem-ev-${topMemory.id}`,
      timestamp:     new Date(Date.now() - 10 * 60_000), // 10 min ago — persistent pattern
      agentId:       topMemory.relatedAgents[0] ?? context.activeAgentId,
      type:          memEvType,
      title:         topMemory.title,
      description:   topMemory.summary,
      severity:      memSeverity,
      relatedModule: topMemory.relatedModules[0] ?? context.activeModule,
    });

    // If there's a high-continuity recurring issue, also emit a strategic context update
    if (topMemory.continuityScore >= 75 && topMemory.importance !== "low") {
      events.push({
        id:            `mem-ctx-${topMemory.id}`,
        timestamp:     new Date(Date.now() - 12 * 60_000), // 12 min ago
        agentId:       context.activeAgentId,
        type:          "strategic_context_updated",
        title:         "Contexto estratégico activo",
        description:   `Patrón organizacional de alta continuidad (${topMemory.continuityScore}%) detectado`,
        severity:      "normal",
        relatedModule: topMemory.relatedModules[0] ?? context.activeModule,
      });
    }
  }

  // ── 10. Capability events (Phase B8) ─────────────────────────────────────
  if (capabilityResults && capabilityResults.length > 0) {
    const blocked    = capabilityResults.filter(r => r.availability === "blocked");
    const restricted = capabilityResults.filter(r => r.availability === "restricted");

    if (blocked.length > 0) {
      const primary = blocked[0]!;
      events.push({
        id:            `cap-blocked-${primary.capability.id}`,
        timestamp:     new Date(Date.now() - 9 * 60_000), // 9 min ago
        agentId:       primary.capability.agentId,
        type:          "capability_blocked",
        title:         `Capacidad bloqueada — ${primary.capability.name}`,
        description:   primary.reason ?? "Capacidad no disponible en el contexto actual",
        severity:      primary.capability.riskLevel === "critical" ? "critical" : "elevated",
        relatedModule: primary.capability.supportedModules[0] ?? context.activeModule,
      });
    }

    if (restricted.length > 0 && blocked.length === 0) {
      const primary = restricted[0]!;
      events.push({
        id:            `cap-restricted-${primary.capability.id}`,
        timestamp:     new Date(Date.now() - 8 * 60_000), // 8 min ago
        agentId:       primary.capability.agentId,
        type:          "capability_restricted",
        title:         `Capacidad restringida — ${primary.capability.name}`,
        description:   primary.reason ?? "Requiere aprobación para activar",
        severity:      "normal",
        relatedModule: primary.capability.supportedModules[0] ?? context.activeModule,
      });
    }
  }

  // ── 11. Supervised execution events (Phase 10 — V3) ─────────────────────
  if (supervisedExecution) {
    const ex = supervisedExecution;

    // Primary status event
    const execEvType: CopilotTimelineEventType =
      ex.status === "awaiting_confirmation" ? "confirmation_requested" :
      ex.status === "approved"              ? "execution_approved"     :
      ex.status === "executing"             ? "execution_started"      :
      ex.status === "completed"             ? "execution_completed"    :
      ex.status === "failed"                ? "execution_failed"       :
      ex.status === "rolled_back"           ? "rollback_requested"     :
      "execution_prepared";

    const execSeverity: TimelineSeverity =
      ex.status === "failed"                                 ? "critical" :
      ex.status === "awaiting_confirmation" && ex.requiresApproval ? "elevated" :
      "normal";

    events.push({
      id:            `exec-ev-${ex.id}`,
      timestamp:     new Date(Date.now() - 1 * 60_000), // 1 min ago — most recent
      agentId:       ex.agentId,
      type:          execEvType,
      title:         summarizeExecStatus(ex.status, ex.executionMode),
      description:   ex.governanceSummary,
      severity:      execSeverity,
      relatedModule: ex.actions[0]?.targetModule ?? context.activeModule,
    });

    // Rollback available event if relevant
    if (ex.rollbackAvailable && ex.status !== "rolled_back" && ex.status !== "failed") {
      events.push({
        id:            `rollback-avail-${ex.id}`,
        timestamp:     new Date(Date.now() - 2 * 60_000), // 2 min ago
        agentId:       ex.agentId,
        type:          "rollback_available",
        title:         "Reversión disponible",
        description:   `Bundle "${ex.bundleId.slice(0, 8)}…" puede revertirse si es necesario`,
        severity:      "normal",
        relatedModule: ex.actions[0]?.targetModule ?? context.activeModule,
      });
    }
  } else if (executionLifecycle) {
    // If no supervised execution, surface latest lifecycle event
    const latest = executionLifecycle.events[executionLifecycle.events.length - 1];
    if (latest) {
      const lcEvType: CopilotTimelineEventType =
        latest.type === "approved"            ? "execution_approved"  :
        latest.type === "execution_completed" ? "execution_completed" :
        latest.type === "execution_failed"    ? "execution_failed"    :
        latest.type === "rollback_triggered"  ? "rollback_requested"  :
        "execution_prepared";

      events.push({
        id:            `lc-ev-${latest.id}`,
        timestamp:     new Date(Date.now() - 1 * 60_000),
        agentId:       context.activeAgentId,
        type:          lcEvType,
        title:         latest.summary,
        description:   executionLifecycle.latestSummary,
        severity:      latest.type === "execution_failed" ? "critical" : "normal",
        relatedModule: context.activeModule,
      });
    }
  }

  // Sort newest first, take top 5
  return events
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 5);
}

/**
 * Serializes timeline events for safe passing as RSC props.
 * Converts Date → relative time string.
 */
export function serializeTimeline(
  events: CopilotTimelineEvent[],
): CopilotTimelineEventSerial[] {
  return events.map(e => ({
    id:           e.id,
    type:         e.type,
    title:        e.title,
    relativeTime: toRelativeTime(e.timestamp),
    severity:     e.severity,
    module:       e.relatedModule,
  }));
}
