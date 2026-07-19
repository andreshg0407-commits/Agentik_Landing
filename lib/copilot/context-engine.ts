/**
 * lib/copilot/context-engine.ts
 *
 * Agentik Copilot — Operational Context Engine V1
 *
 * Builds a unified OperationalContext from the signal engine result.
 * V1: all data derived from SignalEngineResult (no additional DB queries).
 * V2: will incorporate real-time Prisma snapshots per sub-context.
 *
 * Single source of truth for Copilot's understanding of tenant state.
 * All consumer layers (priority, decision, next-step engines) read from here.
 *
 * Sprint: AGENTIK-COPILOT-SIGNAL-ENGINE-01
 */

import type { CopilotSignal, CopilotRuntimeState, SignalEngineResult } from "./types";
import { getAgentForPathname, getMemoryHints } from "./agents";
import { resolveAgentForRoute } from "@/lib/agentik-agents/agent-resolver";

// ── Sub-context types ─────────────────────────────────────────────────────────

export interface TenantOperationalContext {
  orgSlug:                 string;
  activeModules:           string[];
  tenantHealth:            "healthy" | "degraded" | "critical";
  runtimeState:            CopilotRuntimeState;
  detectedRisks:           number;  // total active signals
  activeCriticalSignals:   number;
  activeWarnings:          number;
  unresolvedTasks:         number;  // V1: derived from signals
  staleModules:            string[];
  lastOperationalActivity: Date;
}

export interface FinanceOperationalContext {
  treasuryStatus:      "healthy" | "at_risk" | "critical";
  runwayDays:          number;        // Estimated operational coverage days
  pendingConciliations: number;       // Open critical exceptions
  blockedClose:        boolean;
  closeBlockedDays:    number;        // Days since oldest exception caused blockage
  budgetsAtRisk:       number;        // Count of budget plans with velocity issues
  budgetVelocityRatio: number;        // Actual/budget pace ratio (>1 = over-executing)
  overBudgetAreas:     string[];      // Budget categories over-executing
  underBudgetAreas:    string[];      // Budget categories under-executing
  pendingCollections:  number;        // Value of expected inflows (COP)
  riskLevel:           "low" | "medium" | "high" | "critical";
  financialPulse:      "positive" | "neutral" | "negative";
}

export interface OperationsOperationalContext {
  activeIncidents:        number;
  operationalBottlenecks: string[];   // e.g. ["cierre-financiero"]
  fulfillmentRisk:        boolean;
  dispatchDelays:         number;
  inventoryAlerts:        number;
  processingLoad:         "low" | "normal" | "high" | "overloaded";
}

export interface CommercialOperationalContext {
  salesVelocity:       "accelerating" | "stable" | "slowing" | "stalled";
  leadFlow:            "healthy" | "declining" | "stalled";
  stalledDeals:        number;
  ecommerceStatus:     "operational" | "degraded" | "offline";
  campaignPerformance: "exceeding" | "on_track" | "underperforming";
  customerRisk:        "low" | "medium" | "high";
}

export interface SystemOperationalContext {
  integrationsHealthy:   boolean;
  staleSyncs:            string[];
  failedAutomations:     number;
  pendingApprovals:      number;
  degradedModules:       string[];
  disconnectedSources:   string[];
}

