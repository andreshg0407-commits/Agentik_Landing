/**
 * lib/marketing-studio/distribution/distribution-variants.ts
 *
 * MS-14 — Distribution Runtime: Variant Intelligence Engine
 *
 * Computes variant coverage, gaps, and readiness per product/channel.
 *
 * Pure computation — no Prisma, no async.
 * SERVER ONLY (imported by repository + engine layers).
 */

import {
  VARIANT_PURPOSE,
  VARIANT_RATIO,
  CHANNEL_REQUIRED_VARIANTS,
  type DistributionVariantDTO,
  type VariantGapSummary,
  type ChannelReadiness,
  type DistributionChannel,
} from "./distribution-types";

// ── Coverage analysis ──────────────────────────────────────────────────────────

export interface VariantCoverageResult {
  productId:        string;
  channel:          string;
  coveredPurposes:  string[];
  missingPurposes:  string[];
  isReady:          boolean;
  coverageScore:    number; // 0–1
}

/**
 * For a single product + channel, determine which required variant purposes
 * are covered vs missing.
 */
export function analyzeVariantCoverageForProduct(
  productId:  string,
  channel:    string,
  variants:   DistributionVariantDTO[],
): VariantCoverageResult {
  const required = CHANNEL_REQUIRED_VARIANTS[channel as DistributionChannel] ?? [];
  const productVariants = variants.filter(
    v => v.productId === productId && v.channel === channel && v.isReady,
  );
  const coveredPurposes = productVariants.map(v => v.purpose);
  const missingPurposes = required.filter(r => !coveredPurposes.includes(r));

  return {
    productId,
    channel,
    coveredPurposes,
    missingPurposes,
    isReady:       missingPurposes.length === 0,
    coverageScore: required.length > 0 ? (required.length - missingPurposes.length) / required.length : 1,
  };
}

/**
 * For a set of product IDs + channel, compute aggregate gap summary.
 */
export function computeVariantGaps(
  productIds: string[],
  channel:    string,
  variants:   DistributionVariantDTO[],
): VariantGapSummary[] {
  const required = CHANNEL_REQUIRED_VARIANTS[channel as DistributionChannel] ?? [];
  const gapMap   = new Map<string, Set<string>>();

  for (const purpose of required) {
    gapMap.set(purpose, new Set<string>());
  }

  for (const productId of productIds) {
    const coverage = analyzeVariantCoverageForProduct(productId, channel, variants);
    for (const missing of coverage.missingPurposes) {
      const set = gapMap.get(missing) ?? new Set<string>();
      set.add(productId);
      gapMap.set(missing, set);
    }
  }

  const gaps: VariantGapSummary[] = [];
  for (const [purpose, missingProductIds] of gapMap.entries()) {
    if (missingProductIds.size > 0) {
      gaps.push({
        purpose,
        channel,
        required:     true,
        missingCount: missingProductIds.size,
        productIds:   Array.from(missingProductIds),
      });
    }
  }

  return gaps.sort((a, b) => b.missingCount - a.missingCount);
}

/**
 * For a single channel across all products, determine channel readiness.
 */
export function computeChannelReadiness(
  channel:    string,
  productIds: string[],
  variants:   DistributionVariantDTO[],
): ChannelReadiness {
  if (productIds.length === 0) {
    return { channel, isReady: true, missingItems: [], score: 1 };
  }

  const gaps = computeVariantGaps(productIds, channel, variants);
  const totalRequired = productIds.length * (CHANNEL_REQUIRED_VARIANTS[channel as DistributionChannel]?.length ?? 0);
  const totalMissing  = gaps.reduce((sum, g) => sum + g.missingCount, 0);
  const score = totalRequired > 0 ? Math.max(0, (totalRequired - totalMissing) / totalRequired) : 1;

  const missingItems = gaps.map(g =>
    `${g.missingCount} variante${g.missingCount > 1 ? "s" : ""} de tipo "${g.purpose}" faltante${g.missingCount > 1 ? "s" : ""}`,
  );

  return {
    channel,
    isReady:      gaps.length === 0,
    missingItems,
    score,
  };
}

/**
 * Get required ratio for a variant purpose.
 */
export function getRequiredRatio(purpose: string): string | null {
  return VARIANT_RATIO[purpose as keyof typeof VARIANT_RATIO] ?? null;
}

/**
 * Check if a variant has the correct dimensions for its purpose.
 * Returns null if ratio cannot be determined.
 */
export function validateVariantDimensions(
  variant: DistributionVariantDTO,
): { valid: boolean; expected: string | null; actual: string | null } {
  const expected = getRequiredRatio(variant.purpose);
  if (!expected || !variant.width || !variant.height) {
    return { valid: true, expected, actual: null };
  }

  const [expW, expH] = expected.split(":").map(Number);
  const actualRatio  = variant.width / variant.height;
  const expectedRatio = expW / expH;
  const tolerance = 0.05;
  const valid = Math.abs(actualRatio - expectedRatio) <= tolerance;

  return {
    valid,
    expected,
    actual: variant.ratio ?? `${variant.width}:${variant.height}`,
  };
}

/**
 * Given a list of variants, return only the ones relevant to a specific channel.
 */
export function filterVariantsByChannel(
  variants:   DistributionVariantDTO[],
  channel:    string,
): DistributionVariantDTO[] {
  return variants.filter(v => v.channel === channel);
}

/**
 * Given a list of variants, return only the ones relevant to a specific product.
 */
export function filterVariantsByProduct(
  variants:   DistributionVariantDTO[],
  productId:  string,
): DistributionVariantDTO[] {
  return variants.filter(v => v.productId === productId);
}

/**
 * Counts ready vs total variants per channel.
 */
export function summarizeVariantReadinessByChannel(
  variants: DistributionVariantDTO[],
): Record<string, { total: number; ready: number }> {
  const result: Record<string, { total: number; ready: number }> = {};
  for (const v of variants) {
    if (!result[v.channel]) result[v.channel] = { total: 0, ready: 0 };
    result[v.channel].total++;
    if (v.isReady) result[v.channel].ready++;
  }
  return result;
}
