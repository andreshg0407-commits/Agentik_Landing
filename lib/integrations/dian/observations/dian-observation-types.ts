/**
 * dian-observation-types.ts
 *
 * AGENTIK-DIAN-OBSERVATIONS-01
 * DIAN Integration Layer — Fiscal Observation Types
 *
 * Parallel type surface to `lib/financial/memory-model.ts` CopilotObservation,
 * specialized for fiscal (DIAN) operational observations.
 *
 * Philosophy (mirrors financial observation engine):
 *   - Every observation is a factual statement derived from verified data
 *   - No AI, no scoring, no invented anomalies
 *   - Confidence is always RULE_BASED
 *   - Every message includes: what, how long, what changed
 *   - Severity escalates with duration and repetition
 *   - Silence is the signal for nominal state
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { DianEnvironment } from "../types/dian-types";
import type { DianSyncOperation } from "../sync/dian-sync-types";

// ── Observation type registry ─────────────────────────────────────────────────

/**
 * All fiscal observation categories.
 *
 * Categories:
 *   CERT_*       — Certificate health (from certExpiresAt in fiscal memory)
 *   FAULT_*      — SOAP/auth failure patterns (from recentOutcomes ring buffer)
 *   LATENCY_*    — Latency health (from recentLatencies ring buffer)
 *   SYNC_*       — Sync activity patterns (from lastRunAt, streaks)
 *   RETRY_*      — Retry behavior (from retryStreak, recentOutcomes.retryCount)
 *   STABLE_*     — Positive/quiet operational states
 *   MEMORY_*     — Honest state when data is insufficient for pattern detection
 */
export type FiscalObservationType =
  // Certificate health
  | "cert_expired"             // certExpiresAt is in the past
  | "cert_expiring_soon"       // certExpiresAt within 30 days
  | "cert_health_unknown"      // no certExpiresAt recorded yet
  // Failure patterns
  | "repeated_soap_fault"      // SOAP_FAULT appearing ≥3 times in last 10 outcomes
  | "repeated_wsse_failure"    // WSSE_SIGNING_FAILED appearing ≥2 times in last 10
  | "repeated_auth_failure"    // repeated non-retryable auth-class errors
  | "unstable_environment"     // success rate < 50% over last 10 outcomes
  // Latency
  | "latency_degradation"      // avg latency of last 5 > avg of previous 5 by ≥50%
  // Sync activity
  | "stale_fiscal_sync"        // no completed sync in last N days
  | "tenant_never_synced"      // integration exists but recentOutcomes is empty
  // Retry behavior
  | "retry_escalation"         // retryStreak ≥ 3 consecutive syncs with retries
  // Positive / quiet
  | "sync_recovery"            // operationalStreak ≥ 3 after previous failures
  | "stable_fiscal_ops"        // high success rate + long operational streak
  // Honest baseline
  | "fiscal_memory_building";  // fewer than 5 completed syncs — insufficient for patterns

// ── Severity ─────────────────────────────────────────────────────────────────

/**
 * 5-tier operational severity — matches financial observation engine.
 *
 *   ok        — Positive signal. Something improved or is stable.
 *   info      — Neutral. Honest state; no action required.
 *   watch     — Low attention. Monitor; no immediate action.
 *   elevated  — Action recommended. Pattern persisting.
 *   critical  — Urgent. Immediate attention required.
 */
export type FiscalObservationSeverity = "ok" | "info" | "watch" | "elevated" | "critical";

// ── Main observation type ─────────────────────────────────────────────────────

/**
 * A single deterministic fiscal operational observation.
 *
 * Always derivable from:
 *   - DianFiscalMemoryEntry (Integration.metaJson)
 *   - DianSyncOutcomeEntry[] ring buffer
 *   - TenantDianIntegration (cert metadata, env, status)
 *
 * Never derived from:
 *   - LLMs, ML models, heuristic scoring
 *   - Raw SOAP envelopes, private keys, signed XML
 *   - Cross-tenant data (every observation is strictly per-org)
 */
export interface FiscalObservation {
  /** Unique ID per generation — not persisted to DB. */
  observationId:   string;
  organizationId:  string;
  integrationId:   string;
  environment:     DianEnvironment;
  operation:       DianSyncOperation;
  generatedAt:     string;               // ISO
  observationType: FiscalObservationType;
  severity:        FiscalObservationSeverity;
  /**
   * Precise, factual message in Spanish.
   * Always includes: what + how long/how many + what changed.
   * Example: "Castillitos habilitación: 4 SOAP faults en los últimos 7 intentos."
   */
  message:         string;
  /**
   * Evidence string — what data backs this observation.
   * Example: "recentOutcomes[0..6]: SOAP_FAULT × 4, HTTP_TIMEOUT × 1, succeeded × 2"
   */
  evidence:        string;
  suggestedAction: string | null;
  /** Always RULE_BASED — no AI, no ML, no fabrication. */
  confidence:      "RULE_BASED";
  /** How many sync outcomes were analyzed (honest minimum count). */
  basedOnOutcomes: number;
}

