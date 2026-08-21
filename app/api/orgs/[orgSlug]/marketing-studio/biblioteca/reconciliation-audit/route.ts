/**
 * app/api/orgs/[orgSlug]/marketing-studio/biblioteca/reconciliation-audit/route.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A — Section A
 *
 * Read-only reconciliation audit: PIL refs vs CCS latest snapshot.
 * Compares ProductEntity (productLine=5, Import) references against
 * the active CCS snapshot to identify coverage gaps.
 *
 * GET — Returns reconciliation metrics
 *
 * SECURITY:
 * - requireOrgAccess: auth + org membership
 * - canAccessMarketingStudio: module access
 * - Read-only: zero writes, zero side effects
 * - organizationId from server session
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { prisma }                    from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);
    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    const organizationId = organization.id;

    // 1. PIL references (productLine=5, Import references)
    const pilProducts = await prisma.productEntity.findMany({
      where: { organizationId, productLine: "5", sku: { not: null } },
      select: { id: true, sku: true, name: true },
    });

    const pilRefSet = new Set<string>();
    for (const p of pilProducts) {
      if (p.sku) pilRefSet.add(p.sku.trim().toUpperCase().replace(/\s{2,}/g, " "));
    }

    // 2. CCS references (latest snapshot batch — flat denormalized table)
    //    Pattern: find latest snapshotAt, then query all rows with that timestamp
    const latestEntry = await prisma.commercialCoverageSnapshot.findFirst({
      where: { organizationId },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true },
    });

    let ccsRefSet = new Set<string>();
    let ccsSnapshotAt: string | null = null;

    if (latestEntry) {
      ccsSnapshotAt = latestEntry.snapshotAt.toISOString();
      const ccsRows = await prisma.commercialCoverageSnapshot.findMany({
        where: { organizationId, snapshotAt: latestEntry.snapshotAt },
        select: { refCode: true, disponible: true },
      });
      // Only include refs with disponible > 0 (active stock)
      for (const r of ccsRows) {
        if (r.disponible > 0) {
          ccsRefSet.add(r.refCode.trim().toUpperCase().replace(/\s{2,}/g, " "));
        }
      }
    }

    // 3. ProductEntity with assets (all products, not just PIL)
    const productsWithAssets = await prisma.productAssetLink.findMany({
      where: { organizationId },
      select: { productId: true },
      distinct: ["productId"],
    });
    const productIdsWithAssets = new Set(productsWithAssets.map(p => p.productId));

    // 4. All ProductEntities with SKU
    const allProducts = await prisma.productEntity.findMany({
      where: { organizationId, sku: { not: null } },
      select: { id: true, sku: true },
    });

    const allRefSet = new Set<string>();
    const refToProductId = new Map<string, string>();
    for (const p of allProducts) {
      if (p.sku) {
        const norm = p.sku.trim().toUpperCase().replace(/\s{2,}/g, " ");
        allRefSet.add(norm);
        refToProductId.set(norm, p.id);
      }
    }

    // 5. Compute reconciliation
    const inBothPilAndCcs = new Set([...pilRefSet].filter(r => ccsRefSet.has(r)));
    const pilOnlyRefs     = [...pilRefSet].filter(r => !ccsRefSet.has(r));
    const ccsOnlyRefs     = [...ccsRefSet].filter(r => !pilRefSet.has(r));

    const refsWithAssets = [...allRefSet].filter(r => {
      const pid = refToProductId.get(r);
      return pid ? productIdsWithAssets.has(pid) : false;
    });
    const refsWithoutAssets = [...allRefSet].filter(r => {
      const pid = refToProductId.get(r);
      return pid ? !productIdsWithAssets.has(pid) : true;
    });

    return NextResponse.json({
      ok:          true,
      zeroWrites:  true,
      organizationId,
      pil: {
        totalRefs:    pilRefSet.size,
        source:       "ProductEntity (productLine=5)",
      },
      ccs: {
        totalRefs:    ccsRefSet.size,
        snapshotAt:   ccsSnapshotAt,
        source:       "CommercialCoverageSnapshot (latest snapshotAt, disponible > 0)",
      },
      reconciliation: {
        inBoth:         inBothPilAndCcs.size,
        pilOnly:        pilOnlyRefs.length,
        ccsOnly:        ccsOnlyRefs.length,
        pilOnlySample:  pilOnlyRefs.slice(0, 20),
        ccsOnlySample:  ccsOnlyRefs.slice(0, 20),
      },
      assetCoverage: {
        totalProductRefs:   allRefSet.size,
        withAssets:          refsWithAssets.length,
        withoutAssets:       refsWithoutAssets.length,
        coveragePercent:     allRefSet.size > 0
          ? Math.round((refsWithAssets.length / allRefSet.size) * 100)
          : 0,
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[reconciliation-audit]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
