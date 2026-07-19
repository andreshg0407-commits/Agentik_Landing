/**
 * lib/finance/runtime-events.ts
 *
 * FASE 1 — Financial Runtime Event Layer
 *
 * Type contracts for the live financial event system.
 * Every event derives from real state deltas — nothing invented.
 *
 * Sprint: AGENTIK-FINANCIAL-LIVE-ORCHESTRATION-01
 */

// ── Event classification ──────────────────────────────────────────────────────

export type FinancialRuntimeEventType =
  | "RECON_BREAK"
  | "LOW_CONFIDENCE"
  | "STALE_SOURCE"
  | "CLOSE_BLOCKER"
  | "BANK_UNMATCHED"
  | "LIQUIDITY_RISK"
  | "DIAN_STALE"
  | "SYNC_RESTORED"
  | "GRAPH_DEGRADED"
  | "GRAPH_RECOVERED";

export type FinancialRuntimeSeverity =
  | "critical"
  | "warning"
  | "info";

// ── Event shape ───────────────────────────────────────────────────────────────

export interface FinancialRuntimeEvent {
  id:                 string;
  organizationId:     string;

  type:               FinancialRuntimeEventType;
  severity:           FinancialRuntimeSeverity;

  title:              string;
  summary:            string;

  /** Prisma model or runtime that produced this event. */
  source?:            string;

  /** Current confidence value (0–1). */
  confidence?:        number;
  /** Previous confidence before this event (0–1). */
  previousConfidence?: number;

  createdAt:          Date;

  /** true = ready for n8n / webhook / WhatsApp dispatch. */
  eventDispatchable:  boolean;

  // ── FASE 7: Temporal evolution metadata (optional) ────────────────────────
  /** Whether this event is new, worsening, recurring, recovered, or stabilized. */
  evolutionState?:    "new" | "worsening" | "recurring" | "recovered" | "stabilized";
  /** Pattern ID if this event belongs to a detected temporal pattern. */
  patternId?:         string;
}

// ── Dispatchable event payload (for n8n / webhooks) ───────────────────────────

export interface DispatchableFinancialEvent {
  eventId:        string;
  organizationId: string;
  type:           FinancialRuntimeEventType;
  severity:       FinancialRuntimeSeverity;
  title:          string;
  summary:        string;
  source?:        string;
  confidence?:    number;
  occurredAt:     string; // ISO
  /** Pre-built webhook payload — ready for n8n HTTP node. */
  webhookPayload: {
    event:          string;
    org:            string;
    severity:       string;
    message:        string;
    timestamp:      string;
    metadata:       Record<string, unknown>;
  };
}

// ── Event ID builder ──────────────────────────────────────────────────────────

/** Deterministic event ID — same org + type + minute → same ID (dedup key). */
export function buildEventId(
  orgId:   string,
  type:    FinancialRuntimeEventType,
  bucketMs = 60_000, // 1-minute bucket by default
): string {
  const bucket = Math.floor(Date.now() / bucketMs);
  return `fre:${orgId.slice(-6)}:${type}:${bucket}`;
}
