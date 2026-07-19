/**
 * event-source.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Origin identifiers for business events.
 *
 * Sources identify the system layer that produced the event.
 * NOT the business module — the architectural layer.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

/** Where an event originated. */
export type EventSource =
  | "signal_engine"
  | "workflow_engine"
  | "knowledge_graph"
  | "reasoning_engine"
  | "executive_intelligence"
  | "sync_engine"
  | "manual"
  | "external_api"
  | "system"
  | "future_data_warehouse";

/** All valid event sources. */
export const EVENT_SOURCES: readonly EventSource[] = [
  "signal_engine",
  "workflow_engine",
  "knowledge_graph",
  "reasoning_engine",
  "executive_intelligence",
  "sync_engine",
  "manual",
  "external_api",
  "system",
  "future_data_warehouse",
] as const;