export interface OperationalContext {
  tenant:     TenantOperationalContext;
  finance:    FinanceOperationalContext;
  operations: OperationsOperationalContext;
  commercial: CommercialOperationalContext;
  system:     SystemOperationalContext;
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Builds a complete OperationalContext from available signal + alert data.
 * Pure function — deterministic, no I/O, no side effects.
 */
export function buildOperationalContext(
  orgSlug:          string,
  signalResult:     SignalEngineResult,
  openAlertCount:   number,
  pendingApprovals: number,
): OperationalContext {
  const signals        = signalResult.signals;
  const criticalSigs   = signals.filter(s => s.severity === "critica");
  const warningSigs    = signals.filter(s => s.severity === "elevada" || s.severity === "vigilancia");

  // ── Extract per-rule signals ──────────────────────────────────────────────
  const treasurySig = signals.find(s => s.ruleId === "treasury.low_coverage");
  const closeSig    = signals.find(s => s.ruleId === "financial_close.blocked");
  const budgetSig   = signals.find(s => s.ruleId === "budget.velocity_exceeded");
  const reconSig    = signals.find(s => s.ruleId === "reconciliation.pending_critical");

  // ── Narrow evidence types via discriminant ────────────────────────────────
  const treasuryEv = treasurySig?.evidence.type === "treasury_coverage"      ? treasurySig.evidence  : null;
  const closeEv    = closeSig?.evidence.type    === "financial_close_blocked" ? closeSig.evidence     : null;
  const budgetEv   = budgetSig?.evidence.type   === "budget_velocity"         ? budgetSig.evidence    : null;
  const reconEv    = reconSig?.evidence.type    === "reconciliation_critical"  ? reconSig.evidence    : null;

  // ── Derived financial values ──────────────────────────────────────────────
  const runwayDays         = treasuryEv?.coverageDays     ?? 90;   // 90 = healthy default
  const blockedClose       = closeSig !== undefined;
  const closeBlockedDays   = closeEv?.oldestExceptionDays ?? 0;
  const pendingConciliations = reconEv?.openCriticalCount ?? 0;
  const budgetVelocityRatio = budgetEv?.velocityRatio     ?? 1.0;  // 1.0 = on-track
  const budgetAtRiskCount  = budgetSig ? 1 : 0;

  const overBudgetAreas:  string[] = budgetEv && budgetVelocityRatio > 1.0 ? [budgetEv.category] : [];
  const underBudgetAreas: string[] = budgetEv && budgetVelocityRatio < 0.8 ? [budgetEv.category] : [];

  // ── Derived risk classifications ──────────────────────────────────────────
  const riskLevel: FinanceOperationalContext["riskLevel"] =
    criticalSigs.length >= 2 ? "critical" :
    criticalSigs.length === 1 ? "high"    :
    warningSigs.length  >  0  ? "medium"  : "low";

  const financialPulse: FinanceOperationalContext["financialPulse"] =
    riskLevel === "critical" || riskLevel === "high" ? "negative" :
    riskLevel === "medium"                           ? "neutral"  : "positive";

  const treasuryStatus: FinanceOperationalContext["treasuryStatus"] =
    runwayDays < 15 ? "critical" : runwayDays < 30 ? "at_risk" : "healthy";

  const tenantHealth: TenantOperationalContext["tenantHealth"] =
    criticalSigs.length > 0 ? "critical" :
    warningSigs.length  > 0 ? "degraded" : "healthy";

  const processingLoad: OperationsOperationalContext["processingLoad"] =
    pendingConciliations > 10 ? "overloaded" :
    pendingConciliations > 5  ? "high"       :
    pendingConciliations > 0  ? "normal"     : "low";

  // ── Assemble context ──────────────────────────────────────────────────────
  return {
    tenant: {
      orgSlug,
      activeModules: ["finanzas/tesoreria", "finanzas/conciliacion", "finanzas/cierre", "finanzas/planeacion"],
      tenantHealth,
      runtimeState:              signalResult.runtime.state,
      detectedRisks:             signals.length + openAlertCount,
      activeCriticalSignals:     criticalSigs.length,
      activeWarnings:            warningSigs.length,
      unresolvedTasks:           signals.length, // V1: 1 task per signal
      staleModules:              signalResult.runtime.degradedRules.map(r => r.split(".")[0]),
      lastOperationalActivity:   signalResult.evaluatedAt,
    },
    finance: {
      treasuryStatus,
      runwayDays,
      pendingConciliations,
      blockedClose,
      closeBlockedDays,
      budgetsAtRisk:      budgetAtRiskCount,
      budgetVelocityRatio,
      overBudgetAreas,
      underBudgetAreas,
      pendingCollections: treasuryEv?.pendingInflow ?? 0,
      riskLevel,
      financialPulse,
    },
    operations: {
      activeIncidents:        criticalSigs.length,
      operationalBottlenecks: blockedClose ? ["cierre-financiero"] : [],
      fulfillmentRisk:        false,     // V2: from inventory/fulfillment module
      dispatchDelays:         0,         // V2: from logistics module
      inventoryAlerts:        0,         // V2: from inventory module
      processingLoad,
    },
    commercial: {
      salesVelocity:       "stable",      // V2: from sales module
      leadFlow:            "healthy",     // V2: from pipeline module
      stalledDeals:        0,             // V2: from pipeline module
      ecommerceStatus:     "operational", // V2: from integrations module
      campaignPerformance: "on_track",    // V2: from marketing module
      customerRisk:        "low",         // V2: from customer-360 module
    },
    system: {
      integrationsHealthy: signalResult.runtime.degradedRules.length === 0,
      staleSyncs:          [],
      failedAutomations:   0,
      pendingApprovals,
      degradedModules:     signalResult.runtime.degradedRules.map(r => String(r)),
      disconnectedSources: [],
    },
  };
}

// ── Context Snapshot layer ────────────────────────────────────────────────────
//
// Richer, orchestration-level snapshot used by the Context Orchestration layer.
// Builds on top of OperationalContext but adds:
//   - active module + submodule resolution
//   - active agent identity
//   - operational priority classification
//   - context confidence scoring

export type OperationalPriority = "critical" | "elevated" | "normal" | "idle";

export interface CopilotContextSnapshot {
  orgSlug:             string;
  pathname:            string;
  activeModule:        string;       // e.g. "finanzas/tesoreria"
  activeSubmodule:     string;       // e.g. "tesoreria"
  activeAgentId:       string;       // e.g. "diego"
  activeAgentName:     string;       // e.g. "Diego"
  tenantState:         "healthy" | "degraded" | "critical";
  runtimeState:        CopilotRuntimeState;
  primarySignal:       CopilotSignal | null;
  secondarySignals:    CopilotSignal[];
  suggestedActionIds:  string[];     // Action IDs from execution registry
  memoryHints:         string[];     // Capability hints for active module
  operationalPriority: OperationalPriority;
  contextConfidence:   number;       // 0–100
}

// ── Module path helpers ───────────────────────────────────────────────────────

/**
 * Derives the active module path from a pathname.
 * e.g. "/castillitos/finanzas/tesoreria" → "finanzas/tesoreria"
 */
export function getActiveModuleFromPath(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean).slice(1); // drop orgSlug
  return segs.slice(0, 2).join("/") || segs[0] || "dashboard";
}

