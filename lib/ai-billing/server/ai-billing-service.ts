/**
 * lib/ai-billing/server/ai-billing-service.ts
 *
 * Agentik — AI Billing Foundation + Hardening — Server Service
 * Sprint: AGENTIK-AI-BILLING-HARDENING-01
 *
 * HARDENED: All balance mutations now go through atomicDebit / atomicGrant.
 * No more TOCTOU race conditions. No more in-memory balance checks.
 *
 * SERVER-ONLY — imports Prisma repository.
 * Never import from client components or client barrel (lib/ai-billing/index.ts).
 */
import "server-only";

import type { AiUsageRecord, AiUsageFilters, AiUsageSummary } from "../ai-usage-types";
import type { AiCreditBalance }                                from "../ai-credit-types";
import type { AiBillingResult }                                from "../ai-billing-result";
import type { OveragePolicy }                                  from "../ai-credit-transaction";
import { aiBillingPrismaRepository }        from "../persistence/ai-billing-prisma-repository";
import { atomicDebit, atomicGrant, getStoredBalance } from "../persistence/ai-credit-atomic-repository";
import { calculateCreditsUsed, calculateTokenTotals } from "../ai-billing-calculator";
import { validateAiUsageRecord, createAiBillingAuditEvent } from "../ai-billing-audit";
import { successBillingResult, failedBillingResult }         from "../ai-billing-result";
import { isCreditBalanceLow }                                from "../ai-credit-ledger";
import { toAiUsageId }                                       from "../ai-billing-types";
import { aiPricingService }                                  from "../../ai-pricing/server/ai-pricing-service";
import type { AiPricingResolutionInput }                     from "../../ai-pricing/ai-pricing-types";

// ── Helper ────────────────────────────────────────────────────────────────────

type UsageInput = Partial<AiUsageRecord> & {
  orgSlug:    string;
  featureKey: string;
  usageKind:  AiUsageRecord["usageKind"];
  /** Idempotency key — prevents double debits for the same AI call. */
  correlationId?: string;
};

