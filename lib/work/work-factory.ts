/**
 * lib/work/work-factory.ts
 *
 * Agentik — Work Domain Builders
 * Sprint: AGENTIK-WORK-EXECUTION-FOUNDATION-01
 *
 * Pure factory functions. No Prisma, no React, no side effects.
 */

import type {
  WorkItem,
  WorkExecution,
  WorkArtifact,
  WorkAssignment,
  WorkRelationship,
  WorkContext,
  WorkResult,
  WorkType,
  WorkStatus,
  WorkPriority,
  WorkSource,
  WorkVisibility,
  WorkActor,
  WorkArtifactType,
  WorkExecutionMode,
  WorkRelationshipType,
  WorkActorType,
} from "./work-types";

// ── ID generation ──────────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Well-known actors ─────────────────────────────────────────────────────────

export const SYSTEM_WORK_ACTOR: WorkActor = { id: "system", type: "SYSTEM", name: "Sistema" };
export const DIEGO_WORK_ACTOR:  WorkActor = { id: "diego",  type: "AGENT",  name: "Diego"   };
export const LUCA_WORK_ACTOR:   WorkActor = { id: "luca",   type: "AGENT",  name: "Luca"    };
export const MILA_WORK_ACTOR:   WorkActor = { id: "mila",   type: "AGENT",  name: "Mila"    };

// ── Builders ──────────────────────────────────────────────────────────────────

export function createWorkActor(
  id:   string,
  type: WorkActorType,
  name: string,
): WorkActor {
  return { id, type, name };
}

export function createWorkContext(opts: {
  orgSlug:         string;
  agentId:         string;
  moduleSlug:      string;
  drawerCategory?: string;
  period?:         string;
  contextData?:    Record<string, unknown>;
}): WorkContext {
  return {
    orgSlug:        opts.orgSlug,
    agentId:        opts.agentId,
    moduleSlug:     opts.moduleSlug,
    drawerCategory: opts.drawerCategory,
    period:         opts.period,
    contextData:    opts.contextData,
  };
}

export function createWorkRelationship(
  type:         WorkRelationshipType,
  entityType:   string,
  entityId:     string,
  entityLabel?: string,
): WorkRelationship {
  return { type, entityType, entityId, entityLabel };
}

export function createWorkAssignment(
  assignedTo: WorkActor,
  assignedBy: WorkActor,
  note?:      string,
): WorkAssignment {
  return {
    id:          genId("wka"),
    assignedTo,
    assignedBy,
    assignedAt:  new Date().toISOString(),
    note,
  };
}

export function createWorkItem(opts: {
  type:          WorkType;
  title:         string;
  description?:  string;
  priority?:     WorkPriority;
  source?:       WorkSource;
  visibility?:   WorkVisibility;
  actor:         WorkActor;
  assignment?:   WorkAssignment;
  relationships?: WorkRelationship[];
  context:       WorkContext;
  scheduledAt?:  string;
  dueAt?:        string;
  metadata?:     Record<string, unknown>;
}): WorkItem {
  return {
    id:            genId("wki"),
    type:          opts.type,
    title:         opts.title,
    description:   opts.description,
    priority:      opts.priority   ?? "MEDIUM",
    status:        "PENDING",
    source:        opts.source     ?? "COPILOT",
    visibility:    opts.visibility ?? "ORGANIZATION",
    actor:         opts.actor,
    assignment:    opts.assignment,
    relationships: opts.relationships ?? [],
    context:       opts.context,
    scheduledAt:   opts.scheduledAt,
    dueAt:         opts.dueAt,
    createdAt:     new Date().toISOString(),
    metadata:      opts.metadata ?? {},
  };
}

export function createWorkArtifact(opts: {
  workItemId:   string;
  executionId:  string;
  type:         WorkArtifactType;
  title:        string;
  description?: string;
  payload?:     Record<string, unknown>;
  externalRef?: string;
  mode:         WorkExecutionMode;
  metadata?:    Record<string, unknown>;
}): WorkArtifact {
  return {
    id:          genId("wka"),
    workItemId:  opts.workItemId,
    executionId: opts.executionId,
    type:        opts.type,
    title:       opts.title,
    description: opts.description,
    payload:     opts.payload  ?? {},
    externalRef: opts.externalRef,
    mode:        opts.mode,
    producedAt:  new Date().toISOString(),
    metadata:    opts.metadata ?? {},
  };
}

export function createWorkExecution(opts: {
  workItemId: string;
  mode:       WorkExecutionMode;
  actor:      WorkActor;
  status?:    WorkStatus;
  artifacts?: WorkArtifact[];
  metadata?:  Record<string, unknown>;
}): WorkExecution {
  const now = new Date().toISOString();
  return {
    id:          genId("wke"),
    workItemId:  opts.workItemId,
    mode:        opts.mode,
    status:      opts.status ?? "RUNNING",
    actor:       opts.actor,
    startedAt:   now,
    completedAt: opts.status === "COMPLETED" ? now : undefined,
    artifacts:   opts.artifacts ?? [],
    metadata:    opts.metadata ?? {},
  };
}

export function createWorkResult(opts: {
  success:    boolean;
  status:     WorkStatus;
  message:    string;
  workItem?:  WorkItem;
  execution?: WorkExecution;
  artifacts?: WorkArtifact[];
  errors?:    string[];
  warnings?:  string[];
}): WorkResult {
  return {
    success:   opts.success,
    status:    opts.status,
    message:   opts.message,
    workItem:  opts.workItem,
    execution: opts.execution,
    artifacts: opts.artifacts ?? [],
    errors:    opts.errors,
    warnings:  opts.warnings,
  };
}
