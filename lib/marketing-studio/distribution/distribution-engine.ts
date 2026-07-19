/**
 * lib/marketing-studio/distribution/distribution-engine.ts
 *
 * MS-14 — Distribution Runtime: State computation engine
 *
 * buildDistributionState() — loads all data, computes DistributionState
 *
 * SERVER ONLY — called from Distribution Center RSC page.
 */

import {
  listDistributionVariants,
  listDistributionPipelines,
  listDistributionSchedules,
} from "./distribution-repository";
import {
  computeDistributionHealth,
  deriveChannelHealthLevel,
} from "./distribution-health";
import {
  computeVariantGaps,
} from "./distribution-variants";
import {
  generateDistributionLucaRecos,
  generateDistributionMilaRecos,
} from "./distribution-recommendations";
import {
  DISTRIBUTION_CHANNEL,
  DISTRIBUTION_STATUS,
  type DistributionState,
  type ChannelCoverageItem,
} from "./distribution-types";
import { listProductConsoleItems } from "@/lib/marketing-studio/products/product-query-service";

// ── Engine ─────────────────────────────────────────────────────────────────────

export async function buildDistributionState(
  organizationId: string,
): Promise<DistributionState> {
  const [products, variants, pipelines, schedules] = await Promise.all([
    listProductConsoleItems(organizationId),
    listDistributionVariants(organizationId),
    listDistributionPipelines(organizationId),
    listDistributionSchedules(organizationId),
  ]);

  const productIds     = products.map(p => p.productId);
  const productCount   = productIds.length;
  const ACTIVE_STATUSES = ["draft", "scheduled", "queued", "publishing"] as const;
  const activePipelines = pipelines.filter(p =>
    (ACTIVE_STATUSES as readonly string[]).includes(p.status),
  );

  const scheduledDrops = schedules.filter(s => s.status === "pending" || s.status === "queued");

  // ── Channel coverage ────────────────────────────────────────────────────────
  const channels = Object.values(DISTRIBUTION_CHANNEL);
  const channelCoverage: ChannelCoverageItem[] = channels.map(channel => {
    if (productCount === 0) {
      return {
        channel,
        totalProducts:   0,
        covered:         0,
        missing:         0,
        coveragePct:     0,
        healthLevel:     "unknown",
        lastPublishedAt: null,
      };
    }

    // A product is "covered" for a channel if it has at least one ready variant for that channel
    const coveredProductIds = new Set(
      variants
        .filter(v => v.channel === channel && v.isReady && v.productId)
        .map(v => v.productId!),
    );

    const covered    = productIds.filter(id => coveredProductIds.has(id)).length;
    const missing    = productCount - covered;
    const coveragePct = productCount > 0 ? (covered / productCount) * 100 : 0;

    // Most recent publication for this channel
    const channelSchedules = schedules
      .filter(s => s.channel === channel && s.status === "published")
      .sort((a, b) =>
        (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? ""),
      );
    const lastPublishedAt = channelSchedules[0]?.scheduledAt ?? null;

    return {
      channel,
      totalProducts: productCount,
      covered,
      missing,
      coveragePct,
      healthLevel:   deriveChannelHealthLevel(coveragePct),
      lastPublishedAt,
    };
  });

  // ── Variant gaps ────────────────────────────────────────────────────────────
  const allVariantGaps = channels.flatMap(channel =>
    computeVariantGaps(productIds, channel, variants),
  );

  // Deduplicate and sort by missingCount desc
  const variantGaps = allVariantGaps
    .sort((a, b) => b.missingCount - a.missingCount)
    .slice(0, 20);

  // ── Health summary ──────────────────────────────────────────────────────────
  const health = computeDistributionHealth({
    pipelines,
    schedules,
    channelCoverage,
  });

  // ── Intelligence ────────────────────────────────────────────────────────────
  const lucaRecos = generateDistributionLucaRecos({
    pipelines:       activePipelines,
    schedules:       scheduledDrops,
    channelCoverage,
    variantGaps,
    productCount,
  });

  const milaRecos = generateDistributionMilaRecos({
    channelCoverage,
    variantGaps,
    productCount,
  });

  return {
    organizationId,
    computedAt:      new Date().toISOString(),
    productCount,
    activePipelines,
    scheduledDrops,
    channelCoverage,
    variantGaps,
    health,
    lucaRecos,
    milaRecos,
  };
}
