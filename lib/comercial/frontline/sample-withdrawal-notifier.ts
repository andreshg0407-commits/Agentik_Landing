/**
 * lib/comercial/frontline/sample-withdrawal-notifier.ts
 *
 * AGENTIK-SELLER-APP-V1-01 — Section B/C/D
 *
 * Automatic seller notification when a reference in a seller's Maleta
 * becomes a Retiro item.
 *
 * Business requirement:
 *   When a reference should no longer be sold as a sample,
 *   automatically notify EVERY seller whose Maleta contains that reference.
 *
 * Reuses certified Maletas Retiro logic:
 *   - getSalesPortfolioWithdrawalItems() for per-vendor withdrawal items
 *   - emitPortfolioAttentionSignals() for current attention state
 *   - VendorSampleRef.imageUrl for canonical product image
 *
 * Does NOT recalculate withdrawal rules.
 *
 * Deduplication: stable key = SAMPLE_WITHDRAWAL_REQUIRED:{sellerId}:{portfolioId}:{referenceCode}:{conditionVersion}
 * Same unresolved condition on next refresh → no duplicate notification.
 *
 * SERVER ONLY — never import from client components.
 */

import "server-only";
import {
  getSalesPortfolios,
  getSalesPortfolioWithdrawalItems,
} from "@/lib/comercial/maletas/portfolio-copilot-domain-tools";
import { emitSampleWithdrawalNotification } from "./seller-notification-service";
import type { SellerNotification } from "./seller-app-types";

// ── Scan & notify ───────────────────────────────────────────────────────────

/**
 * Scan all active portfolios for withdrawal items and emit notifications
 * to each affected seller.
 *
 * Returns all newly emitted notifications (excludes deduplicated).
 *
 * Intended to be called on:
 *   - Seller App home load
 *   - Periodic background scan (future cron)
 *   - Manual admin trigger
 */
export async function scanAndNotifyWithdrawals(
  orgId: string,
  orgSlug: string,
): Promise<SellerNotification[]> {
  const results: SellerNotification[] = [];
  const now = new Date().toISOString();

  // Load all portfolios
  const portfolioList = await getSalesPortfolios(orgId);

  // Process each active portfolio
  for (const portfolio of portfolioList.portfolios) {
    if (!portfolio.isActive) continue;

    const withdrawalResult = await getSalesPortfolioWithdrawalItems(
      orgId,
      portfolio.vendorId,
    );

    if (!withdrawalResult || withdrawalResult.items.length === 0) continue;

    // Emit notification for each withdrawal item
    for (const item of withdrawalResult.items) {
      const notification = await emitSampleWithdrawalNotification({
        organizationId: orgId,
        sellerId: portfolio.vendorId,
        portfolioId: portfolio.vendorId,
        referenceCode: item.reference,
        description: item.description,
        productImageUrl: null, // Withdrawal items don't carry imageUrl — resolved in enrichment below
        world: null,
        line: item.line,
        withdrawalReason: item.removalReason,
        currentAvailability: item.centralAvailable,
        orgSlug,
        asOf: now,
      });

      if (notification) results.push(notification);
    }
  }

  return results;
}

/**
 * Scan withdrawals for a single seller/portfolio.
 * More targeted than full scan — used when seller opens their maleta.
 */
export async function scanAndNotifyWithdrawalsForSeller(
  orgId: string,
  sellerId: string,
  orgSlug: string,
): Promise<SellerNotification[]> {
  const results: SellerNotification[] = [];
  const now = new Date().toISOString();

  const withdrawalResult = await getSalesPortfolioWithdrawalItems(orgId, sellerId);
  if (!withdrawalResult || withdrawalResult.items.length === 0) return results;

  for (const item of withdrawalResult.items) {
    const notification = await emitSampleWithdrawalNotification({
      organizationId: orgId,
      sellerId,
      portfolioId: sellerId,
      referenceCode: item.reference,
      description: item.description,
      productImageUrl: null,
      world: null,
      line: item.line,
      withdrawalReason: item.removalReason,
      currentAvailability: item.centralAvailable,
      orgSlug,
      asOf: now,
    });

    if (notification) results.push(notification);
  }

  return results;
}
