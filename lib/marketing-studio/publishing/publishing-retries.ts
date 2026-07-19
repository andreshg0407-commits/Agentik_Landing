/**
 * lib/marketing-studio/publishing/publishing-retries.ts
 *
 * MS-17 — Unified Publishing OS: Retry engine
 *
 * Pure functions. No Prisma. No async.
 */

import type { PublishingDestination, PublishingPlanStep } from "./publishing-types";

// ── Retry limits per destination ──────────────────────────────────────────────

const MAX_RETRIES: Record<string, number> = {
  shopify:   5,
  instagram: 3,
  facebook:  3,
  tiktok:    3,
  whatsapp:  4,
  youtube:   3,
  landing:   2,
  catalog:   4,
  ads:       2,
  email:     3,
};

// ── Backoff: 30s × 2^n, capped at 30 min ─────────────────────────────────────

export function computePublishingRetryDelay(retryCount: number): number {
  const BASE_MS = 30_000;
  const MAX_MS  = 30 * 60_000;
  return Math.min(BASE_MS * Math.pow(2, retryCount), MAX_MS);
}

export function computeNextRetryAt(retryCount: number): string {
  const delayMs = computePublishingRetryDelay(retryCount);
  return new Date(Date.now() + delayMs).toISOString();
}

// ── Should retry? ─────────────────────────────────────────────────────────────

export function shouldRetryPublishingStep(
  step:         PublishingPlanStep,
  errorMessage: string | null,
): boolean {
  const max = MAX_RETRIES[step.destination] ?? 3;
  if (step.retryCount >= max) return false;
  // Auth failures are not retryable automatically — need human action
  if (errorMessage?.toLowerCase().includes("auth") ||
      errorMessage?.toLowerCase().includes("token") ||
      errorMessage?.toLowerCase().includes("unauthorized")) return false;
  return true;
}

export function detectPermanentPublishingFailure(
  step:         PublishingPlanStep,
  errorMessage: string | null,
): boolean {
  if (!shouldRetryPublishingStep(step, errorMessage)) return true;
  const permanent = ["auth", "unauthorized", "forbidden", "account_disabled", "content_policy"];
  return permanent.some(p => errorMessage?.toLowerCase().includes(p) ?? false);
}

// ── Retry policy ──────────────────────────────────────────────────────────────

export function computePublishingRetryPolicy(
  destination:  PublishingDestination,
  errorMessage: string | null,
): "exponential" | "immediate" | "manual_review" {
  if (!errorMessage) return "exponential";

  const msg = errorMessage.toLowerCase();
  if (msg.includes("rate_limit") || msg.includes("too_many")) return "exponential";
  if (msg.includes("network") || msg.includes("timeout"))     return "immediate";
  if (msg.includes("auth") || msg.includes("forbidden"))      return "manual_review";

  // Destination-specific
  if (destination === "whatsapp") return "exponential";
  return "exponential";
}

// ── Recovery plan builder ─────────────────────────────────────────────────────

export function recoverPublishingPlan(steps: PublishingPlanStep[]): {
  retryable:    PublishingPlanStep[];
  permanent:    PublishingPlanStep[];
  suggestions:  string[];
} {
  const failed   = steps.filter(s => s.status === "failed");
  const retryable: PublishingPlanStep[] = [];
  const permanent: PublishingPlanStep[] = [];

  for (const s of failed) {
    if (shouldRetryPublishingStep(s, s.lastError)) {
      retryable.push(s);
    } else {
      permanent.push(s);
    }
  }

  const suggestions: string[] = [];
  if (permanent.some(s => s.lastError?.toLowerCase().includes("auth"))) {
    suggestions.push("Reconectar integración del canal afectado");
  }
  if (retryable.length > 0) {
    suggestions.push(`${retryable.length} step(s) pueden reintentarse automáticamente`);
  }
  if (permanent.length > 0) {
    suggestions.push(`${permanent.length} step(s) requieren revisión manual`);
  }

  return { retryable, permanent, suggestions };
}
