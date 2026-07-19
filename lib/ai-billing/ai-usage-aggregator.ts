/**
 * lib/ai-billing/ai-usage-aggregator.ts
 *
 * Agentik — AI Billing Foundation — Usage Aggregator
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Pure aggregation functions. No I/O. Client-safe.
 */

import type { AiUsageRecord, AiUsageSummary, AiUsageBucket } from "./ai-usage-types";

// ── Internal bucket builder ────────────────────────────────────────────────────

function buildBucket(key: string, records: AiUsageRecord[]): AiUsageBucket {
  return records.reduce<AiUsageBucket>(
    (acc, r) => ({
      key,
      totalCreditsUsed: acc.totalCreditsUsed + r.creditsUsed,
      totalCostUsd:     acc.totalCostUsd     + r.costUsd,
      totalTokens:      acc.totalTokens      + r.totalTokens,
      totalRequests:    acc.totalRequests    + r.requestCount,
      recordCount:      acc.recordCount      + 1,
    }),
    { key, totalCreditsUsed: 0, totalCostUsd: 0, totalTokens: 0, totalRequests: 0, recordCount: 0 },
  );
}

// ── Aggregators ───────────────────────────────────────────────────────────────

/**
 * Group records by orgSlug and aggregate.
 */
export function aggregateUsageByTenant(records: AiUsageRecord[]): AiUsageBucket[] {
  const groups = new Map<string, AiUsageRecord[]>();
  for (const r of records) {
    const key = r.orgSlug;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.entries()).map(([k, rs]) => buildBucket(k, rs));
}

/**
 * Group records by moduleSlug and aggregate.
 * Records with no moduleSlug go into bucket "unknown".
 */
export function aggregateUsageByModule(records: AiUsageRecord[]): AiUsageBucket[] {
  const groups = new Map<string, AiUsageRecord[]>();
  for (const r of records) {
    const key = r.moduleSlug ?? "unknown";
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.entries()).map(([k, rs]) => buildBucket(k, rs));
}

/**
 * Group records by agentId and aggregate.
 * Records with no agentId go into bucket "no_agent".
 */
export function aggregateUsageByAgent(records: AiUsageRecord[]): AiUsageBucket[] {
  const groups = new Map<string, AiUsageRecord[]>();
  for (const r of records) {
    const key = r.agentId ?? "no_agent";
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.entries()).map(([k, rs]) => buildBucket(k, rs));
}

/**
 * Group records by featureKey and aggregate.
 */
export function aggregateUsageByFeature(records: AiUsageRecord[]): AiUsageBucket[] {
  const groups = new Map<string, AiUsageRecord[]>();
  for (const r of records) {
    const key = r.featureKey;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.entries()).map(([k, rs]) => buildBucket(k, rs));
}

// ── Summary ───────────────────────────────────────────────────────────────────

/**
 * Produce a flat usage summary across all provided records.
 * Assumes all records belong to the same orgSlug (pass pre-filtered slice).
 */
export function summarizeUsage(
  records: AiUsageRecord[],
  opts: {
    orgSlug?:              string;
    creditPriceUsd?:       number; // how much Agentik sells 1 credit for
    fromDate?:             string;
    toDate?:               string;
  } = {},
): AiUsageSummary {
  const orgSlug            = opts.orgSlug ?? records[0]?.orgSlug ?? "unknown";
  const creditPriceUsd     = opts.creditPriceUsd ?? 0;

  const totals = records.reduce(
    (acc, r) => ({
      credits:      acc.credits      + r.creditsUsed,
      costUsd:      acc.costUsd      + r.costUsd,
      inputTokens:  acc.inputTokens  + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      requests:     acc.requests     + r.requestCount,
    }),
    { credits: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, requests: 0 },
  );

  const estimatedRevenueUsd = totals.credits * creditPriceUsd;
  const grossMarginUsd      = estimatedRevenueUsd - totals.costUsd;

  return {
    orgSlug,
    totalCreditsUsed:     totals.credits,
    totalCostUsd:         totals.costUsd,
    totalInputTokens:     totals.inputTokens,
    totalOutputTokens:    totals.outputTokens,
    totalRequests:        totals.requests,
    grossMarginUsd:       creditPriceUsd > 0 ? grossMarginUsd : undefined,
    estimatedRevenueUsd:  creditPriceUsd > 0 ? estimatedRevenueUsd : undefined,
    recordCount:          records.length,
    fromDate:             opts.fromDate,
    toDate:               opts.toDate,
  };
}