function normalizeUsageInput(input: UsageInput): AiUsageRecord {
  const tokens = calculateTokenTotals(input.inputTokens ?? 0, input.outputTokens ?? 0);
  const creditsUsed = input.creditsUsed ?? calculateCreditsUsed({
    usageKind:    input.usageKind,
    inputTokens:  tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    imageUnits:   input.imageUnits,
    videoSeconds: input.videoSeconds,
    audioSeconds: input.audioSeconds,
  });

  return {
    id:                    input.id ?? toAiUsageId(`usage_${Date.now()}_${Math.random().toString(36).slice(2)}`),
    orgSlug:               input.orgSlug,
    organizationId:        input.organizationId,
    tenantId:              input.tenantId,
    moduleSlug:            input.moduleSlug,
    agentId:               input.agentId,
    agentDisplayName:      input.agentDisplayName,
    featureKey:            input.featureKey,
    workflowRunId:         input.workflowRunId,
    workExecutionId:       input.workExecutionId,
    autonomousOperationId: input.autonomousOperationId,
    copilotSessionId:      input.copilotSessionId,
    provider:              input.provider,
    model:                 input.model,
    usageKind:             input.usageKind,
    inputTokens:           tokens.inputTokens,
    outputTokens:          tokens.outputTokens,
    totalTokens:           tokens.totalTokens,
    imageUnits:            input.imageUnits,
    videoSeconds:          input.videoSeconds,
    audioSeconds:          input.audioSeconds,
    requestCount:          input.requestCount ?? 1,
    costUsd:               input.costUsd ?? 0,
    costMode:              input.costMode ?? "ESTIMATED",
    creditsUsed,
    status:                input.status ?? "RECORDED",
    metadata:              input.metadata,
    createdAt:             input.createdAt ?? new Date().toISOString(),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const aiBillingService = {

  /**
   * Record AI usage WITHOUT debiting credits.
   * Use for observability-only recording (no balance impact).
   */
  async recordAiUsage(input: UsageInput): Promise<AiBillingResult> {
    const warnings: string[] = [];
    const record = normalizeUsageInput(input);

    const validation = validateAiUsageRecord(record);
    if (!validation.valid) {
      return failedBillingResult("Invalid usage record", validation.errors);
    }
    warnings.push(...validation.warnings);

    try {
      const saved = await aiBillingPrismaRepository.recordUsage(record);
      const audit = createAiBillingAuditEvent(
        "usage_recorded", record.orgSlug,
        `Usage recorded: ${record.featureKey} (${record.usageKind}) — ${record.creditsUsed} credits`,
        { usageId: saved.id, creditsUsed: saved.creditsUsed },
      );
      return successBillingResult("Usage recorded.", {
        usageRecord: saved, creditsUsed: saved.creditsUsed,
        costUsd: saved.costUsd, warnings, auditTrail: [audit],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error recording usage.";
      return failedBillingResult(msg, [msg]);
    }
  },

  /**
   * Record AI usage AND atomically debit credits.
   *
   * HARDENED pipeline:
   *   1. Validate usage record
   *   2. Persist AiUsage
   *   3. atomicDebit() — single $transaction with FOR UPDATE lock
   *      a. Lock AiCreditBalance row
   *      b. Check correlationId (idempotency)
   *      c. Validate balance / overage policy
   *      d. INSERT AiCreditLedger entry
   *      e. UPDATE AiCreditBalance
   *      f. COMMIT
   *
   * No TOCTOU possible. No double debits possible.
   */
  async recordAiUsageAndDebitCredits(
    input:   UsageInput,
    opts:    { allowOverage?: boolean; overageLimitCredits?: number } = {},
  ): Promise<AiBillingResult> {
    const warnings: string[] = [];
    const record = normalizeUsageInput(input);

    const validation = validateAiUsageRecord(record);
    if (!validation.valid) {
      return failedBillingResult("Invalid usage record", validation.errors);
    }
    warnings.push(...validation.warnings);

    // Persist usage record first (does not affect balance)
    let savedUsage: AiUsageRecord;
    try {
      savedUsage = await aiBillingPrismaRepository.recordUsage(record);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to persist usage record.";
      return failedBillingResult(msg, [msg], { warnings });
    }

    // Derive idempotency key: prefer explicit correlationId, fallback to usageId
    const correlationId = (input as unknown as Record<string, string>).correlationId
      ?? `usage:${savedUsage.id}`;

    const overagePolicy: OveragePolicy = {
      allowOverage:        opts.allowOverage       ?? false,
      overageLimitCredits: opts.overageLimitCredits ?? 0,
    };

    // Atomic debit
    const debit = await atomicDebit({
      orgSlug:         record.orgSlug,
      organizationId:  record.organizationId,
      type:            "DEBIT",
      amount:          record.creditsUsed,
      correlationId,
      relatedUsageId:  savedUsage.id,
      reason:          `AI usage: ${record.featureKey} (${record.usageKind})`,
      createdBy:       "system:ai_billing",
      overagePolicy,
      metadata:        { agentId: record.agentId, moduleSlug: record.moduleSlug },
    });

    if (!debit.success) {
      if (debit.blocked) {
        return failedBillingResult(
          debit.reason ?? "Insufficient credits.",
          [debit.reason ?? "Insufficient credits."],
          { usageRecord: savedUsage, warnings },
        );
      }
      return failedBillingResult(
        debit.error ?? "Atomic debit failed.",
        [debit.error ?? "Atomic debit failed."],
        { usageRecord: savedUsage, warnings },
      );
    }

    const auditEvents = [
      createAiBillingAuditEvent("usage_recorded", record.orgSlug,
        `Usage: ${record.featureKey} — ${record.creditsUsed} credits`,
        { usageId: savedUsage.id, idempotent: debit.idempotent }),
    ];

    if (!debit.idempotent) {
      auditEvents.push(createAiBillingAuditEvent("credits_debited", record.orgSlug,
        `Debited ${record.creditsUsed} credits. Balance: ${debit.balanceAfter}`,
        { ledgerId: debit.ledgerEntryId, balanceAfter: debit.balanceAfter }));
    }

    if (debit.balanceAfter < 0) {
      warnings.push(`Balance is negative: ${debit.balanceAfter}. Overage recorded.`);
      auditEvents.push(createAiBillingAuditEvent("overage_detected", record.orgSlug,
        `Overage: balance is ${debit.balanceAfter}.`, { balance: debit.balanceAfter }));
    }

    if (isCreditBalanceLow(debit.balanceAfter, debit.balanceBefore + record.creditsUsed)) {
      warnings.push(`Low credit balance: ${debit.balanceAfter} credits remaining.`);
      auditEvents.push(createAiBillingAuditEvent("low_balance_warning", record.orgSlug,
        `Balance is low: ${debit.balanceAfter} credits remaining.`, { balance: debit.balanceAfter }));
    }

    return successBillingResult(
      debit.idempotent
        ? `Idempotent debit (${correlationId}). No duplicate charge.`
        : `Usage recorded and ${record.creditsUsed} credits debited. Balance: ${debit.balanceAfter}.`,
      {
        usageRecord:  savedUsage,
        balanceAfter: debit.balanceAfter,
        creditsUsed:  record.creditsUsed,
        costUsd:      record.costUsd,
        warnings,
        auditTrail:   auditEvents,
      },
    );
  },

  /**
   * Atomically grant monthly plan credits to a tenant.
   *
   * HARDENED: uses atomicGrant() with correlationId for idempotency.
   * Pass a correlationId to prevent duplicate monthly grants.
   *
   * Example: correlationId = "monthly_grant:castillitos:2026-06"
   */
  async grantMonthlyCredits(
    orgSlug:        string,
    credits:        number,
    reason:         string,
    correlationId?: string,
  ): Promise<AiBillingResult> {
    const grant = await atomicGrant({
      orgSlug,
      type:          "GRANT",
      amount:        credits,
      correlationId,
      reason,
      createdBy:     "system:billing_cron",
    });

    if (!grant.success) {
      return failedBillingResult(grant.error ?? "Grant failed.", [grant.error ?? "Grant failed."]);
    }

    const audit = createAiBillingAuditEvent(
      "credits_granted", orgSlug,
      grant.idempotent
        ? `Idempotent grant (${correlationId}). No duplicate credit.`
        : `Granted ${credits} credits. Balance: ${grant.balanceAfter}`,
      { ledgerId: grant.ledgerEntryId, reason, idempotent: grant.idempotent },
    );

    return successBillingResult(
      grant.idempotent
        ? `Idempotent grant (${correlationId}). No duplicate credit.`
        : `Granted ${credits} credits. Balance is now ${grant.balanceAfter}.`,
      {
        balanceAfter: grant.balanceAfter,
        warnings:     [],
        auditTrail:   [audit],
      },
    );
  },

  /**
   * Get the current stored credit balance (fast single-row lookup).
   */
  async getTenantCreditBalance(orgSlug: string): Promise<AiCreditBalance> {
    const stored = await getStoredBalance(orgSlug);
    const isLow  = isCreditBalanceLow(stored.balance, stored.totalGranted);
    return {
      orgSlug:          stored.orgSlug,
      availableCredits: stored.balance,
      totalGranted:     stored.totalGranted,
      totalDebited:     stored.totalDebited,
      totalRefunded:    stored.totalRefunded,
      isLow,
      lowThreshold:     100,
      computedAt:       stored.updatedAt,
    };
  },

  /**
   * Get aggregated usage summary for a tenant.
   */
  async getTenantAiUsageSummary(orgSlug: string, filters?: AiUsageFilters): Promise<AiUsageSummary> {
    return aiBillingPrismaRepository.getUsageSummary(orgSlug, filters);
  },

  /**
   * Record AI usage with pricing resolved from the Pricing Engine.
   *
   * Pipeline:
   *   1. Call aiPricingService.resolvePricing (DB rates → fallback chain)
   *   2. Build AiUsageRecord with resolved costUsd + creditsUsed
   *   3. Persist usage + atomically debit credits
   *
   * Falls back to recordAiUsageAndDebitCredits if pricing resolution fails.
   */
  async recordAiUsageWithResolvedPricing(
    input: {
      orgSlug:     string;
      featureKey:  string;
      provider:    string;
      model:       string;
      usageKind:   AiUsageRecord["usageKind"];
      inputTokens?:  number;
      outputTokens?: number;
      imageUnits?:   number;
      videoSeconds?: number;
      audioSeconds?: number;
      requestCount?: number;
      moduleSlug?:   string;
      agentId?:      string;
      agentDisplayName?: string;
      correlationId?: string;
      metadata?:     Record<string, unknown>;
    },
    opts: { allowOverage?: boolean; overageLimitCredits?: number } = {},
  ): Promise<AiBillingResult> {
    // Step 1: resolve pricing
    const pricingInput: AiPricingResolutionInput = {
      providerId:   input.provider,
      modelId:      input.model,
      usageKind:    input.usageKind,
      inputTokens:  input.inputTokens,
      outputTokens: input.outputTokens,
      imageUnits:   input.imageUnits,
      videoSeconds: input.videoSeconds,
      audioSeconds: input.audioSeconds,
      requestCount: input.requestCount,
    };

    const pricing = await aiPricingService.resolvePricing(pricingInput);

    if (!pricing.success || !pricing.resolvedRate) {
      // Fallback: use legacy calculator
      return this.recordAiUsageAndDebitCredits(
        {
          orgSlug:      input.orgSlug,
          featureKey:   input.featureKey,
          provider:     input.provider,
          model:        input.model,
          usageKind:    input.usageKind,
          inputTokens:  input.inputTokens,
          outputTokens: input.outputTokens,
          imageUnits:   input.imageUnits,
          videoSeconds: input.videoSeconds,
          audioSeconds: input.audioSeconds,
          moduleSlug:   input.moduleSlug,
          agentId:      input.agentId,
          agentDisplayName: input.agentDisplayName,
          correlationId: input.correlationId,
          metadata:     { ...input.metadata, pricingFallback: true, pricingErrors: pricing.errors },
        },
        opts,
      );
    }

    const { creditsUsed, estimatedCostUsd } = pricing.resolvedRate;

    // Step 2: build usage record with resolved pricing
    const usageInput: UsageInput = {
      orgSlug:          input.orgSlug,
      featureKey:       input.featureKey,
      provider:         input.provider,
      model:            input.model,
      usageKind:        input.usageKind,
      inputTokens:      input.inputTokens ?? 0,
      outputTokens:     input.outputTokens ?? 0,
      imageUnits:       input.imageUnits,
      videoSeconds:     input.videoSeconds,
      audioSeconds:     input.audioSeconds,
      requestCount:     input.requestCount ?? 1,
      moduleSlug:       input.moduleSlug,
      agentId:          input.agentId,
      agentDisplayName: input.agentDisplayName,
      correlationId:    input.correlationId,
      creditsUsed,
      costUsd:          estimatedCostUsd,
      costMode:         "ESTIMATED",
      metadata:         {
        ...input.metadata,
        pricingSource:   pricing.resolvedRate.source,
        pricingRateId:   pricing.resolvedRate.rateId,
        pricingWarnings: pricing.warnings,
      },
    };

    // Step 3: persist + debit (reuse hardened pipeline)
    return this.recordAiUsageAndDebitCredits(usageInput, opts);
  },

  /**
   * Reconstruct balance by replaying the ledger (integrity recovery).
   * Returns the replayed balance — use to verify against stored balance.
   */
  async reconstructBalanceFromLedger(orgSlug: string): Promise<{ orgSlug: string; reconstructedBalance: number; storedBalance: number; consistent: boolean }> {
    const [entries, stored] = await Promise.all([
      aiBillingPrismaRepository.listLedgerByOrg(orgSlug),
      getStoredBalance(orgSlug),
    ]);

    const reconstructedBalance = entries.reduce((sum, e) => sum + e.credits, 0);
    const consistent = Math.abs(reconstructedBalance - stored.balance) <= 1;

    return { orgSlug, reconstructedBalance, storedBalance: stored.balance, consistent };
  },
};
