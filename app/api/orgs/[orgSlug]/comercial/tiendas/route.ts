/**
 * POST /api/orgs/[orgSlug]/comercial/tiendas
 *
 * Actions:
 *   store_detail         — full detail (legacy, still works)
 *   store_summary        — lightweight: store + health only
 *   store_inventory      — paginated inventory (limit/offset/search/activeOnly)
 *   store_shortages      — shortages + assortment needs
 *   store_suggestions    — suggestions + assortment needs
 *   store_textile_coverage — textile size/color coverage
 *   store_main_warehouse — main warehouse stock
 *   store_rules          — (handled by policies/ route)
 *   stock_lookup         — search across stores + main warehouse
 *
 * Sprint: TIENDAS-PERFORMANCE-LOAD-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  getStoreDetail,
  getStoreSummary,
  getStoreShortages,
  getStoreSuggestionsLazy,
  getStoreTextileCoverage,
  getStoreMainWarehouse,
  getStoreInventoryPaginated,
} from "@/lib/comercial/tiendas/store-replenishment-service";
import {
  getStoreInventoryByWarehouse,
  getStoreWarehouses,
  getMainWarehouse,
  getMainWarehouseAvailability,
} from "@/lib/comercial/tiendas/sag-store-adapter";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const body = await req.json();
  const action = body.action as string;

  switch (action) {
    case "store_detail": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const detail = await getStoreDetail(orgId, storeId);
        return NextResponse.json({ detail });
      } catch {
        return NextResponse.json({ detail: null });
      }
    }

    case "store_summary": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const summary = await getStoreSummary(orgId, storeId);
        return NextResponse.json({ summary });
      } catch {
        return NextResponse.json({ summary: null });
      }
    }

    case "store_inventory": {
      const storeId = body.storeId as string;
      const warehouseCode = body.warehouseCode as string | undefined;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        // Paginated from cache when possible
        const result = await getStoreInventoryPaginated(orgId, storeId, {
          limit:      body.limit ?? 200,
          offset:     body.offset ?? 0,
          search:     body.search,
          activeOnly: body.activeOnly ?? true,
        });
        return NextResponse.json(result);
      } catch {
        return NextResponse.json({ inventory: [], total: 0, limit: 200, offset: 0 });
      }
    }

    case "store_shortages": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const result = await getStoreShortages(orgId, storeId);
        return NextResponse.json(result);
      } catch {
        return NextResponse.json({ shortages: [], assortmentNeeds: [], hasRules: false });
      }
    }

    case "store_suggestions": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const result = await getStoreSuggestionsLazy(orgId, storeId);
        return NextResponse.json(result);
      } catch {
        return NextResponse.json({ suggestions: [], assortmentNeeds: [], hasRules: false });
      }
    }

    case "store_textile_coverage": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const result = await getStoreTextileCoverage(orgId, storeId);
        return NextResponse.json(result);
      } catch {
        return NextResponse.json({ textileCoverage: [], hasRules: false });
      }
    }

    case "store_main_warehouse": {
      try {
        const result = await getStoreMainWarehouse(orgId);
        return NextResponse.json(result);
      } catch {
        return NextResponse.json({ mainStock: [] });
      }
    }

    case "stock_lookup": {
      const query = (body.query as string || "").toUpperCase().trim();
      if (!query || query.length < 2) {
        return NextResponse.json({ error: "Query too short" }, { status: 400 });
      }
      try {
        const [stores, mainWh] = await Promise.all([
          getStoreWarehouses(orgId),
          getMainWarehouse(orgId),
        ]);

        const results: Array<{
          storeName: string; warehouseCode: string;
          referenceCode: string; size: string; color: string;
          currentUnits: number; isMainWarehouse: boolean;
        }> = [];

        // Search main warehouse
        if (mainWh) {
          const mainStock = await getMainWarehouseAvailability(orgId, mainWh.code);
          for (const item of mainStock) {
            if (item.referenceCode.includes(query)) {
              results.push({
                storeName: mainWh.name,
                warehouseCode: mainWh.code,
                referenceCode: item.referenceCode,
                size: item.size,
                color: item.color,
                currentUnits: Math.max(0, item.availableUnits - item.reservedUnits),
                isMainWarehouse: true,
              });
            }
          }
        }

        // Search stores (limit to first 5 stores to avoid N+1)
        const storesToSearch = stores.slice(0, 5);
        const storeInvResults = await Promise.all(
          storesToSearch.map(s => getStoreInventoryByWarehouse(orgId, s.id, s.sagWarehouseCode)
            .then(inv => inv.filter(v => v.referenceCode.includes(query)).map(v => ({
              storeName: s.name,
              warehouseCode: s.sagWarehouseCode,
              referenceCode: v.referenceCode,
              size: v.size,
              color: v.color,
              currentUnits: v.currentUnits,
              isMainWarehouse: false,
            })))
            .catch(() => [])
          )
        );
        for (const batch of storeInvResults) results.push(...batch);

        return NextResponse.json({ results: results.slice(0, 100) });
      } catch {
        return NextResponse.json({ results: [] });
      }
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
