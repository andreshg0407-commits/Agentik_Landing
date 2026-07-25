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
import {
  buildCanonicalStoreDistribution,
  getCanonicalStoreDetail,
} from "@/lib/comercial/tiendas/store-distribution-service";
import {
  getEffectiveStoreConfig,
  previewRuleImpact,
  saveDistributionConfig,
  canEditDistributionConfig,
} from "@/lib/comercial/tiendas/store-distribution-actions";
import {
  resolveActiveStores,
  resolveInactiveStores,
  activateStore,
  deactivateStore,
  canManageStoreGovernance,
  assertStoreActive,
} from "@/lib/comercial/tiendas/store-governance-service";
import { STORE_INACTIVE_CODE, STORE_INACTIVE_MESSAGE } from "@/lib/comercial/tiendas/store-governance-types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization, membership, user } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const body = await req.json();
  const action = body.action as string;

  // TERCERO — Guard: reject operational actions for inactive stores
  const GUARDED_ACTIONS = new Set([
    "store_detail", "store_summary", "store_inventory",
    "store_shortages", "store_suggestions", "store_textile_coverage",
    "store_distribution_detail", "distribution_effective_config",
    "distribution_preview_impact", "distribution_save_config",
  ]);
  if (GUARDED_ACTIONS.has(action) && body.storeId) {
    try {
      await assertStoreActive(orgId, body.storeId as string);
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "STORE_INACTIVE") {
        return NextResponse.json(
          { error: STORE_INACTIVE_MESSAGE, code: STORE_INACTIVE_CODE },
          { status: 409 },
        );
      }
    }
  }

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

    case "store_distribution": {
      try {
        const distribution = await buildCanonicalStoreDistribution(orgId);
        return NextResponse.json({ distribution });
      } catch {
        return NextResponse.json({ distribution: null });
      }
    }

    case "store_distribution_detail": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const detail = await getCanonicalStoreDetail(orgId, storeId);
        return NextResponse.json({ detail });
      } catch {
        return NextResponse.json({ detail: null });
      }
    }

    case "distribution_effective_config": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const config = await getEffectiveStoreConfig(orgId, storeId);
        const editable = canEditDistributionConfig(membership.role);
        return NextResponse.json({ config, editable });
      } catch {
        return NextResponse.json({ config: null, editable: false });
      }
    }

    case "distribution_preview_impact": {
      const storeId = body.storeId as string;
      const proposedConfig = body.proposedConfig;
      if (!storeId || !proposedConfig) {
        return NextResponse.json({ error: "Missing storeId or proposedConfig" }, { status: 400 });
      }
      try {
        const preview = await previewRuleImpact(orgId, storeId, proposedConfig);
        return NextResponse.json({ preview });
      } catch {
        return NextResponse.json({ preview: null });
      }
    }

    case "distribution_save_config": {
      const storeId = body.storeId as string;
      const storeName = body.storeName as string;
      const config = body.config;
      const motivo = (body.motivo as string) || "Sin motivo especificado";
      if (!storeId || !config) {
        return NextResponse.json({ error: "Missing storeId or config" }, { status: 400 });
      }
      const result = await saveDistributionConfig({
        orgId,
        storeId,
        storeName: storeName || storeId,
        userId: user.id,
        role: membership.role,
        config,
        motivo,
      });
      if (!result.ok) {
        // Validation errors → 400; permission errors → 403
        const status = result.validationErrors ? 400 : 403;
        return NextResponse.json({ error: result.error, validationErrors: result.validationErrors }, { status });
      }
      return NextResponse.json({ ok: true, config: result.config });
    }

    // ── GOVERNANCE (AGENTIK-STORES-ACTIVE-STORE-GOVERNANCE-01) ──────────────

    case "store_governance_list": {
      const active   = await resolveActiveStores(orgId);
      const inactive = await resolveInactiveStores(orgId);
      const canManage = canManageStoreGovernance(membership.role);
      return NextResponse.json({ active, inactive, canManage });
    }

    case "store_activate": {
      if (!canManageStoreGovernance(membership.role)) {
        return NextResponse.json({ error: "Permiso insuficiente" }, { status: 403 });
      }
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const record = await activateStore(orgId, storeId, user.id, membership.role);
        return NextResponse.json({ ok: true, store: record });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error";
        return NextResponse.json({ error: msg }, { status: 422 });
      }
    }

    case "store_deactivate": {
      if (!canManageStoreGovernance(membership.role)) {
        return NextResponse.json({ error: "Permiso insuficiente" }, { status: 403 });
      }
      const storeId = body.storeId as string;
      const reason  = body.reason as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      if (!reason || reason.trim().length === 0) {
        return NextResponse.json({ error: "Motivo obligatorio al desactivar" }, { status: 400 });
      }
      try {
        const record = await deactivateStore(orgId, storeId, reason, user.id, membership.role);
        return NextResponse.json({ ok: true, store: record });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error";
        return NextResponse.json({ error: msg }, { status: 422 });
      }
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
