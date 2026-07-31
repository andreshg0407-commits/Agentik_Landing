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
import { getStoreSnapshotWithMeta, invalidateStoreSnapshot } from "@/lib/comercial/tiendas/store-snapshot-service";
import { loadStoreUnitNeeds } from "@/lib/comercial/tiendas/store-unit-needs-service";
import { loadStoreReplenishmentPlan } from "@/lib/comercial/tiendas/store-replenishment-plan-service";
import {
  createReplenishmentDocuments,
  listReplenishmentDocuments,
  getReplenishmentDocument,
  exportReplenishmentDocument,
} from "@/lib/comercial/tiendas/store-replenishment-document-service";
import {
  transitionReplenishmentDocument,
  listDocumentEvents,
  DocumentNotFoundError,
  StaleDocumentStateError,
} from "@/lib/comercial/tiendas/store-replenishment-workflow-service";
import { InvalidWorkflowTransitionError, allowedTransitions } from "@/lib/comercial/tiendas/store-replenishment-workflow-engine";
import { loadStoreDiscounts } from "@/lib/comercial/tiendas/store-discount-service";
import { getStoreDerroteroCoverage, getAllStoresDerroteroCoverageSummary } from "@/lib/comercial/tiendas/store-derrotero-service";
import { buildStoreDerroteroFromSalesPortfolioDerrotero } from "@/lib/comercial/tiendas/store-derrotero-adapter";
import { loadCertifiedStoreIntelligence } from "@/lib/comercial/tiendas/store-certified-intelligence-service";

export const maxDuration = 60;

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
      invalidateStoreSnapshot(orgId);   // I2 — las políticas alimentan structureRules
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
        invalidateStoreSnapshot(orgId);   // I1 — gobernanza altera el universo del snapshot
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
        invalidateStoreSnapshot(orgId);   // I1 — gobernanza altera el universo del snapshot
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

    // ── REPLENISHMENT PLAN (AGENTIK-STORES-REPLENISHMENT-ENGINE-01) ────────────
    // Plan multi-tienda: no requiere storeId (asigna sobre el pool compartido).

    case "store_replenishment_plan": {
      try {
        const plan = await loadStoreReplenishmentPlan(orgId);
        // Serialize Maps → plain objects for JSON
        return NextResponse.json({
          plan: {
            ...plan,
            poolUsage: Object.fromEntries(plan.poolUsage),
          },
        });
      } catch (err) {
        console.error("[STORE-REPLENISHMENT-PLAN] error", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al construir el plan de surtido" }, { status: 500 });
      }
    }

    // ── STORE SNAPSHOT (AGENTIK-STORES-TRUTH-AUDIT-01 · F2) ────────────────────
    // Única fuente de verdad del módulo: contrato v1.2, corrida completa
    // assembler → S4 → S5 → S6 → KPIs. Sin Map (serializa directo).

    case "get_store_snapshot": {
      try {
        const { snapshot, metrics } = await getStoreSnapshotWithMeta(orgId);
        return NextResponse.json({ snapshot, metrics });
      } catch (err) {
        console.error("[STORE-SNAPSHOT] error", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al construir el StoreSnapshot" }, { status: 500 });
      }
    }

    // ── REPLENISHMENT DOCUMENTS (AGENTIK-STORES-REPLENISHMENT-DOCUMENT-01) ─────
    // Representación PERSISTIDA del plan certificado — cero recalculo.

    case "replenishment_document_create": {
      try {
        const generatedBy = (body.generatedBy as string) || "sistema";
        const result = await createReplenishmentDocuments(orgId, generatedBy);
        invalidateStoreSnapshot(orgId);   // I4 — documentRefs cambia (openCount/lastNumber)
        return NextResponse.json({ result });
      } catch (err) {
        console.error("[REPLENISHMENT-DOC-CREATE] error", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al crear documentos de surtido" }, { status: 500 });
      }
    }

    case "replenishment_document_list": {
      try {
        const documents = await listReplenishmentDocuments(orgId);
        return NextResponse.json({ documents });
      } catch (err) {
        console.error("[REPLENISHMENT-DOC-LIST] error", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al listar documentos de surtido" }, { status: 500 });
      }
    }

    case "replenishment_document_get": {
      const documentId = body.documentId as string;
      if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
      try {
        const doc = await getReplenishmentDocument(orgId, documentId);
        if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
        return NextResponse.json({ document: doc });
      } catch (err) {
        console.error("[REPLENISHMENT-DOC-GET] error", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al cargar documento de surtido" }, { status: 500 });
      }
    }

    case "replenishment_document_export": {
      const documentId = body.documentId as string;
      const format = body.format as string;
      if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
      // Decisión certificada #3: `pdf` NO se expone hasta producir PDF binario real.
      if (format !== "html" && format !== "xlsx") {
        return NextResponse.json(
          { error: "Formato inválido. Soportados: html, xlsx. (pdf se habilitará cuando exista PDF binario real.)" },
          { status: 400 },
        );
      }
      try {
        const file = await exportReplenishmentDocument(orgId, documentId, format);
        if (!file) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
        return NextResponse.json(file);
      } catch (err) {
        console.error("[REPLENISHMENT-DOC-EXPORT] error", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al exportar documento de surtido" }, { status: 500 });
      }
    }

    // ── REPLENISHMENT WORKFLOW (AGENTIK-STORES-REPLENISHMENT-FULFILLMENT-01) ───

    case "replenishment_document_transition": {
      const documentId = body.documentId as string;
      const transition = body.transition as string;
      const actorId = body.actorId as string;
      if (!documentId || !transition || !actorId) {
        return NextResponse.json({ error: "Missing documentId, transition o actorId" }, { status: 400 });
      }
      try {
        // occurredAt jamás se acepta del cliente — lo genera el servidor.
        const result = await transitionReplenishmentDocument(
          orgId,
          documentId,
          transition,
          { actorId, actorDisplayName: body.actorDisplayName as string | undefined },
          {
            note: body.note as string | undefined,
            metadata: body.metadata as Record<string, string | number | boolean> | undefined,
            idempotencyKey: body.idempotencyKey as string | undefined,
          },
        );
        invalidateStoreSnapshot(orgId);   // I5 — el status del documento altera documentRefs
        return NextResponse.json({ result, allowedNext: allowedTransitions(result.status) });
      } catch (err) {
        if (err instanceof InvalidWorkflowTransitionError) {
          return NextResponse.json({ error: err.message, code: err.code, allowed: err.allowed }, { status: 409 });
        }
        if (err instanceof StaleDocumentStateError) {
          return NextResponse.json({ error: err.message, code: err.code, currentStatus: err.currentStatus }, { status: 409 });
        }
        if (err instanceof DocumentNotFoundError) {
          return NextResponse.json({ error: err.message, code: err.code }, { status: 404 });
        }
        console.error("[REPLENISHMENT-WORKFLOW] error", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al transicionar documento" }, { status: 500 });
      }
    }

    case "replenishment_document_events": {
      const documentId = body.documentId as string;
      if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
      try {
        const events = await listDocumentEvents(orgId, documentId);
        return NextResponse.json({ events });
      } catch (err) {
        if (err instanceof DocumentNotFoundError) {
          return NextResponse.json({ error: err.message, code: err.code }, { status: 404 });
        }
        console.error("[REPLENISHMENT-WORKFLOW-EVENTS] error", err instanceof Error ? err.message : err);
        return NextResponse.json({ error: "Error al listar eventos" }, { status: 500 });
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
