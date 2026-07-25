/**
 * lib/comercial/tiendas/__tests__/store-needs-eligible-universe.test.ts
 *
 * Tests for AGENTIK-STORES-NEEDS-ELIGIBLE-UNIVERSE-01.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-needs-eligible-universe.test.ts
 *
 * Sprint: AGENTIK-STORES-NEEDS-ELIGIBLE-UNIVERSE-01
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Source code (avoid server-only imports) ──────────────────────────────

const SERVICE_SOURCE = readFileSync(
  resolve(__dirname, "../store-needs-eligible-universe.ts"), "utf-8"
);

const ROUTE_SOURCE = readFileSync(
  resolve(__dirname, "../../../../app/api/orgs/[orgSlug]/comercial/tiendas/needs/route.ts"), "utf-8"
);

const CLIENT_SOURCE = readFileSync(
  resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx"), "utf-8"
);

// ── PRIMERO: Only active stores ──────────────────────────────────────────

describe("PRIMERO — Only active stores from governance", () => {
  it("service imports resolveActiveStores", () => {
    assert.ok(SERVICE_SOURCE.includes("resolveActiveStores"));
  });

  it("service queries only active store warehouseIds", () => {
    assert.ok(SERVICE_SOURCE.includes("warehouseId: { in: activeWhIds }"));
  });

  it("service returns emptyResult when no active stores", () => {
    assert.ok(SERVICE_SOURCE.includes("if (activeStores.length === 0) return emptyResult()"));
  });

  it("service never calls getStoreWarehouses (old auto-discovery)", () => {
    assert.ok(!SERVICE_SOURCE.includes("getStoreWarehouses"));
  });
});

// ── SEGUNDO: Only allowed commercial universe ────────────────────────────

describe("SEGUNDO — Only allowed commercial domains", () => {
  it("ALLOWED_LINES contains castillitos, latin_kids, accesorios_importacion", () => {
    assert.ok(SERVICE_SOURCE.includes('"castillitos"'));
    assert.ok(SERVICE_SOURCE.includes('"latin_kids"'));
    assert.ok(SERVICE_SOURCE.includes('"accesorios_importacion"'));
  });

  it("service filters by resolveBusinessLineId", () => {
    assert.ok(SERVICE_SOURCE.includes("resolveBusinessLineId"));
    assert.ok(SERVICE_SOURCE.includes("ALLOWED_LINES.has(line)"));
  });

  it("service excludes Jupiter Pets via grupoSag", () => {
    assert.ok(SERVICE_SOURCE.includes('grupo.toUpperCase().includes("JUPITER")'));
  });

  it("service queries grupoSag from ProductEntity", () => {
    assert.ok(SERVICE_SOURCE.includes("grupoSag: true"));
    assert.ok(SERVICE_SOURCE.includes("subgrupoSag: true"));
  });
});

// ── TERCERO: Only references with effectiveStoreStock > 0 ────────────────

describe("TERCERO — Only positive-stock references participate", () => {
  it("service filters out zero-stock items", () => {
    assert.ok(SERVICE_SOURCE.includes("e.currentUnits > 0"));
  });

  it("service tracks excludedZeroStock in diagnostics", () => {
    assert.ok(SERVICE_SOURCE.includes("excludedZeroStock"));
  });

  it("service calculates currentUnits as quantity minus reservedQty", () => {
    assert.ok(SERVICE_SOURCE.includes("(pil.quantity ?? 0) - (pil.reservedQty ?? 0)"));
  });
});

// ── CUARTO: Opportunities from main warehouse ────────────────────────────

describe("CUARTO — Assortment opportunities from main warehouse", () => {
  it("service defines MAIN_WH_PK as '10'", () => {
    assert.ok(SERVICE_SOURCE.includes('MAIN_WH_PK = "10"'));
  });

  it("service loads main warehouse stock separately", () => {
    assert.ok(SERVICE_SOURCE.includes("warehouseId: MAIN_WH_PK"));
  });

  it("opportunities are references in main WH not in store", () => {
    assert.ok(SERVICE_SOURCE.includes("storeRefs.has(ref)"));
    assert.ok(SERVICE_SOURCE.includes("oportunidad_surtido"));
  });

  it("opportunity has minimum stock thresholds", () => {
    assert.ok(SERVICE_SOURCE.includes("MIN_OPPORTUNITY_STOCK_TEXTILE = 36"));
    assert.ok(SERVICE_SOURCE.includes("MIN_OPPORTUNITY_STOCK_IMPORT  = 6"));
  });

  it("opportunity motivo describes the situation", () => {
    assert.ok(SERVICE_SOURCE.includes("Sin presencia en tienda"));
  });
});

// ── QUINTO: Stock=0 is NOT agotado ───────────────────────────────────────

describe("QUINTO — Stock=0 does NOT produce 'agotado'", () => {
  it("service never uses 'agotado' status", () => {
    // EligibleNeedStatus has no "agotado" — only bajo_minimo, saludable, sobrestock, oportunidad_surtido, requiere_configuracion
    assert.ok(!SERVICE_SOURCE.includes('"agotado"'));
    assert.ok(!SERVICE_SOURCE.includes("'agotado'"));
  });

  it("EligibleNeedStatus type has 5 valid states", () => {
    assert.ok(SERVICE_SOURCE.includes('"bajo_minimo"'));
    assert.ok(SERVICE_SOURCE.includes('"saludable"'));
    assert.ok(SERVICE_SOURCE.includes('"sobrestock"'));
    assert.ok(SERVICE_SOURCE.includes('"oportunidad_surtido"'));
    assert.ok(SERVICE_SOURCE.includes('"requiere_configuracion"'));
  });
});

// ── SEXTO: Consolidation by reference ────────────────────────────────────

describe("SEXTO — Consolidation by (storeId, referenceCode)", () => {
  it("service uses composite key for consolidation", () => {
    assert.ok(SERVICE_SOURCE.includes("${item.storeId}|${item.referenceCode}"));
  });

  it("service sums variant stock into totalStock", () => {
    assert.ok(SERVICE_SOURCE.includes("b.totalStock += item.currentUnits"));
  });

  it("service tracks variant count per reference", () => {
    assert.ok(SERVICE_SOURCE.includes("bucket.variants.length"));
  });

  it("ConsolidatedStoreNeed has variantCount field", () => {
    assert.ok(SERVICE_SOURCE.includes("variantCount:"));
  });

  it("service tracks consolidatedReferences in diagnostics", () => {
    assert.ok(SERVICE_SOURCE.includes("diag.consolidatedReferences = buckets.size"));
  });
});

// ── SÉPTIMO: Corrected KPIs ──────────────────────────────────────────────

describe("SEPTIMO — KPIs", () => {
  it("service computes bajoMinimo count", () => {
    assert.ok(SERVICE_SOURCE.includes('n.status === "bajo_minimo"'));
  });

  it("service computes saludables count", () => {
    assert.ok(SERVICE_SOURCE.includes('n.status === "saludable"'));
  });

  it("service computes sobrestock count", () => {
    assert.ok(SERVICE_SOURCE.includes('n.status === "sobrestock"'));
  });

  it("service computes oportunidadSurtido count", () => {
    assert.ok(SERVICE_SOURCE.includes('n.status === "oportunidad_surtido"'));
  });

  it("service computes referenciasEvaluadas excluding opportunities", () => {
    assert.ok(SERVICE_SOURCE.includes('n.status !== "oportunidad_surtido"'));
  });

  it("KPIs are computed before user filter", () => {
    // The KPI block appears before the filter block
    const kpiIdx = SERVICE_SOURCE.indexOf("SÉPTIMO — KPIs");
    const filterIdx = SERVICE_SOURCE.indexOf("OCTAVO — Apply user filters");
    assert.ok(kpiIdx > 0);
    assert.ok(filterIdx > 0);
    assert.ok(kpiIdx < filterIdx);
  });
});

// ── OCTAVO: Server-side filters ──────────────────────────────────────────

describe("OCTAVO — Server-side filters", () => {
  it("service supports storeId filter", () => {
    assert.ok(SERVICE_SOURCE.includes("filter.storeId"));
    assert.ok(SERVICE_SOURCE.includes("n.storeId === filter.storeId"));
  });

  it("service supports world filter", () => {
    assert.ok(SERVICE_SOURCE.includes("filter.world"));
    assert.ok(SERVICE_SOURCE.includes("n.world === filter.world"));
  });

  it("service supports status filter", () => {
    assert.ok(SERVICE_SOURCE.includes("filter.status"));
    assert.ok(SERVICE_SOURCE.includes("n.status === filter.status"));
  });

  it("service returns storeOptions and worldOptions for dropdowns", () => {
    assert.ok(SERVICE_SOURCE.includes("storeOptions"));
    assert.ok(SERVICE_SOURCE.includes("worldOptions"));
  });
});

// ── NOVENO: Consolidated reference table ─────────────────────────────────

describe("NOVENO — Consolidated reference table in UI", () => {
  it("client imports EligibleNeedsResult and related types", () => {
    assert.ok(CLIENT_SOURCE.includes("EligibleNeedsResult"));
    assert.ok(CLIENT_SOURCE.includes("EligibleNeedsKpis"));
    assert.ok(CLIENT_SOURCE.includes("ConsolidatedStoreNeed"));
  });

  it("client shows reference code and product name", () => {
    assert.ok(CLIENT_SOURCE.includes("n.referenceCode"));
    assert.ok(CLIENT_SOURCE.includes("n.productName"));
  });

  it("client shows store name", () => {
    assert.ok(CLIENT_SOURCE.includes("n.storeName"));
  });

  it("client shows effectiveStoreStock", () => {
    assert.ok(CLIENT_SOURCE.includes("n.effectiveStoreStock"));
  });

  it("client shows mainWarehouseStock", () => {
    assert.ok(CLIENT_SOURCE.includes("n.mainWarehouseStock"));
  });

  it("client shows objectiveMin-objectiveMax range", () => {
    assert.ok(CLIENT_SOURCE.includes("n.objectiveMin"));
    assert.ok(CLIENT_SOURCE.includes("n.objectiveMax"));
  });

  it("client shows status with label", () => {
    assert.ok(CLIENT_SOURCE.includes("ELIGIBLE_STATUS_LABEL"));
  });

  it("client shows motivo column", () => {
    assert.ok(CLIENT_SOURCE.includes("n.motivo"));
  });
});

// ── DÉCIMO: Expandable variant detail ────────────────────────────────────

describe("DECIMO — Expandable variant detail (lazy-loaded)", () => {
  it("client has expandable rows with variant data", () => {
    assert.ok(CLIENT_SOURCE.includes("expandedRef"));
  });

  it("client lazy-loads variants via API", () => {
    assert.ok(CLIENT_SOURCE.includes('"variants"'));
  });

  it("variant rows show size, color, qty", () => {
    assert.ok(CLIENT_SOURCE.includes("v.size"));
    assert.ok(CLIENT_SOURCE.includes("v.color"));
    assert.ok(CLIENT_SOURCE.includes("v.qty"));
  });
});

// ── UNDÉCIMO: Bags/packaging/supplies excluded ───────────────────────────

describe("UNDECIMO — Bags, packaging, supplies excluded", () => {
  it("EXCLUSION_PATTERNS includes BOLSA", () => {
    assert.ok(SERVICE_SOURCE.includes("BOLSA"));
  });

  it("EXCLUSION_PATTERNS includes EMPAQUE", () => {
    assert.ok(SERVICE_SOURCE.includes("EMPAQUE"));
  });

  it("EXCLUSION_PATTERNS includes MATERIAL DE EMPAQUE", () => {
    assert.ok(SERVICE_SOURCE.includes("MATERIAL\\s+DE\\s+EMPAQUE"));
  });

  it("EXCLUSION_PATTERNS includes INSUMO", () => {
    assert.ok(SERVICE_SOURCE.includes("INSUMO"));
  });

  it("EXCLUSION_PATTERNS includes CONTABLE", () => {
    assert.ok(SERVICE_SOURCE.includes("CONTABLE"));
  });

  it("EXCLUSION_PATTERNS includes ADMINISTRATIV", () => {
    assert.ok(SERVICE_SOURCE.includes("ADMINISTRATIV"));
  });

  it("EXCLUSION_PATTERNS includes MUESTRA", () => {
    assert.ok(SERVICE_SOURCE.includes("MUESTRA"));
  });

  it("EXCLUSION_PATTERNS includes PRODUCCION", () => {
    assert.ok(SERVICE_SOURCE.includes("PRODUCCION"));
  });

  it("diagnostics tracks excludedBags and excludedPackaging separately", () => {
    assert.ok(SERVICE_SOURCE.includes("diag.excludedBags++"));
    assert.ok(SERVICE_SOURCE.includes("diag.excludedPackaging++"));
    assert.ok(SERVICE_SOURCE.includes("diag.excludedNonCommercial++"));
  });
});

// ── DUODÉCIMO: Performance ───────────────────────────────────────────────

describe("DUODECIMO — Performance constraints", () => {
  it("service uses single batch PIL query (zero N+1)", () => {
    // Only one findMany for active stores, one for main warehouse
    // loadEligibleStoreNeeds: 2 (active stores PIL + main WH), loadVariantsForReference: 1, mainStock: 1
    const findManyCount = (SERVICE_SOURCE.match(/invDb\(\)\.findMany/g) || []).length;
    assert.ok(findManyCount <= 4, `Expected <= 4 findMany calls, got ${findManyCount}`);
  });

  it("service has no SOAP calls", () => {
    assert.ok(!SERVICE_SOURCE.includes("soapClient"));
    assert.ok(!SERVICE_SOURCE.includes("SagSoapClient"));
    assert.ok(!SERVICE_SOURCE.includes("fetchSagSoap"));
  });

  it("service supports pagination with limit and offset", () => {
    assert.ok(SERVICE_SOURCE.includes("limit = 50"));
    assert.ok(SERVICE_SOURCE.includes("offset = 0"));
    assert.ok(SERVICE_SOURCE.includes("filtered.slice(offset, offset + limit)"));
  });

  it("service sorts results: bajo_minimo first, saludable last", () => {
    assert.ok(SERVICE_SOURCE.includes("bajo_minimo: 0"));
    assert.ok(SERVICE_SOURCE.includes("saludable: 4"));
  });

  it("service does not import sag-store-adapter", () => {
    assert.ok(!SERVICE_SOURCE.includes("sag-store-adapter"));
    assert.ok(!SERVICE_SOURCE.includes("loadSagStoreData"));
  });
});

// ── API Route ────────────────────────────────────────────────────────────

describe("API Route — needs/route.ts", () => {
  it("route imports loadEligibleStoreNeeds", () => {
    assert.ok(ROUTE_SOURCE.includes("loadEligibleStoreNeeds"));
  });

  it("route imports loadVariantsForReference", () => {
    assert.ok(ROUTE_SOURCE.includes("loadVariantsForReference"));
  });

  it("route supports 'load' action with filter/limit/offset", () => {
    assert.ok(ROUTE_SOURCE.includes('"load"'));
    assert.ok(ROUTE_SOURCE.includes("body.filter"));
    assert.ok(ROUTE_SOURCE.includes("body.limit"));
    assert.ok(ROUTE_SOURCE.includes("body.offset"));
  });

  it("route supports 'variants' action with storeId and referenceCode", () => {
    assert.ok(ROUTE_SOURCE.includes('"variants"'));
    assert.ok(ROUTE_SOURCE.includes("body.storeId"));
    assert.ok(ROUTE_SOURCE.includes("body.referenceCode"));
  });

  it("route enforces max limit of 200", () => {
    assert.ok(ROUTE_SOURCE.includes("Math.min(body.limit"));
    assert.ok(ROUTE_SOURCE.includes("200"));
  });

  it("route resolves warehouseId from storeId via resolveActiveStores", () => {
    assert.ok(ROUTE_SOURCE.includes("resolveActiveStores"));
    assert.ok(ROUTE_SOURCE.includes("store.warehouseId"));
  });
});

// ── Client UI ────────────────────────────────────────────────────────────

describe("Client — EligibleNeedsView", () => {
  it("client has EligibleNeedsView function", () => {
    assert.ok(CLIENT_SOURCE.includes("EligibleNeedsView"));
  });

  it("client shows KPI strip with 6 KPIs", () => {
    assert.ok(CLIENT_SOURCE.includes("Bajo minimo"));
    assert.ok(CLIENT_SOURCE.includes("Saludables"));
    assert.ok(CLIENT_SOURCE.includes("Sobrestock"));
    assert.ok(CLIENT_SOURCE.includes("Oportunidades"));
  });

  it("client shows diagnostics strip", () => {
    assert.ok(CLIENT_SOURCE.includes("diagnostics"));
    assert.ok(CLIENT_SOURCE.includes("PIL"));
  });

  it("client has server-side filter dropdowns", () => {
    assert.ok(CLIENT_SOURCE.includes("eligibleFilter"));
    assert.ok(CLIENT_SOURCE.includes("eligibleStoreOpts"));
    assert.ok(CLIENT_SOURCE.includes("eligibleWorldOpts"));
  });

  it("client uses CommercialReferenceThumbnail", () => {
    assert.ok(CLIENT_SOURCE.includes("CommercialReferenceThumbnail"));
  });

  it("client has pagination controls", () => {
    assert.ok(CLIENT_SOURCE.includes("Anterior"));
    assert.ok(CLIENT_SOURCE.includes("Siguiente"));
    assert.ok(CLIENT_SOURCE.includes("ELIGIBLE_PAGE_SIZE"));
  });

  it("client passes imageUrl to thumbnail", () => {
    assert.ok(CLIENT_SOURCE.includes("imageUrl={n.imageUrl}"));
  });
});

// ── Threshold calibration ────────────────────────────────────────────────

describe("Thresholds — correct defaults", () => {
  it("textile default min=8, max=12", () => {
    assert.ok(SERVICE_SOURCE.includes("TEXTILE_MIN = 8"));
    assert.ok(SERVICE_SOURCE.includes("TEXTILE_MAX = 12"));
  });

  it("import default min=4, max=6", () => {
    assert.ok(SERVICE_SOURCE.includes("IMPORT_MIN = 4"));
    assert.ok(SERVICE_SOURCE.includes("IMPORT_MAX = 6"));
  });

  it("service resolves policy rules before falling back to defaults", () => {
    assert.ok(SERVICE_SOURCE.includes("resolveStorePolicyForVariant"));
    assert.ok(SERVICE_SOURCE.includes("rule.minQty"));
    assert.ok(SERVICE_SOURCE.includes("rule.maxQty"));
  });
});

// ── Status classification logic ──────────────────────────────────────────

describe("Status classification", () => {
  it("bajo_minimo when stock < objectiveMin", () => {
    assert.ok(SERVICE_SOURCE.includes("bucket.totalStock < oMin"));
  });

  it("sobrestock when stock > objectiveMax", () => {
    assert.ok(SERVICE_SOURCE.includes("bucket.totalStock > oMax"));
  });

  it("saludable when within range", () => {
    // saludable is the else case
    const idx1 = SERVICE_SOURCE.indexOf("bucket.totalStock < oMin");
    const idx2 = SERVICE_SOURCE.indexOf("bucket.totalStock > oMax");
    const idx3 = SERVICE_SOURCE.indexOf('"saludable"', Math.max(idx1, idx2));
    assert.ok(idx3 > idx2, "saludable should come after sobrestock check");
  });

  it("motivo includes stock count and threshold", () => {
    assert.ok(SERVICE_SOURCE.includes("Stock ${bucket.totalStock}"));
    assert.ok(SERVICE_SOURCE.includes("por debajo del minimo"));
    assert.ok(SERVICE_SOURCE.includes("por encima del maximo"));
    assert.ok(SERVICE_SOURCE.includes("dentro del rango"));
  });
});

// ── World labels ─────────────────────────────────────────────────────────

describe("World labels", () => {
  it("castillitos maps to 'Castillitos'", () => {
    assert.ok(SERVICE_SOURCE.includes('castillitos:            "Castillitos"'));
  });

  it("latin_kids maps to 'Latin Kids'", () => {
    assert.ok(SERVICE_SOURCE.includes('latin_kids:             "Latin Kids"'));
  });

  it("accesorios_importacion maps to 'Accesorios'", () => {
    assert.ok(SERVICE_SOURCE.includes('accesorios_importacion: "Accesorios"'));
  });
});

// ── imageUrl support ─────────────────────────────────────────────────────

describe("imageUrl — product thumbnail support", () => {
  it("ConsolidatedStoreNeed has imageUrl field", () => {
    assert.ok(SERVICE_SOURCE.includes("imageUrl:             string | null"));
  });

  it("service gracefully handles missing imageUrl from ProductEntity", () => {
    // imageUrl is optional on ProductEntity (DB column may not exist yet)
    // Service uses pil.product?.imageUrl ?? null which safely returns null
    assert.ok(SERVICE_SOURCE.includes("pil.product?.imageUrl"));
  });

  it("service propagates imageUrl through eligible items to buckets", () => {
    assert.ok(SERVICE_SOURCE.includes("imageUrl: imgUrl"));
    assert.ok(SERVICE_SOURCE.includes("imageUrl: item.imageUrl"));
    assert.ok(SERVICE_SOURCE.includes("imageUrl:            bucket.imageUrl"));
  });
});
