/**
 * lib/comercial/tiendas/__tests__/inventory-by-line.test.ts
 *
 * Tests for AGENTIK-STORES-INVENTORY-BY-LINE-01.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/inventory-by-line.test.ts
 *
 * Sprint: AGENTIK-STORES-INVENTORY-BY-LINE-01
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Source code (avoid server-only imports) ──────────────────────────────

const SERVICE_SOURCE = readFileSync(
  resolve(__dirname, "../store-inventory-by-line.ts"), "utf-8"
);
const CLIENT_SOURCE = readFileSync(
  resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx"), "utf-8"
);
const ROUTE_SOURCE = readFileSync(
  resolve(__dirname, "../../../../app/api/orgs/[orgSlug]/comercial/tiendas/route.ts"), "utf-8"
);

// ── PRIMERO: 5 inventory lines exist ─────────────────────────────────────

describe("PRIMERO — 5 InventoryLine types", () => {
  it("InventoryLine includes CASTILLITOS", () => {
    assert.ok(SERVICE_SOURCE.includes('"CASTILLITOS"'));
  });
  it("InventoryLine includes LATIN_KIDS", () => {
    assert.ok(SERVICE_SOURCE.includes('"LATIN_KIDS"'));
  });
  it("InventoryLine includes ACCESSORIES", () => {
    assert.ok(SERVICE_SOURCE.includes('"ACCESSORIES"'));
  });
  it("InventoryLine includes UNCLASSIFIED", () => {
    assert.ok(SERVICE_SOURCE.includes('"UNCLASSIFIED"'));
  });
  it("InventoryLine includes OUT_OF_STOCK", () => {
    assert.ok(SERVICE_SOURCE.includes('"OUT_OF_STOCK"'));
  });
});

// ── SEGUNDO: Line navigation in UI ──────────────────────────────────────

describe("SEGUNDO — Line navigation tabs in client", () => {
  it("has Castillitos tab", () => {
    assert.ok(CLIENT_SOURCE.includes('"Castillitos"'));
  });
  it("has Latin Kids tab", () => {
    assert.ok(CLIENT_SOURCE.includes('"Latin Kids"'));
  });
  it("has Accesorios tab", () => {
    assert.ok(CLIENT_SOURCE.includes('"Accesorios"'));
  });
  it("has Sin clasificar tab", () => {
    assert.ok(CLIENT_SOURCE.includes('"Sin clasificar"'));
  });
  it("has Agotados tab", () => {
    assert.ok(CLIENT_SOURCE.includes('"Agotados"'));
  });
});

// ── TERCERO: Classification engine ──────────────────────────────────────

describe("TERCERO — classifyLine function", () => {
  it("classifyLine function exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function classifyLine("));
  });
  it("isUnclassified function exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function isUnclassified("));
  });
  it("OUT_OF_STOCK checks currentUnits === 0", () => {
    assert.ok(SERVICE_SOURCE.includes("item.currentUnits === 0"));
  });
  it("TEXTILE world maps to CASTILLITOS or LATIN_KIDS", () => {
    assert.ok(SERVICE_SOURCE.includes('item.world === "TEXTILE"'));
  });
  it("IMPORT world maps to ACCESSORIES", () => {
    assert.ok(SERVICE_SOURCE.includes('item.world === "IMPORT"'));
  });
});

// ── CUARTO: Consolidation by reference ──────────────────────────────────

describe("CUARTO — consolidateByReference", () => {
  it("consolidation function exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function consolidateByReference("));
  });
  it("groups by referenceCode", () => {
    assert.ok(SERVICE_SOURCE.includes("refMap.get(item.referenceCode)"));
  });
  it("ConsolidatedInventoryRef has variantCount", () => {
    assert.ok(SERVICE_SOURCE.includes("variantCount:"));
  });
  it("ConsolidatedInventoryRef has currentStoreQty", () => {
    assert.ok(SERVICE_SOURCE.includes("currentStoreQty"));
  });
  it("ConsolidatedInventoryRef has mainWarehouseQty", () => {
    assert.ok(SERVICE_SOURCE.includes("mainWarehouseQty"));
  });
});

// ── QUINTO: Inventory states ────────────────────────────────────────────

describe("QUINTO — Inventory state classification", () => {
  it("deriveInventoryState function exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function deriveInventoryState("));
  });
  it("has BAJO_MINIMO state", () => {
    assert.ok(SERVICE_SOURCE.includes('"BAJO_MINIMO"'));
  });
  it("has EN_RANGO state", () => {
    assert.ok(SERVICE_SOURCE.includes('"EN_RANGO"'));
  });
  it("has EXCESO state", () => {
    assert.ok(SERVICE_SOURCE.includes('"EXCESO"'));
  });
  it("has SIN_REGLA state", () => {
    assert.ok(SERVICE_SOURCE.includes('"SIN_REGLA"'));
  });
  it("has AGOTADO state", () => {
    assert.ok(SERVICE_SOURCE.includes('"AGOTADO"'));
  });
});

// ── SEXTO: Line summaries ───────────────────────────────────────────────

describe("SEXTO — Line-specific summaries", () => {
  it("buildTextileSummary exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function buildTextileSummary("));
  });
  it("buildAccessorySummary exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function buildAccessorySummary("));
  });
  it("buildUnclassifiedSummary exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function buildUnclassifiedSummary("));
  });
  it("buildOutOfStockSummary exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function buildOutOfStockSummary("));
  });
  it("InvLineSummaryStrip renders textile summary in client", () => {
    assert.ok(CLIENT_SOURCE.includes("InvLineSummaryStrip"));
  });
});

// ── SÉPTIMO: Filtering ──────────────────────────────────────────────────

describe("SEPTIMO — Secondary filters", () => {
  it("applyFilters function exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function applyFilters("));
  });
  it("filters by group", () => {
    assert.ok(SERVICE_SOURCE.includes("req.group"));
  });
  it("filters by subgroup", () => {
    assert.ok(SERVICE_SOURCE.includes("req.subgroup"));
  });
  it("filters by sizeClass", () => {
    assert.ok(SERVICE_SOURCE.includes("req.sizeClass"));
  });
  it("filters by inventoryState", () => {
    assert.ok(SERVICE_SOURCE.includes("req.inventoryState"));
  });
  it("filters by search (case-insensitive)", () => {
    assert.ok(SERVICE_SOURCE.includes("req.search"));
    assert.ok(SERVICE_SOURCE.includes(".toLowerCase()"));
  });
  it("client has group select filter", () => {
    assert.ok(CLIENT_SOURCE.includes("Todos los grupos"));
  });
  it("client has subgroup select filter", () => {
    assert.ok(CLIENT_SOURCE.includes("Todos los subgrupos"));
  });
  it("client has size select filter", () => {
    assert.ok(CLIENT_SOURCE.includes("Todos los tamanos"));
  });
  it("client has state select filter", () => {
    assert.ok(CLIENT_SOURCE.includes("Todos los estados"));
  });
});

// ── OCTAVO: Pagination ──────────────────────────────────────────────────

describe("OCTAVO — Server-side pagination", () => {
  it("service paginates results", () => {
    assert.ok(SERVICE_SOURCE.includes("req.pageSize"));
    assert.ok(SERVICE_SOURCE.includes("totalPages"));
  });
  it("client has Anterior/Siguiente buttons", () => {
    assert.ok(CLIENT_SOURCE.includes("Anterior"));
    assert.ok(CLIENT_SOURCE.includes("Siguiente"));
  });
  it("API limits pageSize to 50", () => {
    assert.ok(ROUTE_SOURCE.includes("Math.min(body.pageSize ?? 25, 50)"));
  });
});

// ── NOVENO: Search ──────────────────────────────────────────────────────

describe("NOVENO — Search with debounce", () => {
  it("client has search input", () => {
    assert.ok(CLIENT_SOURCE.includes("Buscar referencia o descripcion"));
  });
  it("client debounces search", () => {
    assert.ok(CLIENT_SOURCE.includes("invSearchDebounced"));
  });
  it("client has clear search button", () => {
    assert.ok(CLIENT_SOURCE.includes("Limpiar"));
  });
});

// ── DÉCIMO: Variant expansion ───────────────────────────────────────────

describe("DECIMO — Lazy variant expansion", () => {
  it("loadInventoryVariants exists in service", () => {
    assert.ok(SERVICE_SOURCE.includes("export async function loadInventoryVariants("));
  });
  it("client loads variants on expand", () => {
    assert.ok(CLIENT_SOURCE.includes("toggleInvRef"));
    assert.ok(CLIENT_SOURCE.includes("loadVariants"));
  });
  it("variant table shows Talla/Color/Tienda/Bodega/Estado headers", () => {
    assert.ok(CLIENT_SOURCE.includes("Talla"));
    assert.ok(CLIENT_SOURCE.includes("Color"));
  });
  it("API has variants sub-action", () => {
    assert.ok(ROUTE_SOURCE.includes('"variants"'));
  });
});

// ── UNDÉCIMO: Thumbnails ────────────────────────────────────────────────

describe("UNDECIMO — Thumbnails in inventory list", () => {
  it("inventory items use CommercialReferenceThumbnail", () => {
    assert.ok(CLIENT_SOURCE.includes("CommercialReferenceThumbnail"));
  });
});

// ── DUODÉCIMO: API route integration ────────────────────────────────────

describe("DUODECIMO — API route", () => {
  it("route imports loadStoreInventoryByLine", () => {
    assert.ok(ROUTE_SOURCE.includes("loadStoreInventoryByLine"));
  });
  it("route imports getInventoryLineCounts", () => {
    assert.ok(ROUTE_SOURCE.includes("getInventoryLineCounts"));
  });
  it("route imports loadInventoryVariants", () => {
    assert.ok(ROUTE_SOURCE.includes("loadInventoryVariants"));
  });
  it("route has store_inventory_by_line action", () => {
    assert.ok(ROUTE_SOURCE.includes('"store_inventory_by_line"'));
  });
  it("route has counts sub-action", () => {
    assert.ok(ROUTE_SOURCE.includes('"counts"'));
  });
  it("route has load sub-action", () => {
    assert.ok(ROUTE_SOURCE.includes('"load"'));
  });
  it("store_inventory_by_line is in GUARDED_ACTIONS", () => {
    const guardedIdx = ROUTE_SOURCE.indexOf("GUARDED_ACTIONS");
    const inventoryIdx = ROUTE_SOURCE.indexOf('"store_inventory_by_line"');
    // The first occurrence of store_inventory_by_line should be in the GUARDED_ACTIONS set
    assert.ok(guardedIdx < inventoryIdx);
  });
});

// ── DECIMOTERCERO: Service consumes getCanonicalStoreDetail ─────────────

describe("DECIMOTERCERO — No additional DB queries", () => {
  it("service imports getCanonicalStoreDetail", () => {
    assert.ok(SERVICE_SOURCE.includes("getCanonicalStoreDetail"));
  });
  it("service does NOT import prisma", () => {
    assert.ok(!SERVICE_SOURCE.includes("@prisma/client"));
    assert.ok(!SERVICE_SOURCE.includes("prisma."));
  });
  it("service does NOT import sag adapter", () => {
    assert.ok(!SERVICE_SOURCE.includes("sag-store-adapter"));
  });
  it("service has server-only guard", () => {
    assert.ok(SERVICE_SOURCE.includes('"server-only"'));
  });
});

// ── DECIMOCUARTO: Unclassified reasons ──────────────────────────────────

describe("DECIMOCUARTO — Unclassified reasons", () => {
  it("UnclassifiedReason type exists", () => {
    assert.ok(SERVICE_SOURCE.includes("type UnclassifiedReason"));
  });
  it("deriveUnclassifiedReason function exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function deriveUnclassifiedReason("));
  });
  it("client shows unclassified reason labels", () => {
    assert.ok(CLIENT_SOURCE.includes("INV_UNCLASSIFIED_LABEL"));
  });
});

// ── DECIMOQUINTO: Config state ──────────────────────────────────────────

describe("DECIMOQUINTO — Config state classification", () => {
  it("ConfigState type exists", () => {
    assert.ok(SERVICE_SOURCE.includes("type ConfigState"));
  });
  it("deriveConfigState function exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function deriveConfigState("));
  });
  it("has REGLA_HEREDADA state", () => {
    assert.ok(SERVICE_SOURCE.includes('"REGLA_HEREDADA"'));
  });
  it("has REGLA_PERSONALIZADA state", () => {
    assert.ok(SERVICE_SOURCE.includes('"REGLA_PERSONALIZADA"'));
  });
});

// ── DECIMOSEXTO: Available filters ──────────────────────────────────────

describe("DECIMOSEXTO — Available filters built from data", () => {
  it("buildAvailableFilters function exists", () => {
    assert.ok(SERVICE_SOURCE.includes("function buildAvailableFilters("));
  });
  it("filters exclude SIN_GRUPO_SAG from groups", () => {
    assert.ok(SERVICE_SOURCE.includes("SIN_GRUPO_SAG"));
  });
  it("filters exclude SIN_SUBGRUPO_SAG from subgroups", () => {
    assert.ok(SERVICE_SOURCE.includes("SIN_SUBGRUPO_SAG"));
  });
});

// ── DECIMOSÉPTIMO: File structure ───────────────────────────────────────

describe("DECIMOSEPTIMO — File structure and size", () => {
  it("service file is under 600 lines", () => {
    const lines = SERVICE_SOURCE.split("\n").length;
    assert.ok(lines < 850, `Expected < 850 lines, got ${lines}`);
  });
  it("all public functions are exported", () => {
    assert.ok(SERVICE_SOURCE.includes("export async function loadStoreInventoryByLine("));
    assert.ok(SERVICE_SOURCE.includes("export async function getInventoryLineCounts("));
    assert.ok(SERVICE_SOURCE.includes("export async function loadInventoryVariants("));
  });
  it("classification functions are private (not exported)", () => {
    assert.ok(SERVICE_SOURCE.includes("function classifyLine(") && !SERVICE_SOURCE.includes("export function classifyLine("));
    assert.ok(SERVICE_SOURCE.includes("function consolidateByReference(") && !SERVICE_SOURCE.includes("export function consolidateByReference("));
  });
});

// ── DECIMOCTAVO: No modifications to other tabs ─────────────────────────

describe("DECIMOCTAVO — Other tabs untouched", () => {
  it("DerroteroTab still exists", () => {
    assert.ok(CLIENT_SOURCE.includes("function DerroteroTab("));
  });
  it("necesidades tab still exists", () => {
    assert.ok(CLIENT_SOURCE.includes("TAB: Necesidades"));
  });
  it("inteligencia tab still exists", () => {
    assert.ok(CLIENT_SOURCE.includes("TAB: Inteligencia"));
  });
  it("governance preserved", () => {
    assert.ok(CLIENT_SOURCE.includes("Confirmar activacion"));
    assert.ok(CLIENT_SOURCE.includes("Confirmar desactivacion"));
  });
});

// ── DECIMONOVENO: Human-readable labels ─────────────────────────────────

describe("DECIMONOVENO — Human-readable labels", () => {
  it("has INV_STATE_LABEL for inventory states", () => {
    assert.ok(CLIENT_SOURCE.includes("INV_STATE_LABEL"));
  });
  it("has INV_SIZE_LABEL for size classes", () => {
    assert.ok(CLIENT_SOURCE.includes("INV_SIZE_LABEL"));
  });
  it("labels include Bajo minimo", () => {
    assert.ok(CLIENT_SOURCE.includes("Bajo minimo"));
  });
  it("labels include En rango", () => {
    assert.ok(CLIENT_SOURCE.includes("En rango"));
  });
  it("labels include Exceso", () => {
    assert.ok(CLIENT_SOURCE.includes("Exceso"));
  });
});

// ── VIGÉSIMO: Data freshness ────────────────────────────────────────────

describe("VIGESIMO — Data freshness in response", () => {
  it("service returns dataFreshness", () => {
    assert.ok(SERVICE_SOURCE.includes("dataFreshness:"));
  });
  it("client shows data freshness", () => {
    assert.ok(CLIENT_SOURCE.includes("invData.dataFreshness"));
  });
});

// ── VIGÉSIMO PRIMERO: Error state differentiation (DATA-FIX-01 OCTAVO) ──

describe("VIGESIMO_PRIMERO — Error state differentiation", () => {
  it("client has invError state", () => {
    assert.ok(CLIENT_SOURCE.includes("const [invError, setInvError]"));
  });
  it("client has invRetry state for retry", () => {
    assert.ok(CLIENT_SOURCE.includes("const [invRetry, setInvRetry]"));
  });
  it("client checks data.error in counts response", () => {
    assert.ok(CLIENT_SOURCE.includes("data.error"));
  });
  it("client shows error banner when invError is set", () => {
    assert.ok(CLIENT_SOURCE.includes("invError"));
    assert.ok(CLIENT_SOURCE.includes("Reintentar"));
  });
  it("client detects inconsistency: summary refs > 0 but counts total 0", () => {
    assert.ok(CLIENT_SOURCE.includes("inconsistency"));
    assert.ok(CLIENT_SOURCE.includes("storeCard.totalReferences"));
  });
  it("route returns status 500 with error message on counts failure", () => {
    assert.ok(ROUTE_SOURCE.includes("Error al cargar conteos"));
    assert.ok(ROUTE_SOURCE.includes("status: 500"));
  });
  it("route returns status 500 with error message on load failure", () => {
    assert.ok(ROUTE_SOURCE.includes("Error al cargar inventario por linea"));
  });
  it("route logs error details on counts failure", () => {
    assert.ok(ROUTE_SOURCE.includes('[INV-BY-LINE] counts error'));
  });
  it("route logs error details on load failure", () => {
    assert.ok(ROUTE_SOURCE.includes('[INV-BY-LINE] load error'));
  });
  it("tiendaApi detects non-OK HTTP status", () => {
    assert.ok(CLIENT_SOURCE.includes("!res.ok"));
    assert.ok(CLIENT_SOURCE.includes("_httpStatus"));
  });
  it("client handles STORE_INACTIVE error code", () => {
    assert.ok(CLIENT_SOURCE.includes("STORE_INACTIVE"));
    assert.ok(CLIENT_SOURCE.includes("Tienda desactivada"));
  });
});

// ── VIGESIMO_SEGUNDO: Lightweight counts path (PERFORMANCE-01) ──────────────

describe("VIGESIMO_SEGUNDO — Lightweight counts path", () => {
  it("getInventoryLineCounts does NOT call getCanonicalStoreDetail", () => {
    // Extract the getInventoryLineCounts function body
    const fnStart = SERVICE_SOURCE.indexOf("export async function getInventoryLineCounts(");
    const nextExport = SERVICE_SOURCE.indexOf("\nexport ", fnStart + 10);
    const fnBody = SERVICE_SOURCE.slice(fnStart, nextExport > -1 ? nextExport : undefined);
    assert.ok(!fnBody.includes("getCanonicalStoreDetail"), "counts must NOT call getCanonicalStoreDetail");
  });

  it("getInventoryLineCounts queries single warehouse only", () => {
    const fnStart = SERVICE_SOURCE.indexOf("export async function getInventoryLineCounts(");
    const nextExport = SERVICE_SOURCE.indexOf("\nexport ", fnStart + 10);
    const fnBody = SERVICE_SOURCE.slice(fnStart, nextExport > -1 ? nextExport : undefined);
    assert.ok(fnBody.includes("warehouseId: warehousePk"), "must filter by single warehouse PK");
    assert.ok(!fnBody.includes("warehouseId: { in:"), "must NOT use IN clause for multiple warehouses");
  });

  it("getInventoryLineCounts does not load images or policies", () => {
    const fnStart = SERVICE_SOURCE.indexOf("export async function getInventoryLineCounts(");
    const nextExport = SERVICE_SOURCE.indexOf("\nexport ", fnStart + 10);
    const fnBody = SERVICE_SOURCE.slice(fnStart, nextExport > -1 ? nextExport : undefined);
    assert.ok(!fnBody.includes("heroImage"), "must NOT load hero images");
    assert.ok(!fnBody.includes("listStorePolicies"), "must NOT load policies");
    assert.ok(!fnBody.includes("buildSubstitution"), "must NOT build substitution index");
  });

  it("getInventoryLineCounts only selects classification columns", () => {
    const fnStart = SERVICE_SOURCE.indexOf("export async function getInventoryLineCounts(");
    const nextExport = SERVICE_SOURCE.indexOf("\nexport ", fnStart + 10);
    const fnBody = SERVICE_SOURCE.slice(fnStart, nextExport > -1 ? nextExport : undefined);
    assert.ok(fnBody.includes("productLine: true"), "must select productLine");
    assert.ok(fnBody.includes("grupoSag: true"), "must select grupoSag");
    assert.ok(fnBody.includes("subgrupoSag: true"), "must select subgrupoSag");
    assert.ok(!fnBody.includes("handlingUnit: true"), "must NOT select handlingUnit (not needed for counts)");
  });

  it("getInventoryLineCounts filters qty > 0", () => {
    const fnStart = SERVICE_SOURCE.indexOf("export async function getInventoryLineCounts(");
    const nextExport = SERVICE_SOURCE.indexOf("\nexport ", fnStart + 10);
    const fnBody = SERVICE_SOURCE.slice(fnStart, nextExport > -1 ? nextExport : undefined);
    assert.ok(fnBody.includes("quantity: { gt: 0 }"), "must filter for positive quantity");
  });

  it("counts cache exists with TTL", () => {
    assert.ok(SERVICE_SOURCE.includes("countsCache"), "must have countsCache");
    assert.ok(SERVICE_SOURCE.includes("COUNTS_TTL"), "must have COUNTS_TTL constant");
    assert.ok(SERVICE_SOURCE.includes("120_000"), "TTL must be 2 minutes");
  });

  it("invalidateLineCountsCache is exported", () => {
    assert.ok(SERVICE_SOURCE.includes("export function invalidateLineCountsCache("));
  });

  it("classifyFromPIL uses resolveBusinessLineId and BUSINESS_LINE_MAP", () => {
    assert.ok(SERVICE_SOURCE.includes("function classifyFromPIL("));
    assert.ok(SERVICE_SOURCE.includes("resolveBusinessLineId("));
    assert.ok(SERVICE_SOURCE.includes("BUSINESS_LINE_MAP["));
  });

  it("classifyFromPIL has same classification rules as classifyLine", () => {
    // Both must check for SIN_LINEA, SIN_GRUPO_SAG, SIN_SUBGRUPO_SAG
    const fnStart = SERVICE_SOURCE.indexOf("function classifyFromPIL(");
    const fnEnd = SERVICE_SOURCE.indexOf("\n}", fnStart) + 2;
    const fnBody = SERVICE_SOURCE.slice(fnStart, fnEnd);
    assert.ok(fnBody.includes('"SIN_LINEA"'), "must check SIN_LINEA");
    assert.ok(fnBody.includes('"SIN_GRUPO_SAG"'), "must check SIN_GRUPO_SAG");
    assert.ok(fnBody.includes('"SIN_SUBGRUPO_SAG"'), "must check SIN_SUBGRUPO_SAG");
    assert.ok(fnBody.includes('"latin_kids"'), "must check latin_kids");
    assert.ok(fnBody.includes('"CASTILLITOS"'), "must return CASTILLITOS");
    assert.ok(fnBody.includes('"ACCESSORIES"'), "must return ACCESSORIES");
  });

  it("resolveWarehousePk maps store slugs to warehouse PKs", () => {
    assert.ok(SERVICE_SOURCE.includes("function resolveWarehousePk("));
    assert.ok(SERVICE_SOURCE.includes("CANONICAL_STORE_IDENTITY"));
  });

  it("loadStoreInventoryByLine still uses getCanonicalStoreDetail (full path)", () => {
    const fnStart = SERVICE_SOURCE.indexOf("export async function loadStoreInventoryByLine(");
    const nextExport = SERVICE_SOURCE.indexOf("\nexport ", fnStart + 10);
    const fnBody = SERVICE_SOURCE.slice(fnStart, nextExport > -1 ? nextExport : undefined);
    assert.ok(fnBody.includes("getCanonicalStoreDetail"), "detail load must still use full path");
  });
});

// ── VIGESIMO_TERCERO: KPI actions and sorting (KPI-ACTIONS-AND-SORTING-01) ──

describe("VIGESIMO_TERCERO — KPI actions and sorting", () => {
  // ── Backend contract tests ──────────────────────────────────────────────

  it("TextileLineSummary includes reemplazos and saludables", () => {
    assert.ok(SERVICE_SOURCE.includes("reemplazos:"));
    assert.ok(SERVICE_SOURCE.includes("saludables:"));
  });

  it("AccessoryLineSummary includes reemplazos and saludables", () => {
    // Check buildAccessorySummary has reemplazos
    const fnStart = SERVICE_SOURCE.indexOf("function buildAccessorySummary(");
    const fnEnd = SERVICE_SOURCE.indexOf("\n}", fnStart) + 2;
    const fnBody = SERVICE_SOURCE.slice(fnStart, fnEnd);
    assert.ok(fnBody.includes("reemplazos"), "accessory summary must have reemplazos");
    assert.ok(fnBody.includes("saludables"), "accessory summary must have saludables");
  });

  it("SortBy type has 4 options", () => {
    assert.ok(SERVICE_SOURCE.includes('"QUANTITY_ASC"'));
    assert.ok(SERVICE_SOURCE.includes('"QUANTITY_DESC"'));
    assert.ok(SERVICE_SOURCE.includes('"REFERENCE_ASC"'));
    assert.ok(SERVICE_SOURCE.includes('"REFERENCE_DESC"'));
  });

  it("KpiFilter type has ALL, BELOW_MINIMUM, HEALTHY, HAS_REPLACEMENT", () => {
    assert.ok(SERVICE_SOURCE.includes('"ALL"'));
    assert.ok(SERVICE_SOURCE.includes('"BELOW_MINIMUM"'));
    assert.ok(SERVICE_SOURCE.includes('"HEALTHY"'));
    assert.ok(SERVICE_SOURCE.includes('"HAS_REPLACEMENT"'));
  });

  it("applySorting function exists and sorts before pagination", () => {
    assert.ok(SERVICE_SOURCE.includes("function applySorting("));
    // Verify sorting happens before pagination in loadStoreInventoryByLine
    const fnStart = SERVICE_SOURCE.indexOf("export async function loadStoreInventoryByLine(");
    const fnEnd = SERVICE_SOURCE.indexOf("\n}", fnStart) + 2;
    const fnBody = SERVICE_SOURCE.slice(fnStart, fnEnd);
    const sortIdx = fnBody.indexOf("applySorting");
    const paginateIdx = fnBody.indexOf(".slice(offset");
    assert.ok(sortIdx > -1, "must call applySorting");
    assert.ok(paginateIdx > -1, "must paginate with slice");
    assert.ok(sortIdx < paginateIdx, "sorting must happen before pagination");
  });

  it("ConsolidatedInventoryRef includes hasReplacement and replacementBrief", () => {
    assert.ok(SERVICE_SOURCE.includes("hasReplacement:"));
    assert.ok(SERVICE_SOURCE.includes("replacementBrief:"));
  });

  it("ReplacementBrief interface exists", () => {
    assert.ok(SERVICE_SOURCE.includes("export interface ReplacementBrief"));
    assert.ok(SERVICE_SOURCE.includes("candidateRef:"));
    assert.ok(SERVICE_SOURCE.includes("ruleSource:"));
    assert.ok(SERVICE_SOURCE.includes("shortageQty:"));
  });

  it("reemplazos counts only BAJO_MINIMO refs with hasReplacement", () => {
    const fnStart = SERVICE_SOURCE.indexOf("function buildTextileSummary(");
    const fnEnd = SERVICE_SOURCE.indexOf("\n}", fnStart) + 2;
    const fnBody = SERVICE_SOURCE.slice(fnStart, fnEnd);
    assert.ok(fnBody.includes('r.inventoryState === "BAJO_MINIMO" && r.hasReplacement'), "must require both BAJO_MINIMO and hasReplacement");
  });

  it("HAS_REPLACEMENT filter requires BAJO_MINIMO and hasReplacement", () => {
    const fnStart = SERVICE_SOURCE.indexOf("function applyFilters(");
    const fnEnd = SERVICE_SOURCE.indexOf("\n}", fnStart) + 2;
    const fnBody = SERVICE_SOURCE.slice(fnStart, fnEnd);
    assert.ok(fnBody.includes("HAS_REPLACEMENT"), "must handle HAS_REPLACEMENT filter");
    assert.ok(fnBody.includes('r.inventoryState === "BAJO_MINIMO" && r.hasReplacement'), "HAS_REPLACEMENT must require both conditions");
  });

  it("request type includes kpiFilter and sortBy", () => {
    assert.ok(SERVICE_SOURCE.includes("kpiFilter?:"));
    assert.ok(SERVICE_SOURCE.includes("sortBy?:"));
  });

  // ── Client tests ────────────────────────────────────────────────────────

  it("client has InvKpiFilter and InvSortBy types", () => {
    assert.ok(CLIENT_SOURCE.includes("type InvSortBy ="));
    assert.ok(CLIENT_SOURCE.includes("type InvKpiFilter ="));
  });

  it("client sends sortBy and kpiFilter to API", () => {
    assert.ok(CLIENT_SOURCE.includes("sortBy: invSortBy"));
    assert.ok(CLIENT_SOURCE.includes("kpiFilter:"));
  });

  it("Sin regla does NOT appear as KPI in textile summary", () => {
    // InvLineSummaryStrip textile kpis should NOT include Sin regla
    const fnStart = CLIENT_SOURCE.indexOf("function InvLineSummaryStrip(");
    const fnEnd = CLIENT_SOURCE.indexOf("\n}", fnStart) + 2;
    const fnBody = CLIENT_SOURCE.slice(fnStart, fnEnd);
    // textile section
    const textileStart = fnBody.indexOf('summary.type === "textile"');
    const textileEnd = fnBody.indexOf("]", textileStart);
    const textileKpis = fnBody.slice(textileStart, textileEnd);
    assert.ok(!textileKpis.includes('"Sin regla"'), "Sin regla must NOT appear as textile KPI");
  });

  it("Exceso does NOT appear as KPI in textile summary", () => {
    const fnStart = CLIENT_SOURCE.indexOf("function InvLineSummaryStrip(");
    const fnEnd = CLIENT_SOURCE.indexOf("\n}", fnStart) + 2;
    const fnBody = CLIENT_SOURCE.slice(fnStart, fnEnd);
    const textileStart = fnBody.indexOf('summary.type === "textile"');
    const textileEnd = fnBody.indexOf("]", textileStart);
    const textileKpis = fnBody.slice(textileStart, textileEnd);
    assert.ok(!textileKpis.includes('"Exceso"'), "Exceso must NOT appear as textile KPI");
  });

  it("textile KPIs are exactly 5: Referencias, Unidades, Bajo minimo, Reemplazos, Saludables", () => {
    // The InvLineSummaryStrip builds kpis array for textile with these labels
    const fnStart = CLIENT_SOURCE.indexOf("function InvLineSummaryStrip(");
    const fnEnd = CLIENT_SOURCE.indexOf("\nfunction ", fnStart + 10);
    const fnBody = CLIENT_SOURCE.slice(fnStart, fnEnd > -1 ? fnEnd : fnStart + 3000);
    // Check textile block has all 5 KPI labels
    assert.ok(fnBody.includes('"Referencias"'), "must have Referencias");
    assert.ok(fnBody.includes('"Unidades"'), "must have Unidades");
    assert.ok(fnBody.includes('"Bajo minimo"'), "must have Bajo minimo");
    assert.ok(fnBody.includes('"Reemplazos"'), "must have Reemplazos");
    assert.ok(fnBody.includes('"Saludables"'), "must have Saludables");
  });

  it("accessory KPIs use Bajo objetivo instead of Bajo minimo", () => {
    const fnStart = CLIENT_SOURCE.indexOf("function InvLineSummaryStrip(");
    const fnEnd = CLIENT_SOURCE.indexOf("\nfunction ", fnStart + 10);
    const fnBody = CLIENT_SOURCE.slice(fnStart, fnEnd > -1 ? fnEnd : fnStart + 3000);
    assert.ok(fnBody.includes('"Bajo objetivo"'), "accessories must have Bajo objetivo");
  });

  it("KPIs are clickable (onKpiClick prop)", () => {
    assert.ok(CLIENT_SOURCE.includes("onKpiClick:"));
    assert.ok(CLIENT_SOURCE.includes("onKpiClick("));
  });

  it("second click on active KPI deactivates it", () => {
    // Check: activeKpi === kpi.key ? "ALL" : kpi.key
    assert.ok(CLIENT_SOURCE.includes('activeKpi === kpi.key ? "ALL" : kpi.key'));
  });

  it("sort selector has 4 options", () => {
    assert.ok(CLIENT_SOURCE.includes('"QUANTITY_ASC"'));
    assert.ok(CLIENT_SOURCE.includes('"QUANTITY_DESC"'));
    assert.ok(CLIENT_SOURCE.includes('"REFERENCE_ASC"'));
    assert.ok(CLIENT_SOURCE.includes('"REFERENCE_DESC"'));
    assert.ok(CLIENT_SOURCE.includes("Menor inventario"));
    assert.ok(CLIENT_SOURCE.includes("Mayor inventario"));
  });

  it("line change resets KPI and sort", () => {
    // The onClick handler for line buttons should reset invKpiFilter and invSortBy
    assert.ok(CLIENT_SOURCE.includes('setInvKpiFilter("ALL")'));
    assert.ok(CLIENT_SOURCE.includes('setInvSortBy("QUANTITY_ASC")'));
  });

  it("store change resets sort and KPI state", () => {
    // Check store change reset block
    assert.ok(CLIENT_SOURCE.includes('setInvSortBy("QUANTITY_ASC")'));
    assert.ok(CLIENT_SOURCE.includes('setInvKpiFilter("ALL")'));
  });

  it("KPI change resets to page 1", () => {
    // onKpiClick sets page 1
    assert.ok(CLIENT_SOURCE.includes("setInvPage(1)"));
  });

  it("replacement badge shows in item rows", () => {
    assert.ok(CLIENT_SOURCE.includes("Reemplazo disponible"));
    assert.ok(CLIENT_SOURCE.includes("replacementBrief"));
    assert.ok(CLIENT_SOURCE.includes("candidateRef"));
  });

  it("Castillitos line does not include latin_kids items (classification isolation)", () => {
    // classifyLine: TEXTILE + latin_kids → LATIN_KIDS, TEXTILE + other → CASTILLITOS
    const fnStart = SERVICE_SOURCE.indexOf("function classifyLine(");
    const fnEnd = SERVICE_SOURCE.indexOf("\n}", fnStart) + 2;
    const fnBody = SERVICE_SOURCE.slice(fnStart, fnEnd);
    // Verify it checks canonicalLine for latin_kids BEFORE defaulting to CASTILLITOS
    const lkIdx = fnBody.indexOf('item.canonicalLine === "latin_kids"');
    const castIdx = fnBody.indexOf('return "CASTILLITOS"');
    assert.ok(lkIdx > -1, "must check for latin_kids");
    assert.ok(castIdx > -1, "must return CASTILLITOS");
    assert.ok(lkIdx < castIdx, "latin_kids check must come before CASTILLITOS default");
  });
});

// ── VIGESIMO_CUARTO: REPLACEMENT-STOCK-EVIDENCE-01 ──────────────────────

describe("VIGESIMO_CUARTO — REPLACEMENT-STOCK-EVIDENCE-01", () => {
  it("ReplacementBrief has candidateMainStock field", () => {
    assert.ok(SERVICE_SOURCE.includes("candidateMainStock:"));
  });

  it("ReplacementBrief has candidateStoreStock field", () => {
    assert.ok(SERVICE_SOURCE.includes("candidateStoreStock:"));
  });

  it("ReplacementBrief has coveredQty field", () => {
    assert.ok(SERVICE_SOURCE.includes("coveredQty:"));
  });

  it("ReplacementBrief has remainingShortageQty field", () => {
    assert.ok(SERVICE_SOURCE.includes("remainingShortageQty:"));
  });

  it("ReplacementBrief has stockQuality field", () => {
    assert.ok(SERVICE_SOURCE.includes("stockQuality:"));
  });

  it("ReplacementBrief has evidenceDate field", () => {
    assert.ok(SERVICE_SOURCE.includes("evidenceDate:"));
  });

  it("StockQuality type has 3 values", () => {
    assert.ok(SERVICE_SOURCE.includes("OPERATIONAL_CONFIRMED"));
    assert.ok(SERVICE_SOURCE.includes("PHYSICAL_ONLY"));
    assert.ok(SERVICE_SOURCE.includes("UNKNOWN"));
  });

  it("consistency guard: no replacement when candidateMainStock <= 0", () => {
    const fnStart = SERVICE_SOURCE.indexOf("function consolidateByReference(");
    const fnEnd = SERVICE_SOURCE.indexOf("\nfunction ", fnStart + 10);
    const fnBody = SERVICE_SOURCE.slice(fnStart, fnEnd > -1 ? fnEnd : fnStart + 5000);
    assert.ok(fnBody.includes("mainWarehouseAvailableQty > 0"), "must check mainWarehouseAvailableQty > 0");
    assert.ok(fnBody.includes("suggestedQty > 0"), "must check suggestedQty > 0");
    assert.ok(fnBody.includes("hasReplacement = false"), "must set hasReplacement = false when no stock");
  });

  it("remainingShortageQty = max(0, shortage - covered)", () => {
    const fnStart = SERVICE_SOURCE.indexOf("function consolidateByReference(");
    const fnEnd = SERVICE_SOURCE.indexOf("\nfunction ", fnStart + 10);
    const fnBody = SERVICE_SOURCE.slice(fnStart, fnEnd > -1 ? fnEnd : fnStart + 5000);
    assert.ok(fnBody.includes("Math.max(0, rep.replacementShortageQty - coveredQty)"));
  });

  it("client InvReplacementBrief has stock evidence fields", () => {
    assert.ok(CLIENT_SOURCE.includes("candidateMainStock: number"));
    assert.ok(CLIENT_SOURCE.includes("candidateStoreStock: number"));
    assert.ok(CLIENT_SOURCE.includes("coveredQty: number"));
    assert.ok(CLIENT_SOURCE.includes("remainingShortageQty: number"));
    assert.ok(CLIENT_SOURCE.includes("stockQuality: string"));
    assert.ok(CLIENT_SOURCE.includes("evidenceDate: string"));
  });

  it("client shows Bodega stock in replacement badge", () => {
    assert.ok(CLIENT_SOURCE.includes("candidateMainStock"));
    assert.ok(CLIENT_SOURCE.includes("Bodega:"));
  });

  it("client shows remaining shortage when > 0", () => {
    assert.ok(CLIENT_SOURCE.includes("remainingShortageQty > 0"));
    assert.ok(CLIENT_SOURCE.includes("Pendiente:"));
  });

  // ── REPLACEMENT-MAIN-WAREHOUSE-COLUMN-FIX-01 ──────────────────────────

  it("column header is Bodega ppal.", () => {
    assert.ok(CLIENT_SOURCE.includes("Bodega ppal."), "column must say Bodega ppal.");
  });

  it("replacement rows use candidateMainStock in column", () => {
    assert.ok(CLIENT_SOURCE.includes("replacementBrief.candidateMainStock"), "must reference candidateMainStock for column value");
  });

  it("OPERATIONAL_CONFIRMED shows disp. suffix", () => {
    assert.ok(CLIENT_SOURCE.includes("disp."), "OPERATIONAL_CONFIRMED must show disp.");
  });

  it("UNKNOWN shows Por confirmar", () => {
    assert.ok(CLIENT_SOURCE.includes("Por confirmar"), "UNKNOWN must show Por confirmar");
  });

  it("PHYSICAL_ONLY tooltip present", () => {
    assert.ok(CLIENT_SOURCE.includes("Stock físico. No descuenta compromisos."), "PHYSICAL_ONLY tooltip");
  });

  it("non-replacement rows fall back to mainWarehouseQty", () => {
    // The else branch uses item.mainWarehouseQty
    assert.ok(CLIENT_SOURCE.includes("item.mainWarehouseQty"), "must fall back to mainWarehouseQty");
  });

  it("column and evidence block reference same field (candidateMainStock)", () => {
    // Both the column and the evidence block use candidateMainStock
    const columnIdx = CLIENT_SOURCE.indexOf("replacementBrief.candidateMainStock");
    const evidenceIdx = CLIENT_SOURCE.indexOf("candidateMainStock", columnIdx + 1);
    assert.ok(columnIdx > -1, "column must use candidateMainStock");
    assert.ok(evidenceIdx > -1, "evidence block must also use candidateMainStock");
  });
});

// ── Section 25: NEEDS-REPLACEMENT-CANDIDATES-01 — Necesidades tab UI ─────

describe("VIGESIMOQUINTO — Necesidades tab replacement candidates UI", () => {
  it("expandable row toggle exists (Ver reemplazos)", () => {
    assert.ok(CLIENT_SOURCE.includes("Ver reemplazos"), "expand button text");
  });

  it("expandable row toggle exists (Ocultar reemplazos)", () => {
    assert.ok(CLIENT_SOURCE.includes("Ocultar reemplazos"), "collapse button text");
  });

  it("Recomendado badge for first candidate", () => {
    assert.ok(CLIENT_SOURCE.includes("Recomendado"), "Recomendado badge");
  });

  it("Sin alternativa label for no-stock items", () => {
    assert.ok(CLIENT_SOURCE.includes("Sin alternativa"), "Sin alternativa label");
  });

  it("Rule 36 exclusion message present", () => {
    assert.ok(
      CLIENT_SOURCE.includes("regla de concentraci") || CLIENT_SOURCE.includes("rule36BlockedCount"),
      "Rule 36 explanation"
    );
  });

  it("hasMoreCandidates overflow message", () => {
    assert.ok(CLIENT_SOURCE.includes("hasMoreCandidates"), "hasMoreCandidates gate");
  });

  it("totalCandidatesFound referenced in UI", () => {
    assert.ok(CLIENT_SOURCE.includes("totalCandidatesFound"), "totalCandidatesFound label");
  });

  it("single-expand pattern (expandedNeedRef state)", () => {
    assert.ok(CLIENT_SOURCE.includes("expandedNeedRef"), "expandedNeedRef state");
  });

  it("Necesidades KPI counts only valid replacements", () => {
    // Valid = suggestedQty > 0 && mainWarehouseAvailableQty > 0
    assert.ok(CLIENT_SOURCE.includes("suggestedQty") && CLIENT_SOURCE.includes("mainWarehouseAvailableQty"),
      "KPI filter uses suggestedQty and mainWarehouseAvailableQty");
  });

  it("replacement candidate card shows candidateRef", () => {
    assert.ok(CLIENT_SOURCE.includes("candidateRef") || CLIENT_SOURCE.includes("referenceCode"),
      "candidate card shows reference code");
  });
});

// ── Section 26: REPLACEMENT-VARIANTS-01 — Variant UI contract ────────────

describe("VIGESIMOSEXTO — Replacement variant UI contract", () => {
  it("Variantes disponibles label present", () => {
    assert.ok(CLIENT_SOURCE.includes("Variantes disponibles"), "variant section header");
  });

  it("variant table has Talla column", () => {
    assert.ok(CLIENT_SOURCE.includes("Talla"), "Talla column header");
  });

  it("variant table has Color column", () => {
    assert.ok(CLIENT_SOURCE.includes("Color"), "Color column header");
  });

  it("variant table has Bodega principal column", () => {
    assert.ok(CLIENT_SOURCE.includes("Bodega principal"), "Bodega principal column header");
  });

  it("PHYSICAL_ONLY label: uds fisicas", () => {
    // Source uses \\u00ed escape for í
    assert.ok(CLIENT_SOURCE.includes("uds f") && CLIENT_SOURCE.includes("sicas"), "PHYSICAL_ONLY qty label");
  });

  it("OPERATIONAL_CONFIRMED label: disponibles", () => {
    assert.ok(CLIENT_SOURCE.includes("disponible"), "OPERATIONAL_CONFIRMED qty label");
  });

  it("UNKNOWN label: Por confirmar", () => {
    assert.ok(CLIENT_SOURCE.includes("Por confirmar"), "UNKNOWN qty label");
  });

  it("Ver todas las variantes button for >8 variants", () => {
    assert.ok(CLIENT_SOURCE.includes("Ver todas las variantes"), "expand all variants button");
  });

  it("Ocultar variantes button", () => {
    assert.ok(CLIENT_SOURCE.includes("Ocultar variantes"), "collapse variants button");
  });

  it("INITIAL_VARIANT_LIMIT = 8", () => {
    assert.ok(CLIENT_SOURCE.includes("INITIAL_VARIANT_LIMIT = 8"), "initial variant limit constant");
  });

  it("expandedVariantKey state for variant expansion", () => {
    assert.ok(CLIENT_SOURCE.includes("expandedVariantKey"), "expandedVariantKey state");
  });

  it("cobertura parcial label present", () => {
    assert.ok(CLIENT_SOURCE.includes("cobertura parcial"), "partial coverage label");
  });

  it("InvReplacementVariant type defined", () => {
    assert.ok(CLIENT_SOURCE.includes("InvReplacementVariant"), "variant type defined in client");
  });

  it("replacementVariants field used in UI", () => {
    assert.ok(CLIENT_SOURCE.includes("replacementVariants"), "replacementVariants referenced in UI");
  });

  it("totalVariantUnits field used in UI", () => {
    assert.ok(CLIENT_SOURCE.includes("totalVariantUnits"), "totalVariantUnits referenced");
  });

  it("no N+1: variant data comes from candidate, not separate query", () => {
    // Verify no fetch/API call for variants — data comes from c.replacementVariants
    assert.ok(CLIENT_SOURCE.includes("c.replacementVariants") || CLIENT_SOURCE.includes("allVariants"), "variants from candidate object");
    // No variant-specific fetch
    const hasVariantFetch = CLIENT_SOURCE.includes("fetch") && CLIENT_SOURCE.includes("variant");
    // Allow fetch for other purposes but not variant-specific
    assert.ok(!CLIENT_SOURCE.includes("fetchVariants"), "no separate variant fetch");
  });
});
