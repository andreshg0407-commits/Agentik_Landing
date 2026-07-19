/**
 * lib/copilot/decision/copilot-decision-adapter.ts
 *
 * Agentik — Copilot → Decision Engine Adapter
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * Converts a CopilotViewModel snapshot (or a minimal snapshot fixture)
 * into a DecisionContext that can be fed to runDecisionEngine().
 *
 * Responsibilities:
 *   - Map agent identity from the ViewModel to DecisionContext
 *   - Map attention items / insights to DecisionSignal[]
 *   - Map active work / pending approvals to the lightweight refs
 *
 * This adapter does NOT:
 *   - Import Prisma
 *   - Import server services
 *   - Call runDecisionEngine() — the caller does that
 *   - Produce side effects of any kind
 *
 * Pure. Safe to import from any layer.
 */

import type { DecisionContext }   from "../../decisions/decision-context";
import type { DecisionSignal }    from "../../decisions/decision-signals";
import type { DecisionDomain, DecisionSeverity } from "../../decisions/decision-types";

// ── Snapshot shape ────────────────────────────────────────────────────────────

/**
 * Minimal snapshot that the adapter reads.
 * Matches the public fields of CopilotViewModel — but typed loosely
 * so this file does not create a hard dependency on viewmodel internals.
 */
export interface CopilotDecisionSnapshot {
  leadAgent?: {
    agentId:   string;
    agentName: string;
    role?:     string;
  } | null;
  module:  string;
  screen?: string;
  /** Attention items that may map to signals. */
  attentionItems?: Array<{
    id:          string;
    title?:      string;
    description?: string;
    severity?:   string;
    domain?:     string;
    entityType?: string;
    entityId?:   string;
    metadata?:   Record<string, unknown>;
  }>;
  /** Active work items — map to activeTasks in context. */
  activeWork?: Array<{
    id:          string;
    title?:      string;
    status?:     string;
    domain?:     string;
    entityType?: string;
    entityId?:   string;
    createdAt?:  string;
  }>;
  /** Pending approvals — map to pendingApprovals in context. */
  pendingApprovals?: Array<{
    id:          string;
    title?:      string;
    status?:     string;
    entityType?: string;
    entityId?:   string;
    createdAt?:  string;
  }>;
  /** Extra signals to inject directly (not derived from attention items). */
  extraSignals?: DecisionSignal[];
  /** Org context. */
  orgSlug:      string;
  businessDate?: string;
  metadata?:    Record<string, unknown>;
}

// ── Severity mapper ───────────────────────────────────────────────────────────

function mapSeverity(raw: string | undefined): DecisionSeverity {
  const upper = (raw ?? "").toUpperCase();
  if (upper === "CRITICAL") return "CRITICAL";
  if (upper === "HIGH")     return "HIGH";
  if (upper === "MEDIUM")   return "MEDIUM";
  if (upper === "LOW")      return "LOW";
  return "INFO";
}

// ── Domain mapper ─────────────────────────────────────────────────────────────

const DOMAIN_MAP: Record<string, DecisionDomain> = {
  finanzas:       "FINANCE",
  finance:        "FINANCE",
  collections:    "COLLECTIONS",
  cobros:         "COLLECTIONS",
  commercial:     "COMMERCIAL",
  comercial:      "COMMERCIAL",
  marketing:      "MARKETING",
  operations:     "OPERATIONS",
  operaciones:    "OPERATIONS",
  management:     "MANAGEMENT",
  system:         "SYSTEM",
};

function mapDomain(raw: string | undefined): DecisionDomain {
  if (!raw) return "SYSTEM";
  return DOMAIN_MAP[raw.toLowerCase()] ?? "SYSTEM";
}

// ── Adapter ───────────────────────────────────────────────────────────────────

let _sigSeq = 0;

/**
 * Convert a CopilotDecisionSnapshot into a DecisionContext.
 *
 * The caller is responsible for providing any additional signals
 * (e.g. from a business scan) via snapshot.extraSignals.
 */
export function buildDecisionContextFromCopilotSnapshot(
  snapshot: CopilotDecisionSnapshot,
): DecisionContext {
  const agentId   = snapshot.leadAgent?.agentId   ?? "system";
  const agentName = snapshot.leadAgent?.agentName ?? "System";

  // Map attention items → signals
  const attentionSignals: DecisionSignal[] = (snapshot.attentionItems ?? []).map(item => {
    _sigSeq++;
    return {
      id:          item.id || `sig_att_${_sigSeq}_${Date.now()}`,
      domain:      mapDomain(item.domain ?? snapshot.module),
      source:      "AGENT" as const,
      type:        "custom",
      title:       item.title       ?? "Atención requerida",
      description: item.description ?? "",
      severity:    mapSeverity(item.severity),
      detectedAt:  new Date().toISOString(),
      entityType:  item.entityType,
      entityId:    item.entityId,
      metadata:    item.metadata,
    };
  });

  // Merge with extra signals
  const signals: DecisionSignal[] = [
    ...attentionSignals,
    ...(snapshot.extraSignals ?? []),
  ];

  // Map activeWork → activeTasks
  const activeTasks = (snapshot.activeWork ?? []).map(w => ({
    id:          w.id,
    title:       w.title       ?? "",
    status:      w.status      ?? "OPEN",
    domain:      w.domain,
    entityType:  w.entityType,
    entityId:    w.entityId,
    createdAt:   w.createdAt   ?? new Date().toISOString(),
  }));

  // Map pendingApprovals
  const pendingApprovals = (snapshot.pendingApprovals ?? []).map(a => ({
    id:          a.id,
    title:       a.title       ?? "",
    status:      a.status      ?? "PENDING",
    entityType:  a.entityType,
    entityId:    a.entityId,
    createdAt:   a.createdAt   ?? new Date().toISOString(),
  }));

  return {
    orgSlug:          snapshot.orgSlug,
    module:           snapshot.module,
    agentId,
    agentName,
    businessDate:     snapshot.businessDate ?? new Date().toISOString().slice(0, 10),
    signals,
    activeTasks,
    pendingApprovals,
    recentExecutions: [],
    workflowRuns:     [],
    metadata:         snapshot.metadata ?? {},
  };
}
