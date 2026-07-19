/**
 * signal-source.ts
 *
 * BUSINESS-SIGNALS-01
 * Origin identifiers for business signals.
 *
 * Every signal must declare where it came from.
 * Sources are NOT modules — they are system layers.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

/**
 * Where a signal originated.
 *
 * These represent system layers, not business modules.
 * A signal from "sag" means SAG sync detected the condition.
 * A signal from "reasoning" means the Reasoning Engine inferred it.
 */
export type SignalSource =
  | "inventory"
  | "workflow"
  | "reasoning"
  | "knowledge_graph"
  | "crm"
  | "sag"
  | "manual"
  | "external_api"
  | "system"
  | "computed"
  | "observation"
  | "future_data_warehouse";

/** All valid signal sources as an array (for validation). */
export const SIGNAL_SOURCES: readonly SignalSource[] = [
  "inventory",
  "workflow",
  "reasoning",
  "knowledge_graph",
  "crm",
  "sag",
  "manual",
  "external_api",
  "system",
  "computed",
  "observation",
  "future_data_warehouse",
] as const;
