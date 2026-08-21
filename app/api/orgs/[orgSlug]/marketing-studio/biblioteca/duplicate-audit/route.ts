/**
 * app/api/orgs/[orgSlug]/marketing-studio/biblioteca/duplicate-audit/route.ts
 *
 * MARKETING-R4A-SECURITY-CLOSEOUT-R1 — ProductEntity Duplicate Audit
 *
 * GET — Counts ProductEntity duplicates by (organizationId, normalized sku).
 *       READ-ONLY. Zero writes. No data modification.
 *
 * Returns:
 *   { ok, totalProducts, withSku, duplicateSkus, duplicateRows, details[] }
 *
 * SECURITY:
 *   - requireOrgAccess enforces tenant membership.
 *   - hasMinRole AGENTIK_ADMIN — audit is admin-only.
 *   - organizationId from server session.
 *
 * MIGRATION_PROPOSAL (not applied):
 *   CREATE UNIQUE INDEX "ProductEntity_organizationId_sku_unique"
 *     ON "ProductEntity" ("organizationId", "sku")
 *     WHERE "sku" IS NOT NULL;
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { hasMinRole }                from "@/lib/auth/module-access";
import { prisma }                    from "@/lib/prisma";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }                  = await ctx.params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!hasMinRole(membership.role, "AGENTIK_ADMIN")) {
      return NextResponse.json({ error: "AGENTIK_ADMIN required for audit" }, { status: 403 });
    }

    const orgId = organization.id;

    // Load all ProductEntities with SKU for this org
    const products = await prisma.productEntity.findMany({
      where: { organizationId: orgId },
      select: { id: true, sku: true, name: true, createdAt: true, productLine: true },
      orderBy: { createdAt: "asc" },
    });

    const totalProducts = products.length;
    const withSku = products.filter(p => p.sku !== null && p.sku !== "").length;

    // Count duplicates by normalized SKU
    const skuGroups = new Map<string, typeof products>();
    for (const p of products) {
      if (!p.sku) continue;
      const normalized = p.sku.trim().toUpperCase().replace(/\s{2,}/g, " ");
      if (!skuGroups.has(normalized)) skuGroups.set(normalized, []);
      skuGroups.get(normalized)!.push(p);
    }

    const duplicates: Array<{
      sku:   string;
      count: number;
      ids:   string[];
    }> = [];

    for (const [sku, group] of skuGroups) {
      if (group.length > 1) {
        duplicates.push({
          sku,
          count: group.length,
          ids:   group.map(p => p.id),
        });
      }
    }

    const duplicateRows = duplicates.reduce((s, d) => s + d.count, 0);

    return NextResponse.json({
      ok:             true,
      zeroWrites:     true,
      totalProducts,
      withSku,
      uniqueSkus:     skuGroups.size,
      duplicateSkus:  duplicates.length,
      duplicateRows,
      migrationSafe:  duplicates.length === 0,
      migrationSQL:   duplicates.length === 0
        ? 'CREATE UNIQUE INDEX "ProductEntity_organizationId_sku_unique" ON "ProductEntity" ("organizationId", "sku") WHERE "sku" IS NOT NULL;'
        : "BLOCKED — resolve duplicates first",
      details:        duplicates.slice(0, 50), // cap at 50 for response size
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[duplicate-audit] error:", msg);
    return NextResponse.json({ error: "Error en auditoria" }, { status: 500 });
  }
}
