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
import {
  loadStoreInventoryByLine,
  getInventoryLineCounts,
  loadInventoryVariants,
  diagnoseInventoryByLine,
} from "@/lib/comercial/tiendas/store-inventory-by-line";
import {
  loadStoreNeedsByLine,
} from "@/lib/comercial/tiendas/store-needs-by-line";
import type { NeedLine, NeedType, NeedSortBy, NeedSizeClass } from "@/lib/comercial/tiendas/store-needs-by-line";
import { loadWarehouseFirstNeeds } from "@/lib/comercial/tiendas/store-warehouse-first-needs";
import type { WHFLine, WHFSortBy } from "@/lib/comercial/tiendas/store-warehouse-first-needs";
import { loadStoreCoverage, loadStoreCoverageCandidates } from "@/lib/comercial/tiendas/store-coverage-service";
import { loadStoreUnitNeeds } from "@/lib/comercial/tiendas/store-unit-needs-service";
import { loadStoreDiscounts } from "@/lib/comercial/tiendas/store-discount-service";
import { getStoreDerroteroCoverage, getAllStoresDerroteroCoverageSummary } from "@/lib/comercial/tiendas/store-derrotero-service";
import { buildStoreDerroteroFromSalesPortfolioDerrotero } from "@/lib/comercial/tiendas/store-derrotero-adapter";
import { loadCertifiedStoreIntelligence } from "@/lib/comercial/tiendas/store-certified-intelligence-service";

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
    "store_distribution_detail", "store_inventory_by_line", "store_needs_by_line", "store_warehouse_first_needs",
    "distribution_effective_config",
    "distribution_preview_impact", "distribution_save_config",
    "derrotero_coverage", "store_coverage", "store_coverage_candidates", "store_discounts", "certified_store_intelligence",
    "store_unit_needs",
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

    // ── INVENTORY BY LINE (AGENTIK-STORES-INVENTORY-BY-LINE-01) ─────────────

    case "store_inventory_by_line": {
      const sub = body.sub as string;
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });

      switch (sub) {
        case "counts": {
          try {
            const counts = await getInventoryLineCounts(orgId, storeId);
            return NextResponse.json({ counts });
          } catch (err) {
            console.error("[INV-BY-LINE] counts error", storeId, err instanceof Error ? err.message : err);
            return NextResponse.json({ error: "Error al cargar conteos de inventario", counts: [] }, { status: 500 });
          }
        }
        case "load": {
          const line = body.line as string;
          if (!line) return NextResponse.json({ error: "Missing line" }, { status: 400 });
          try {
            const result = await loadStoreInventoryByLine(orgId, {
              storeId,
              line: line as import("@/lib/comercial/tiendas/store-inventory-by-line").InventoryLine,
              group: body.group,
              subgroup: body.subgroup,
              sizeClass: body.sizeClass,
              inventoryState: body.inventoryState,
              unclassifiedReason: body.unclassifiedReason,
              kpiFilter: body.kpiFilter,
              sortBy: body.sortBy,
              search: body.search,
              page: body.page ?? 1,
              pageSize: Math.min(body.pageSize ?? 25, 50),
            });
            return NextResponse.json(result);
          } catch (err) {
            console.error("[INV-BY-LINE] load error", storeId, line, err instanceof Error ? err.message : err);
            return NextResponse.json({ error: "Error al cargar inventario por linea", line, summary: null, items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 }, availableFilters: null, dataFreshness: null }, { status: 500 });
          }
        }
        case "variants": {
          const referenceCode = body.referenceCode as string;
          if (!referenceCode) return NextResponse.json({ error: "Missing referenceCode" }, { status: 400 });
          try {
            const variants = await loadInventoryVariants(orgId, storeId, referenceCode);
            return NextResponse.json({ variants });
          } catch {
            return NextResponse.json({ variants: [] });
          }
        }
        case "diagnose": {
          try {
            const diag = await diagnoseInventoryByLine(orgId, storeId);
            return NextResponse.json(diag);
          } catch {
            return NextResponse.json({ error: "diagnostic_failed" });
          }
        }
        default:
          return NextResponse.json({ error: "Unknown sub-action" }, { status: 400 });
      }
    }

    // ── NEEDS BY LINE (AGENTIK-STORES-NEEDS-BY-LINE-01) ─────────────────────

    case "store_needs_by_line": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const result = await loadStoreNeedsByLine(orgId, {
          storeId,
          line:      (body.line ?? "CASTILLITOS") as NeedLine,
          needType:  (body.needType ?? "ALL") as NeedType,
          sortBy:    (body.sortBy ?? "SHORTAGE_DESC") as NeedSortBy,
          sizeClass: (body.sizeClass ?? "ALL") as NeedSizeClass,
          search:    body.search as string | undefined,
          page:      body.page ?? 1,
          pageSize:  Math.min(body.pageSize ?? 25, 50),
        });
        return NextResponse.json(result);
      } catch (err) {
        console.error("[NEEDS-BY-LINE] error", storeId, err instanceof Error ? err.message : err);
        return NextResponse.json({
          error: "Error al cargar necesidades por linea",
          line: body.line ?? "CASTILLITOS",
          summary: { directReplenishment: 0, replacement: 0, noAlternative: 0, total: 0 },
          items: [],
          pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
          lineCounts: [],
          availableSizeClasses: [],
          dataFreshness: null,
        }, { status: 500 });
      }
    }

    // ── WAREHOUSE-FIRST NEEDS (AGENTIK-STORES-NEEDS-WAREHOUSE-FIRST-RESOLUTION-01) ─

    case "store_warehouse_first_needs": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const result = await loadWarehouseFirstNeeds(orgId, {
          storeId,
          line:     (body.line ?? "CASTILLITOS") as WHFLine,
          sortBy:   (body.sortBy ?? "URGENCY_DESC") as WHFSortBy,
          search:   body.search as string | undefined,
          page:     body.page ?? 1,
          pageSize: Math.min(body.pageSize ?? 25, 50),
        });
        return NextResponse.json(result);
      } catch (err) {
        console.error("[WAREHOUSE-FIRST-NEEDS] error", storeId, err instanceof Error ? err.message : err);
        return NextResponse.json({
          error: "Error al cargar necesidades warehouse-first",
          line: body.line ?? "CASTILLITOS",
          summary: { availableForSupply: 0, totalSuggestedUnits: 0, sameRefReplenishments: 0, replacements: 0, noSolution: 0 },
          items: [],
          noSolutionItems: [],
          pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
          lineCounts: [],
          dataFreshness: null,
        }, { status: 500 });
      }
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

    // ── STRUCTURAL COVERAGE (AGENTIK-STORES-COVERAGE-TAB-01) ──────────────────

    case "store_coverage": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const coverage = await loadStoreCoverage(orgId, storeId);
        return NextResponse.json({ coverage });
      } catch (err) {
        console.error("[STORE-COVERAGE] error", storeId, err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al cargar cobertura estructural" }, { status: 500 });
      }
    }

    // ── STRUCTURAL COVERAGE CANDIDATES (AGENTIK-STORES-COVERAGE-TAB-01) ────────

    case "store_coverage_candidates": {
      const storeId = body.storeId as string;
      const structureKeys = body.structureKeys as string[];
      const coverageStatuses = body.coverageStatuses as Record<string, string> | undefined;
      if (!storeId || !Array.isArray(structureKeys) || structureKeys.length === 0) {
        return NextResponse.json({ error: "Missing storeId or structureKeys" }, { status: 400 });
      }
      try {
        const candidates = await loadStoreCoverageCandidates(
          orgId, storeId, structureKeys,
          coverageStatuses as Record<string, import("@/lib/comercial/tiendas/store-coverage-service").StructuralCoverageStatus> | undefined,
        );
        return NextResponse.json({ candidates });
      } catch (err) {
        console.error("[STORE-COVERAGE-CANDIDATES] error", storeId, err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al cargar candidatos de cobertura" }, { status: 500 });
      }
    }

    // ── UNIT-BASED NEEDS (AGENTIK-STORES-UNIT-BASED-NEEDS-ENGINE-01) ───────────

    case "store_unit_needs": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const unitNeeds = await loadStoreUnitNeeds(orgId, storeId);
        return NextResponse.json({ unitNeeds });
      } catch (err) {
        console.error("[STORE-UNIT-NEEDS] error", storeId, err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al cargar necesidades por unidades" }, { status: 500 });
      }
    }

    // ── STORE DISCOUNTS (AGENTIK-STORES-DISCOUNTS-TAB-01) ──────────────────────

    case "store_discounts": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const discounts = await loadStoreDiscounts(orgId, storeId);
        return NextResponse.json({ discounts });
      } catch (err) {
        console.error("[STORE-DISCOUNTS] error", storeId, err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al cargar descuentos" }, { status: 500 });
      }
    }

    // ── DERROTERO COVERAGE (AGENTIK-STORES-DERROTERO-COVERAGE-FOUNDATION-01) ──

    case "derrotero_coverage": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const coverage = await getStoreDerroteroCoverage(orgId, storeId);
        const editable = canEditDistributionConfig(membership.role);
        return NextResponse.json({ coverage, editable });
      } catch (err) {
        console.error("[DERROTERO-COVERAGE] error", storeId, err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al cargar cobertura del derrotero" }, { status: 500 });
      }
    }

    case "derrotero_catalog": {
      try {
        const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");
        // Return just the entry structure — no coverage, no inventory
        const catalog = {
          castillitos: derrotero.lines.castillitos.map(g => ({
            groupCode: g.groupCode,
            groupName: g.groupName,
            sagGrupo: g.sagGrupo,
            entries: g.entries.map(e => ({
              entryCode: e.entryCode,
              entryName: e.entryName,
              sagSubgrupo: e.sagSubgrupo,
              minUnitsPerRef: e.minUnitsPerRef,
              idealUnitsPerRef: e.idealUnitsPerRef,
              maxUnitsPerRef: e.maxUnitsPerRef,
              active: e.active,
            })),
          })),
          latinKids: derrotero.lines.latinKids.map(g => ({
            groupCode: g.groupCode,
            groupName: g.groupName,
            entries: g.entries.map(e => ({
              entryCode: e.entryCode,
              entryName: e.entryName,
              sagSubgrupo: e.sagSubgrupo,
              minUnitsPerRef: e.minUnitsPerRef,
              idealUnitsPerRef: e.idealUnitsPerRef,
              maxUnitsPerRef: e.maxUnitsPerRef,
              active: e.active,
            })),
          })),
          accessories: derrotero.lines.accessories.map(g => ({
            groupCode: g.groupCode,
            groupName: g.groupName,
            entries: g.entries.map(e => ({
              entryCode: e.entryCode,
              entryName: e.entryName,
              sizeClass: e.sizeClass,
              idealUnitsPerRef: e.idealUnitsPerRef,
              active: e.active,
            })),
          })),
          totalEntries: derrotero.totalEntries,
        };
        return NextResponse.json({ catalog });
      } catch (err) {
        console.error("[DERROTERO-CATALOG] error", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al cargar catalogo del derrotero" }, { status: 500 });
      }
    }

    // ── STORE INTELLIGENCE ────────────────────────────────────────────────────
    // AGENTIK-STORES-CERTIFIED-SALES-MIGRATION-01: the uncertified
    // "store_intelligence" action (CustomerOrderLine × warehouseId) was removed.
    // certified_store_intelligence is the ONLY sales intelligence endpoint.

    // ── CERTIFIED STORE INTELLIGENCE (AGENTIK-STORES-INTELLIGENCE-CERTIFIED-MVP-01)
    case "certified_store_intelligence": {
      const storeId = body.storeId as string;
      if (!storeId) return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
      try {
        const certifiedIntelligence = await loadCertifiedStoreIntelligence(orgId, storeId);
        return NextResponse.json({ certifiedIntelligence });
      } catch (err) {
        console.error("[CERTIFIED-STORE-INTELLIGENCE] error", storeId, err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al cargar inteligencia certificada" }, { status: 500 });
      }
    }

    case "derrotero_summary": {
      try {
        const summary = await getAllStoresDerroteroCoverageSummary(orgId);
        // Serialize Map → plain object for JSON
        const simulationSerialized = {
          ...summary.simulation,
          allocationByStore: Object.fromEntries(summary.simulation.allocationByStore),
        };
        return NextResponse.json({
          warehouseMatrix: summary.warehouseMatrix,
          gapSummaries: summary.gapSummaries,
          priorities: summary.priorities,
          simulation: simulationSerialized,
        });
      } catch (err) {
        console.error("[DERROTERO-SUMMARY] error", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al cargar resumen de derrotero" }, { status: 500 });
      }
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