/**
 * Derives the active submodule from a pathname.
 * e.g. "/castillitos/finanzas/tesoreria/cobros-hoy" → "tesoreria"
 */
export function getActiveSubmoduleFromPath(pathname: string): string {
  const segs = pathname.split("/").filter(Boolean).slice(1); // drop orgSlug
  return segs[1] ?? segs[0] ?? "dashboard";
}

// ── Priority resolver ─────────────────────────────────────────────────────────

/**
 * Resolves operational priority from active signals.
 * Used to color-code the context snapshot and drive recommendation routing.
 */
export function resolveOperationalPriority(signals: CopilotSignal[]): OperationalPriority {
  if (signals.some(s => s.severity === "critica"))    return "critical";
  if (signals.some(s => s.severity === "elevada"))    return "elevated";
  if (signals.some(s => s.severity === "vigilancia")) return "normal";
  if (signals.length > 0)                             return "normal";
  return "idle";
}

// ── Context confidence ────────────────────────────────────────────────────────

function computeContextConfidence(
  runtimeState: CopilotRuntimeState,
  signals:      CopilotSignal[],
): number {
  const base: Record<CopilotRuntimeState, number> = {
    HEALTHY:  90,
    SYNCING:  72,
    STALE:    58,
    DEGRADED: 35,
  };
  const b = base[runtimeState] ?? 60;
  // Having signals increases confidence — they're evidence, not uncertainty
  const sigBoost = signals.length > 0 ? 4 : 0;
  return Math.min(100, b + sigBoost);
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Builds a CopilotContextSnapshot — the unified orchestration input for all
 * context-aware layers (cross-module intelligence, recommendations, personas).
 * Pure function — no I/O, no side effects.
 */
export function buildCopilotContextSnapshot(
  orgSlug:          string,
  pathname:         string,
  signalResult:     SignalEngineResult,
  openAlertCount:   number,
  pendingApprovals: number,
): CopilotContextSnapshot {
  const signals = signalResult.signals;

  // Re-use OperationalContext for tenant health derivation
  const opCtx = buildOperationalContext(orgSlug, signalResult, openAlertCount, pendingApprovals);

  const activeModule    = getActiveModuleFromPath(pathname);
  const activeSubmodule = getActiveSubmoduleFromPath(pathname);
  // V2: use canonical resolver for consistent agent identity across all copilot layers
  const resolved    = resolveAgentForRoute({ pathname, orgSlug });
  const agent       = resolved.agent;
  const legacyAgent = getAgentForPathname(pathname); // kept only for memoryHints (legacy)
  const memoryHints = getMemoryHints(legacyAgent, pathname);

  const primarySignal    = signals[0]  ?? null;
  const secondarySignals = signals.slice(1);

  return {
    orgSlug,
    pathname,
    activeModule,
    activeSubmodule,
    activeAgentId:       agent.id,
    activeAgentName:     agent.name,
    tenantState:         opCtx.tenant.tenantHealth,
    runtimeState:        signalResult.runtime.state,
    primarySignal,
    secondarySignals,
    suggestedActionIds:  [],   // Populated by execution registry after snapshot is built
    memoryHints,
    operationalPriority: resolveOperationalPriority(signals),
    contextConfidence:   computeContextConfidence(signalResult.runtime.state, signals),
  };
}
