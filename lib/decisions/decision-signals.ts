/**
 * lib/decisions/decision-signals.ts
 *
 * Agentik — Decision Engine Business Signals
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * Defines the signal shape that feeds the Decision Engine.
 * A signal represents a detected business event that may require action.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type {
  DecisionSignalId,
  DecisionDomain,
  DecisionSeverity,
  DecisionSource,
} from "./decision-types";

// ── Signal types ──────────────────────────────────────────────────────────────

export type DecisionSignalType =
  | "conciliation_exception_detected"
  | "cashflow_risk_detected"
  | "overdue_customer_detected"
  | "commercial_margin_drop_detected"
  | "campaign_ready_for_approval"
  | "inventory_transfer_required"
  | "budget_threshold_exceeded"
  | "payment_delay_detected"
  | "collection_risk_detected"
  | "supplier_invoice_pending"
  | "bank_reconciliation_gap"
  | "tax_deadline_approaching"
  | "custom";

// ── Signal metrics ────────────────────────────────────────────────────────────

export interface DecisionSignalMetrics {
  monetaryAmount?:    number;
  currency?:          string;
  daysOverdue?:       number;
  count?:             number;
  percentageChange?:  number;
  threshold?:         number;
  currentValue?:      number;
  previousValue?:     number;
}

// ── Signal ────────────────────────────────────────────────────────────────────

export interface DecisionSignal {
  id:          DecisionSignalId;
  domain:      DecisionDomain;
  source:      DecisionSource;
  type:        DecisionSignalType | string;
  title:       string;
  description: string;
  severity:    DecisionSeverity;
  detectedAt:  string;
  entityType?: string;
  entityId?:   string;
  metrics?:    DecisionSignalMetrics;
  metadata?:   Record<string, unknown>;
}