// ── Grouped observation ───────────────────────────────────────────────────────

/**
 * A synthesis of ≥1 FiscalObservations of the same type across ≥1 tenants.
 * Used for multi-tenant observation grouping (Task 8).
 */
export interface FiscalObservationGroup {
  observationType:  FiscalObservationType;
  severity:         FiscalObservationSeverity;
  tenantCount:      number;
  organizationIds:  string[];
  /** Synthesized summary message across all tenants in the group. */
  message:          string;
  /** Highest basedOnOutcomes across grouped observations. */
  maxBasedOnOutcomes: number;
}

// ── Escalation level ──────────────────────────────────────────────────────────

/**
 * Fiscal escalation level — parallel to EscalationLevel in attention-router.ts.
 *
 *   urgent    — At least one critical observation (cert expired, etc.)
 *   elevated  — At least one elevated, or ≥3 watch observations
 *   watch     — At least one watch observation
 *   positive  — Only ok observations; nothing to act on
 *   building  — Only memory_building; history accumulating
 *   quiet     — No observations generated; all nominal
 */
export type FiscalEscalationLevel =
  | "urgent"
  | "elevated"
  | "watch"
  | "positive"
  | "building"
  | "quiet";

// ── Attention result ──────────────────────────────────────────────────────────

/**
 * Full output of the fiscal observation router for one org or a group of orgs.
 */
export interface FiscalAttentionResult {
  primaryObservation:  FiscalObservation | null;
  groupedSignals:      FiscalObservationGroup[];
  escalationLevel:     FiscalEscalationLevel;
  headline:            string;
  context:             string;
  affectedTenants:     number;
  quietCount:          number;          // observations collapsed (not shown individually)
  recommendedAction:   string | null;
}

// ── Input types (engine inputs — pre-fetched by loader) ───────────────────────

/**
 * Pre-fetched input for the fiscal observation engine.
 * Caller (loader) does the Prisma reads; engine is pure.
 */
export interface FiscalObservationInput {
  organizationId: string;
  integrationId:  string;
  environment:    DianEnvironment;
  operation:      DianSyncOperation;
  /** From Integration.metaJson fiscalSync[operation][environment]. Null if no syncs recorded. */
  fiscalMemory:   import("../sync/dian-sync-types").DianFiscalMemoryEntry | null;
  /** Integration status and cert metadata. */
  integrationStatus: "ready" | "habilitacion" | "not_configured" | "suspended" | "error";
  certExpiresAt?: string;              // from TenantDianIntegration.certificates[].expiresAt
}

// ── Future reconciliation readiness markers ───────────────────────────────────

/**
 * Data contracts that future conciliation will consume from this module.
 *
 * INTENTIONALLY NOT IMPLEMENTED — documented here as architecture guide for
 * the Conciliación Inteligente sprint that follows this sprint.
 *
 * Each key maps to the fiscal observation data that will feed into
 * the corresponding reconciliation concern.
 */
export const FISCAL_RECONCILIATION_READINESS = {
  /**
   * XML ↔ banco:
   * FiscalObservation.observationType can signal "sync healthy" before
   * attempting bank ↔ XML cross-reference.
   * Consumer: reconciliation-engine.ts → dianSyncHealthGate()
   */
  dianXmlBancoGate: "FiscalObservation[stable_fiscal_ops | sync_recovery]",

  /**
   * CUFE ↔ ERP:
   * DianFiscalMemoryEntry.operationalStreak signals that GetAcquirer
   * responses are consistently valid — safe to correlate with ERP data.
   * Consumer: cufe-validator.ts → operationalStreakThreshold(5)
   */
  cufeErpCorrelation: "DianFiscalMemoryEntry.operationalStreak >= 5",

  /**
   * Fiscal-bank reconciliation:
   * DianSyncOutcomeEntry[] ring buffer provides timing data for
   * reconciling DIAN sync windows against bank statement windows.
   * Consumer: fiscal-bank-reconciler.ts → syncWindowFromOutcomes()
   */
  fiscalBankWindow: "DianSyncOutcomeEntry[].at timestamps for window correlation",

  /**
   * XML ↔ SAG:
   * Future sprint — not yet designed.
   * Blocker: SAG integration must expose invoice-level data.
   */
  xmlSagCorrelation: "FUTURE — requires SAG invoice-level adapter",
} as const;
