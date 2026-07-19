/**
 * lib/ai-pricing/ai-pricing-result.ts
 *
 * Agentik — AI Pricing Engine — Pricing Result Types
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Structured result returned by pricing resolution and calculation.
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiResolvedRate } from "./ai-model-rate-types";

// ── Pricing result ────────────────────────────────────────────────────────────

export interface AiPricingResult {
  /** Whether pricing was resolved successfully. */
  success: boolean;

  /** Resolved rate details. Present on success. */
  resolvedRate?: AiResolvedRate;

  /** Human-readable summary. */
  message: string;

  /** Error messages. Empty on success. */
  errors: string[];

  /** Non-fatal warnings (deprecated provider, fallback used, etc.). */
  warnings: string[];
}

// ── Factory helpers ───────────────────────────────────────────────────────────

export function successPricingResult(
  message: string,
  resolvedRate: AiResolvedRate,
  warnings: string[] = [],
): AiPricingResult {
  return { success: true, resolvedRate, message, errors: [], warnings };
}

export function failedPricingResult(
  message: string,
  errors: string[] = [message],
  warnings: string[] = [],
): AiPricingResult {
  return { success: false, message, errors, warnings };
}
