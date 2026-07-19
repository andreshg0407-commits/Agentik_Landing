/**
 * signal-types.ts
 *
 * BUSINESS-SIGNALS-01
 * Core types for the Operational Signal Engine.
 *
 * A Business Signal represents a relevant business condition.
 * It does NOT interpret, execute, alert, or recommend.
 * It declares that a significant operational condition exists.
 *
 * Consumed by: Reasoning, Executive Intelligence, Business Event Engine,
 * David, Copilot, Rule Engine, Action Engine, Workflow Engine.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessEntityType } from "@/lib/business-entities/core";

// -- Signal ID Generation ---------------------------------------------------

let _seq = 0;

/** Generate a unique signal ID with prefix. */
export function nextSignalId(prefix: string = "sig"): string {
  return `${prefix}-${Date.now()}-${++_seq}`;
}

// -- Lightweight entity reference for signals --------------------------------

/**
 * Lightweight entity reference within signal structures.
 * Mirrors EntityRef from business-reasoning for compatibility,
 * but defined independently to avoid circular dependencies.
 */
export interface SignalEntityRef {
  entityId: string;
  entityType: BusinessEntityType;
  label: string;
}
