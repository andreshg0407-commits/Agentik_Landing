/**
 * action-receipt.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Receipt — proof of execution from a provider.
 *
 * Although no real providers exist yet, the contract must be ready.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import { nextActionId } from "./action-types";

// -- Action Receipt -----------------------------------------------------------

/** Proof of execution from a provider. */
export interface ActionReceipt {
  /** Unique receipt ID. */
  receiptId: string;
  /** Action this receipt belongs to. */
  actionId: string;
  /** Execution this receipt belongs to. */
  executionId: string;
  /** Provider that executed the action. */
  provider: string;
  /** Provider-side reference ID. */
  providerReference: string;
  /** Channel used (email, sms, webhook, api, internal, etc.). */
  channel: string;
  /** When the provider confirmed delivery. */
  deliveredAt: string | null;
  /** Provider-side status. */
  status: string;
  /** Raw provider response (sanitized). */
  rawResponse: Record<string, unknown>;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build an action receipt. */
export function buildActionReceipt(opts: {
  actionId: string;
  executionId: string;
  provider: string;
  providerReference?: string;
  channel?: string;
  deliveredAt?: string | null;
  status?: string;
  rawResponse?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): ActionReceipt {
  return {
    receiptId: nextActionId("arec"),
    actionId: opts.actionId,
    executionId: opts.executionId,
    provider: opts.provider,
    providerReference: opts.providerReference ?? "",
    channel: opts.channel ?? "internal",
    deliveredAt: opts.deliveredAt ?? null,
    status: opts.status ?? "dry_run",
    rawResponse: opts.rawResponse ?? {},
    metadata: opts.metadata ?? {},
  };
}

/** Build a dry-run receipt. */
export function buildDryRunReceipt(actionId: string, executionId: string): ActionReceipt {
  return buildActionReceipt({
    actionId,
    executionId,
    provider: "dry_run",
    providerReference: "simulated",
    channel: "internal",
    status: "dry_run_completed",
    deliveredAt: new Date().toISOString(),
  });
}
