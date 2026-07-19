/**
 * lib/tasks/task-assignment.ts
 *
 * Agentik — Task Assignment Helpers
 * Sprint: AGENTIK-TASK-SYSTEM-FOUNDATION-01
 *
 * Pure builder and inspection functions for TaskOwner and TaskAssignment.
 * No database queries. No user validation. Pure structure.
 * No imports from React, Prisma, or Copilot.
 */

import type { TaskOwner, TaskAssignment, TaskOwnerType } from "./task-types";

// ── Builders ──────────────────────────────────────────────────────────────────

/**
 * Create a TaskOwner from parts.
 */
export function createTaskOwner(
  id:   string,
  type: TaskOwnerType,
  name: string,
): TaskOwner {
  return { id, type, name };
}

/**
 * Create a TaskAssignment.
 */
export function createTaskAssignment(
  assignedTo: TaskOwner,
  assignedBy: TaskOwner,
  assignedAt?: string,
  note?:       string,
): TaskAssignment {
  return {
    assignedTo,
    assignedBy,
    assignedAt: assignedAt ?? new Date().toISOString(),
    note,
  };
}

// ── Predicates ────────────────────────────────────────────────────────────────

/**
 * Returns true if the owner is an AI agent.
 */
export function isAssignedToAgent(owner: TaskOwner): boolean {
  return owner.type === "agent";
}

/**
 * Returns true if the owner is a human user.
 */
export function isAssignedToUser(owner: TaskOwner): boolean {
  return owner.type === "user";
}

/**
 * Returns true if the owner is a team.
 */
export function isAssignedToTeam(owner: TaskOwner): boolean {
  return owner.type === "team";
}

// ── Label resolver ────────────────────────────────────────────────────────────

/**
 * Return a human-readable label for a TaskOwner.
 */
export function resolveTaskOwnerLabel(owner: TaskOwner): string {
  switch (owner.type) {
    case "agent":  return `Agente ${owner.name}`;
    case "user":   return owner.name;
    case "team":   return `Equipo ${owner.name}`;
    case "role":   return `Rol: ${owner.name}`;
    case "system": return "Sistema";
  }
}

// ── Well-known owners ─────────────────────────────────────────────────────────

/** System owner for system-generated tasks. */
export const SYSTEM_TASK_OWNER: TaskOwner = createTaskOwner("system", "system", "Sistema");

/** Diego agent owner for Copilot-generated tasks. */
export const DIEGO_TASK_OWNER:  TaskOwner = createTaskOwner("diego",  "agent",  "Diego");

/** Luca agent owner for Marketing-generated tasks. */
export const LUCA_TASK_OWNER:   TaskOwner = createTaskOwner("luca",   "agent",  "Luca");
