/**
 * lib/ai-pricing/ai-pricing-audit.ts
 *
 * Agentik — AI Pricing Engine — Audit Events & Validation
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiProviderDefinition } from "./ai-provider-types";
import type { AiModelRate } from "./ai-model-rate-types";
import type { AiRateResolutionSource } from "./ai-model-rate-types";

// ── Audit event types ─────────────────────────────────────────────────────────

export type AiPricingAuditEventType =
  | "provider_rate_resolved"
  | "provider_rate_missing"
  | "fallback_rate_used"
  | "pricing_calculated"
  | "pricing_failed"
  | "provider_deprecated_used"
  | "model_rate_expired";

// ── Audit event ───────────────────────────────────────────────────────────────

export interface AiPricingAuditEvent {
  type:      AiPricingAuditEventType;
  orgSlug?:  string;
  message:   string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAiPricingAuditEvent(
  type:      AiPricingAuditEventType,
  message:   string,
  metadata?: Record<string, unknown>,
  orgSlug?:  string,
): AiPricingAuditEvent {
  return {
    type,
    orgSlug,
    message,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface PricingValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

/**
 * Validate an AiProviderDefinition.
 * Never throws.
 */
export function validateAiProviderDefinition(
  provider: Partial<AiProviderDefinition>,
): PricingValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!provider.id)   errors.push("provider.id is required");
  if (!provider.name) errors.push("provider.name is required");
  if (!provider.kind) errors.push("provider.kind is required");
  if (!provider.status) errors.push("provider.status is required");

  const validKinds = new Set(["LLM", "IMAGE", "VIDEO", "AUDIO", "EMBEDDING", "MULTIMODAL", "ROUTER", "INTERNAL"]);
  if (provider.kind && !validKinds.has(provider.kind)) {
    errors.push(`provider.kind "${provider.kind}" is not a valid AiProviderKind`);
  }

  const validStatuses = new Set(["ACTIVE", "INACTIVE", "DEPRECATED", "TEST_ONLY"]);
  if (provider.status && !validStatuses.has(provider.status)) {
    errors.push(`provider.status "${provider.status}" is not valid`);
  }

  if (provider.status === "DEPRECATED") {
    warnings.push(`Provider "${provider.id}" is DEPRECATED — rates from this provider will trigger warnings`);
  }
  if (provider.status === "TEST_ONLY") {
    warnings.push(`Provider "${provider.id}" is TEST_ONLY — should not be used in production`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an AiModelRate.
 * Never throws.
 */
export function validateAiModelRate(
  rate: Partial<AiModelRate>,
): PricingValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!rate.id)          errors.push("rate.id is required");
  if (!rate.providerId)  errors.push("rate.providerId is required");
  if (!rate.modelId)     errors.push("rate.modelId is required");
  if (!rate.displayName) errors.push("rate.displayName is required");
  if (!rate.usageKind)   errors.push("rate.usageKind is required");
  if (!rate.currency)    errors.push("rate.currency is required");

  if (rate.minimumCredits == null) {
    errors.push("rate.minimumCredits is required");
  } else if (rate.minimumCredits < 1) {
    errors.push("rate.minimumCredits must be ≥ 1");
  }

  if (rate.creditMarkupMultiplier == null) {
    errors.push("rate.creditMarkupMultiplier is required");
  } else if (rate.creditMarkupMultiplier < 1) {
    errors.push("rate.creditMarkupMultiplier must be ≥ 1.0");
  }

  if (!rate.effectiveFrom) {
    errors.push("rate.effectiveFrom is required");
  }

  const validStatuses = new Set(["ACTIVE", "INACTIVE", "DEPRECATED", "SUPERSEDED"]);
  if (rate.status && !validStatuses.has(rate.status)) {
    errors.push(`rate.status "${rate.status}" is not valid`);
  }

  // Check that at least one cost field is set
  const hasCost = (rate.inputTokenCostPer1M != null) ||
                  (rate.outputTokenCostPer1M != null) ||
                  (rate.imageUnitCost != null) ||
                  (rate.videoSecondCost != null) ||
                  (rate.audioSecondCost != null) ||
                  (rate.requestCost != null);

  if (!hasCost) {
    warnings.push(`Rate "${rate.id}" has no cost fields set — will always use minimumCredits`);
  }

  // Check expiry
  if (rate.effectiveTo) {
    const now = new Date().toISOString();
    if (rate.effectiveTo < now) {
      warnings.push(`Rate "${rate.id}" has expired (effectiveTo: ${rate.effectiveTo})`);
    }
  }

  if (rate.status === "DEPRECATED") {
    warnings.push(`Rate "${rate.id}" is DEPRECATED`);
  }
  if (rate.status === "SUPERSEDED") {
    warnings.push(`Rate "${rate.id}" is SUPERSEDED — a newer rate should be used`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Resolution audit ──────────────────────────────────────────────────────────

export interface PricingResolutionAuditResult {
  events:   AiPricingAuditEvent[];
  warnings: string[];
}

/**
 * Produce audit events for a pricing resolution.
 */
export function auditPricingResolution(params: {
  providerId: string;
  modelId:    string;
  usageKind:  string;
  source?:    AiRateResolutionSource;
  rateId?:    string;
  creditsUsed?: number;
  costUsd?:   number;
  error?:     string;
  orgSlug?:   string;
}): PricingResolutionAuditResult {
  const events:   AiPricingAuditEvent[] = [];
  const warnings: string[] = [];

  if (params.error) {
    events.push(createAiPricingAuditEvent(
      "provider_rate_missing",
      `No rate for ${params.providerId}/${params.modelId}/${params.usageKind}: ${params.error}`,
      { providerId: params.providerId, modelId: params.modelId, usageKind: params.usageKind },
      params.orgSlug,
    ));
    events.push(createAiPricingAuditEvent(
      "pricing_failed",
      `Pricing failed: ${params.error}`,
      {},
      params.orgSlug,
    ));
    return { events, warnings };
  }

  if (params.source === "GLOBAL_FALLBACK" || params.source === "USAGE_KIND_DEFAULT" || params.source === "PROVIDER_DEFAULT") {
    events.push(createAiPricingAuditEvent(
      "fallback_rate_used",
      `Fallback rate used (${params.source}) for ${params.providerId}/${params.modelId}/${params.usageKind}`,
      { source: params.source, rateId: params.rateId },
      params.orgSlug,
    ));
    warnings.push(`Fallback rate used (${params.source}) — consider adding an exact rate`);
  }

  events.push(createAiPricingAuditEvent(
    "provider_rate_resolved",
    `Rate resolved via ${params.source ?? "unknown"} for ${params.usageKind}`,
    { rateId: params.rateId, source: params.source },
    params.orgSlug,
  ));

  events.push(createAiPricingAuditEvent(
    "pricing_calculated",
    `Pricing: ${params.creditsUsed ?? 0} credits, $${(params.costUsd ?? 0).toFixed(6)} USD`,
    { creditsUsed: params.creditsUsed, costUsd: params.costUsd },
    params.orgSlug,
  ));

  return { events, warnings };
}
