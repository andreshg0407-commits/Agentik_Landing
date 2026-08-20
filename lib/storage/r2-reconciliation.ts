/**
 * lib/storage/r2-reconciliation.ts
 *
 * MARKETING-ASSET-STORAGE-R2-HARDENING-03B — DB↔R2 Reconciliation
 *
 * Read-only reconciliation tool that reports discrepancies between
 * database asset records and R2 storage objects.
 *
 * Server-only — never import from client components.
 *
 * SECURITY:
 *   - Read-only: never modifies, deletes, or creates anything.
 *   - Scoped to a single organizationId.
 *   - Uses HeadObject to check R2 existence (no ListObjects).
 *   - Reports orphans, missing, inconsistencies — does NOT fix them.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { R2Config } from "./r2-config";
import { r2Head, extractObjectKey } from "./r2-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReconciliationEntry {
  assetId: string;
  assetUrl: string | null;
  objectKey: string | null;
  sessionId: string;
  reviewStatus: string;
  generationStatus: string;
  assetType: string;
  createdAt: Date;
  issue: ReconciliationIssue;
  detail?: string;
}

export type ReconciliationIssue =
  | "OK"                         // DB record + R2 object both present
  | "NO_URL"                     // DB record has no assetUrl
  | "URL_NOT_R2"                 // assetUrl doesn't match R2 base (external URL)
  | "R2_OBJECT_MISSING"          // DB has URL, R2 object not found
  | "NO_OBJECT_KEY_IN_META"      // providerMeta lacks objectKey
  | "CHECKSUM_MISSING_IN_META"   // providerMeta lacks checksum
  | "PROVIDER_META_INCOMPLETE";  // providerMeta missing critical fields

export interface ReconciliationReport {
  organizationId: string;
  environment: string;
  timestamp: string;
  totalAssets: number;
  ok: number;
  noUrl: number;
  urlNotR2: number;
  r2ObjectMissing: number;
  noObjectKeyInMeta: number;
  checksumMissingInMeta: number;
  providerMetaIncomplete: number;
  entries: ReconciliationEntry[];
  productAssetLinkOrphans: number;
  legacyUrlCount: number;
}

// ── Reconciliation ────────────────────────────────────────────────────────────

/**
 * Runs a read-only reconciliation between DB asset records and R2.
 *
 * Checks performed per GeneratedAsset:
 *   1. Has assetUrl?
 *   2. URL matches R2_PUBLIC_BASE_URL?
 *   3. providerMeta has objectKey?
 *   4. providerMeta has checksum?
 *   5. R2 HeadObject confirms existence?
 *
 * Also checks ProductAssetLink orphans (link to nonexistent asset).
 *
 * @param limit — max assets to check (default 200, to avoid timeout)
 */
export async function reconcileDbR2(
  organizationId: string,
  config: R2Config,
  limit = 200,
): Promise<ReconciliationReport> {
  const report: ReconciliationReport = {
    organizationId,
    environment: config.environment,
    timestamp: new Date().toISOString(),
    totalAssets: 0,
    ok: 0,
    noUrl: 0,
    urlNotR2: 0,
    r2ObjectMissing: 0,
    noObjectKeyInMeta: 0,
    checksumMissingInMeta: 0,
    providerMetaIncomplete: 0,
    entries: [],
    productAssetLinkOrphans: 0,
    legacyUrlCount: 0,
  };

  // Load assets for this org (via session.organizationId)
  const assets = await prisma.generatedAsset.findMany({
    where: {
      session: { organizationId },
    },
    select: {
      id: true,
      assetUrl: true,
      sessionId: true,
      reviewStatus: true,
      generationStatus: true,
      assetType: true,
      providerMeta: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  report.totalAssets = assets.length;

  for (const asset of assets) {
    const entry: ReconciliationEntry = {
      assetId: asset.id,
      assetUrl: asset.assetUrl,
      objectKey: null,
      sessionId: asset.sessionId,
      reviewStatus: asset.reviewStatus,
      generationStatus: asset.generationStatus,
      assetType: asset.assetType,
      createdAt: asset.createdAt,
      issue: "OK",
    };

    // Check 1: Has URL?
    if (!asset.assetUrl) {
      entry.issue = "NO_URL";
      report.noUrl++;
      report.entries.push(entry);
      continue;
    }

    // Check 2: URL is R2?
    const objectKey = extractObjectKey(config, asset.assetUrl);
    if (!objectKey) {
      entry.issue = "URL_NOT_R2";
      entry.detail = "URL does not match R2_PUBLIC_BASE_URL — likely external/legacy";
      report.urlNotR2++;
      report.legacyUrlCount++;
      report.entries.push(entry);
      continue;
    }

    entry.objectKey = objectKey;

    // Check 3: providerMeta has objectKey?
    const meta = asset.providerMeta as Record<string, unknown> | null;
    if (!meta || !meta.objectKey) {
      entry.issue = "NO_OBJECT_KEY_IN_META";
      entry.detail = "providerMeta lacks objectKey field (legacy upload)";
      report.noObjectKeyInMeta++;
      report.legacyUrlCount++;
      report.entries.push(entry);
      continue;
    }

    // Check 4: providerMeta has checksum?
    if (!meta.checksum) {
      entry.issue = "CHECKSUM_MISSING_IN_META";
      report.checksumMissingInMeta++;
      report.entries.push(entry);
      continue;
    }

    // Check 5: R2 HeadObject
    const head = await r2Head(config, objectKey);
    if (!head.exists) {
      entry.issue = "R2_OBJECT_MISSING";
      entry.detail = `HeadObject returned 404 for key: ${objectKey}`;
      report.r2ObjectMissing++;
      report.entries.push(entry);
      continue;
    }

    // All checks passed
    report.ok++;
    entry.issue = "OK";
    report.entries.push(entry);
  }

  // Check ProductAssetLink orphans (link to asset that doesn't exist)
  const links = await prisma.productAssetLink.findMany({
    where: { organizationId },
    select: { id: true, assetId: true },
    take: limit,
  });

  const assetIds = new Set(assets.map((a) => a.id));
  // Also check if linked assets exist at all
  const linkedAssetIds = links.map((l) => l.assetId);
  const existingAssets = await prisma.generatedAsset.findMany({
    where: { id: { in: linkedAssetIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingAssets.map((a) => a.id));

  for (const link of links) {
    if (!existingIds.has(link.assetId)) {
      report.productAssetLinkOrphans++;
    }
  }

  return report;
}
