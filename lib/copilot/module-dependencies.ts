/**
 * lib/copilot/module-dependencies.ts
 *
 * Agentik Copilot — Module Dependency Map
 *
 * Defines how problems in one module propagate to others.
 * Used by the priority engine to amplify scores of signals
 * that have systemic downstream impact.
 *
 * Sprint: AGENTIK-COPILOT-SIGNAL-ENGINE-01
 */

import type { CopilotSignalId } from "./types";

// ── Dependency types ──────────────────────────────────────────────────────────

export type ModuleImpactType =
  | "blocking"       // Unresolved = target module cannot proceed
  | "degrading"      // Unresolved = target module operates with reduced fidelity
  | "financial"      // Unresolved = target module receives incorrect financial data
  | "informational"; // Unresolved = target module loses context, not blocked

export interface ModuleDependency {
  source:         string;          // Module with the problem
  target:         string;          // Module downstream-affected
  impactType:     ModuleImpactType;
  severityWeight: number;          // 0–100: how much source problem matters to target
}

// ── Dependency registry ───────────────────────────────────────────────────────

export const MODULE_DEPENDENCIES: ModuleDependency[] = [

  // ── Conciliación → downstream ───────────────────────────────────────────────
  // Unresolved exceptions in conciliación directly block cierre
  { source: "conciliacion", target: "cierre",     impactType: "blocking",     severityWeight: 95 },
  // Unresolved gaps cause treasury balances to be wrong
  { source: "conciliacion", target: "tesoreria",  impactType: "financial",    severityWeight: 78 },
  // Reporting in executive uses reconciled data
  { source: "conciliacion", target: "executive",  impactType: "degrading",    severityWeight: 60 },

  // ── Tesorería → downstream ─────────────────────────────────────────────────
  // Critical treasury state affects ability to close financials
  { source: "tesoreria",    target: "cierre",     impactType: "financial",    severityWeight: 72 },
  // Cash projections in planeación are unreliable if treasury is stale
  { source: "tesoreria",    target: "planeacion", impactType: "financial",    severityWeight: 65 },
  // KPIs in executive are affected
  { source: "tesoreria",    target: "executive",  impactType: "degrading",    severityWeight: 55 },

  // ── Cierre → downstream ────────────────────────────────────────────────────
  // If close is blocked, executive reporting is incomplete
  { source: "cierre",       target: "executive",  impactType: "blocking",     severityWeight: 65 },
  // Planning can't use confirmed actuals if close is pending
  { source: "cierre",       target: "planeacion", impactType: "financial",    severityWeight: 50 },

  // ── Planeación → downstream ────────────────────────────────────────────────
  // If budgets are off, treasury projections diverge from plan
  { source: "planeacion",   target: "tesoreria",  impactType: "informational", severityWeight: 42 },
  // Budget variance affects what can be done at close
  { source: "planeacion",   target: "cierre",     impactType: "financial",     severityWeight: 48 },

  // ── Marketing → downstream ─────────────────────────────────────────────────
  // Marketing budget over-run puts pressure on financial planning
  { source: "marketing-studio", target: "planeacion",  impactType: "financial",   severityWeight: 62 },
  // Under-performing campaigns reduce sales velocity
  { source: "marketing-studio", target: "sales",       impactType: "degrading",   severityWeight: 55 },
  // Ecommerce campaigns affect Shopify/integrations performance
  { source: "marketing-studio", target: "integrations", impactType: "degrading",  severityWeight: 40 },

  // ── Ventas → downstream ────────────────────────────────────────────────────
  // Sales pipeline affects expected cash inflows
  { source: "sales",        target: "tesoreria",  impactType: "financial",     severityWeight: 52 },
  // Stalled pipeline affects executive KPIs
  { source: "sales",        target: "executive",  impactType: "degrading",     severityWeight: 48 },

  // ── Integraciones → downstream ─────────────────────────────────────────────
  // Broken Shopify sync affects sales records
  { source: "integrations", target: "sales",      impactType: "degrading",     severityWeight: 45 },
  // Missing orders affect collections
  { source: "integrations", target: "tesoreria",  impactType: "financial",     severityWeight: 38 },
];

// ── Signal → source module mapping ────────────────────────────────────────────

/**
 * Maps each signal rule to the module where the problem originates.
 * Used to look up downstream dependencies for that source module.
 */
export const SIGNAL_SOURCE_MODULE: Record<CopilotSignalId, string> = {
  "budget.velocity_exceeded":         "planeacion",
  "treasury.low_coverage":            "tesoreria",
  "financial_close.blocked":          "conciliacion", // problem is in conciliacion, manifest in cierre
  "reconciliation.pending_critical":  "conciliacion",
};

/**
 * Returns all modules that are downstream-affected by a signal's source module.
 * Returns blocking + financial impacts only (most critical cascade types).
 */
export function getDownstreamModules(signalId: CopilotSignalId): string[] {
  const sourceModule = SIGNAL_SOURCE_MODULE[signalId];
  return MODULE_DEPENDENCIES
    .filter(d => d.source === sourceModule && (d.impactType === "blocking" || d.impactType === "financial"))
    .map(d => d.target);
}

/**
 * Returns the maximum severity weight of all downstream dependencies for a source module.
 * Used to compute moduleWeight in signal priority scoring.
 */
export function getMaxDownstreamWeight(signalId: CopilotSignalId): number {
  const sourceModule = SIGNAL_SOURCE_MODULE[signalId];
  const weights = MODULE_DEPENDENCIES
    .filter(d => d.source === sourceModule)
    .map(d => d.severityWeight);
  return weights.length > 0 ? Math.max(...weights) : 0;
}
