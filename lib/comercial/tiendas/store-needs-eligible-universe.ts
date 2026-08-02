/**
 * lib/comercial/tiendas/store-needs-eligible-universe.ts
 *
 * Eligible universe filter for the Necesidades tab.
 *
 * PRIMERO:  Only active stores (governance).
 * SEGUNDO:  Only allowed commercial domains (TEXTILE + IMPORT/ACCESSORIES).
 * TERCERO:  Only references with effectiveStoreStock > 0.
 * CUARTO:   Opportunities: main warehouse stock, not present in store.
 * QUINTO:   Stock=0 is NOT agotado — simply not participating.
 * SEXTO:    Consolidation by reference (not variant).
 * SÉPTIMO:  Corrected KPIs.
 * UNDÉCIMO: Bags, packaging, supplies excluded.
 * DUODÉCIMO: Server-side filtering + pagination.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: AGENTIK-STORES-NEEDS-ELIGIBLE-UNIVERSE-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveActiveStores } from "./store-governance-service";
import { resolveBusinessLineId } from "./store-business-lines";
import { resolveVariantSizeColor } from "./variant-attribute-resolver";
import type { StorePolicyRule } from "./store-policy-types";
import { listStorePolicies } from "./store-policy-service";
import { resolveStorePolicyForVariant, getDefaultThresholds } from "./store-policy-engine";

// ── Types ──────────────────────────────────────────────────────────────────────

export type EligibleNeedStatus =
  | "bajo_minimo"
  | "saludable"
  | "sobrestock"
  | "oportunidad_surtido"
  | "requiere_configuracion";

export interface ConsolidatedStoreNeed {
  storeId:              string;
  storeName:            string;
  referenceCode:        string;
  productName:          string;
  world:                string;
  line:                 string;
  grupo:                string;
  subgrupo:             string;
  effectiveStoreStock:  number;
  mainWarehouseStock:   number;
  objectiveMin:         number;
  objectiveMax:         number;
  status:               EligibleNeedStatus;
  motivo:               string;
  variantCount:         number;
  imageUrl:             string | null;
}

export interface ConsolidatedVariant {
  size:  string;
  color: string;
  qty:   number;
}

export interface EligibleNeedsKpis {
  bajoMinimo:              number;
  saludables:              number;
  sobrestock:              number;
  oportunidadSurtido:      number;
  requierenConfiguracion:  number;
  referenciasEvaluadas:    number;
}

export interface EligibleNeedsFilter {
  storeId?: string;
  world?:   string;
  status?:  EligibleNeedStatus;
}

export interface EligibleNeedsDiagnostics {
  totalPilRecords:          number;
  afterStoreFilter:         number;
  afterEligibilityFilter:   number;
  afterStockFilter:         number;
  consolidatedReferences:   number;
  excludedBags:             number;
  excludedPackaging:        number;
  excludedNonCommercial:    number;
  excludedZeroStock:        number;
  opportunities:            number;
}

export interface EligibleNeedsResult {
  kpis:          EligibleNeedsKpis;
  needs:         ConsolidatedStoreNeed[];
  total:         number;
  storeOptions:  Array<{ id: string; name: string }>;
  worldOptions:  string[];
  diagnostics:   EligibleNeedsDiagnostics;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ALLOWED_LINES = new Set(["castillitos", "latin_kids", "accesorios_importacion"]);

const WORLD_LABEL: Record<string, string> = {
  castillitos:            "Castillitos",
  latin_kids:             "Latin Kids",
  accesorios_importacion: "Accesorios",
};

/** Patterns that exclude a product from the commercial universe. */
const EXCLUSION_PATTERNS: Array<{ re: RegExp; kind: "bag" | "packaging" | "non_commercial" }> = [
  { re: /\bBOLSA\b/i,           kind: "bag" },
  { re: /\bEMPAQUE\b/i,         kind: "packaging" },
  { re: /\bMATERIAL\s+DE\s+EMPAQUE\b/i, kind: "packaging" },
  { re: /\bINSUMO\b/i,          kind: "non_commercial" },
  { re: /\bCONTABLE\b/i,        kind: "non_commercial" },
  { re: /\bADMINISTRATIV/i,     kind: "non_commercial" },
  { re: /\bMUESTRA\b/i,         kind: "non_commercial" },
  { re: /\bPRODUCCION\b/i,      kind: "non_commercial" },
];

/** Textile: consolidated reference thresholds (units across all variants). */
const TEXTILE_MIN = 8;
const TEXTILE_MAX = 12;

/** Import/Accessory default thresholds. */
const IMPORT_MIN = 4;
const IMPORT_MAX = 6;

const MAIN_WH_PK = "10";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invDb = () => (prisma as any).productInventoryLevel;

// ── Main loader ────────────────────────────────────────────────────────────────

export async function loadEligibleStoreNeeds(
  orgId: string,
  filter: EligibleNeedsFilter = {},
  limit = 50,
  offset = 0,
): Promise<EligibleNeedsResult> {
  // PRIMERO — Only active stores from governance
  const activeStores = await resolveActiveStores(orgId);
  if (activeStores.length === 0) return emptyResult();

  const activeWhIds = activeStores.map(s => s.warehouseId);
  const storeByWh = new Map(activeStores.map(s => [s.warehouseId, s]));

  // Load policy rules for threshold resolution
  const policies = await listStorePolicies(orgId);
  const allRules: StorePolicyRule[] = policies.flatMap(p => p.rules);

  const diag: EligibleNeedsDiagnostics = {
    totalPilRecords: 0, afterStoreFilter: 0, afterEligibilityFilter: 0,
    afterStockFilter: 0, consolidatedReferences: 0,
    excludedBags: 0, excludedPackaging: 0, excludedNonCommercial: 0,
    excludedZeroStock: 0, opportunities: 0,
  };

  // Single batch PIL query for active stores only — zero N+1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pilRows: any[] = [];
  try {
    pilRows = await invDb().findMany({
      where: { organizationId: orgId, warehouseId: { in: activeWhIds } },
      include: {
        product: { select: {
          name: true, sku: true,
          productLine: true, grupoSag: true, subgrupoSag: true,
        } },
        variant: { include: { variantAttributes: { select: { key: true, value: true } } } },
      },
    });
  } catch { return emptyResult(); }

  diag.totalPilRecords = pilRows.length;
  diag.afterStoreFilter = pilRows.length; // already filtered by query

  // ── SEGUNDO + UNDÉCIMO — Eligible universe filter ──────────────────────────

  interface EligibleItem {
    storeId: string; storeName: string; warehouseId: string;
    referenceCode: string; productName: string;
    line: string; world: string; grupo: string; subgrupo: string;
    size: string; color: string; currentUnits: number;
    productLine: string | null;
    imageUrl: string | null;
  }

  const eligible: EligibleItem[] = [];

  for (const pil of pilRows) {
    const ref = (pil.variant?.sku ?? pil.product?.sku ?? pil.externalRef ?? "").toString().toUpperCase().trim();
    if (!ref) continue;

    const productLine = pil.product?.productLine ?? null;
    const line = resolveBusinessLineId(productLine);
    const grupo    = pil.product?.grupoSag    ?? "SIN_GRUPO";
    const subgrupo = pil.product?.subgrupoSag ?? "SIN_SUBGRUPO";
    const pName    = pil.product?.name        ?? ref;
    const imgUrl   = pil.product?.imageUrl    ?? null;

    // Domain check
    if (!ALLOWED_LINES.has(line)) {
      diag.excludedNonCommercial++;
      continue;
    }

    // Jupiter Pets guard (grupoSag)
    if (grupo.toUpperCase().includes("JUPITER")) {
      diag.excludedNonCommercial++;
      continue;
    }

    // Exclusion patterns on grupo + subgrupo + name
    const combined = `${grupo} ${subgrupo} ${pName}`.toUpperCase();
    let excluded = false;
    for (const { re, kind } of EXCLUSION_PATTERNS) {
      if (re.test(combined)) {
        if (kind === "bag") diag.excludedBags++;
        else if (kind === "packaging") diag.excludedPackaging++;
        else diag.excludedNonCommercial++;
        excluded = true;
        break;
      }
    }
    if (excluded) continue;

    const currentUnits = Math.max(0, (pil.quantity ?? 0) - (pil.reservedQty ?? 0));
    const storeGov = storeByWh.get(pil.warehouseId);
    const resolved = resolveVariantSizeColor(pil.variant);

    eligible.push({
      storeId:       storeGov?.slug ?? pil.warehouseId,
      storeName:     storeGov?.displayName ?? pil.warehouseId,
      warehouseId:   pil.warehouseId,
      referenceCode: ref,
      productName:   pName,
      line,
      world:         WORLD_LABEL[line] ?? line,
      grupo,
      subgrupo,
      size:          resolved.size,
      color:         resolved.color,
      currentUnits,
      productLine,
      imageUrl: imgUrl,
    });
  }

  diag.afterEligibilityFilter = eligible.length;

  // ── TERCERO + QUINTO — Only items with stock > 0 ──────────────────────────

  const withStock = eligible.filter(e => e.currentUnits > 0);
  diag.excludedZeroStock = eligible.length - withStock.length;
  diag.afterStockFilter = withStock.length;

  // ── SEXTO — Consolidate by (storeId, referenceCode) ──────────────────────

  interface RefBucket {
    storeId: string; storeName: string;
    referenceCode: string; productName: string;
    line: string; world: string; grupo: string; subgrupo: string;
    totalStock: number;
    variants: ConsolidatedVariant[];
    productLine: string | null;
    imageUrl: string | null;
  }

  const buckets = new Map<string, RefBucket>();

  for (const item of withStock) {
    const key = `${item.storeId}|${item.referenceCode}`;
    const b = buckets.get(key);
    if (b) {
      b.totalStock += item.currentUnits;
      b.variants.push({ size: item.size, color: item.color, qty: item.currentUnits });
    } else {
      buckets.set(key, {
        storeId: item.storeId, storeName: item.storeName,
        referenceCode: item.referenceCode, productName: item.productName,
        line: item.line, world: item.world,
        grupo: item.grupo, subgrupo: item.subgrupo,
        totalStock: item.currentUnits,
        variants: [{ size: item.size, color: item.color, qty: item.currentUnits }],
        productLine: item.productLine,
        imageUrl: item.imageUrl,
      });
    }
  }

  diag.consolidatedReferences = buckets.size;

  // ── Load main warehouse stock (single query) ──────────────────────────────

  const mainStockByRef = new Map<string, number>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mainRows: any[] = await invDb().findMany({
      where: { organizationId: orgId, warehouseId: MAIN_WH_PK },
      select: {
        quantity: true, reservedQty: true, externalRef: true,
        variant: { select: { sku: true } },
        product: { select: { sku: true } },
      },
    });
    for (const m of mainRows) {
      const r = (m.variant?.sku ?? m.product?.sku ?? m.externalRef ?? "").toString().toUpperCase().trim();
      if (!r) continue;
      const qty = Math.max(0, (m.quantity ?? 0) - (m.reservedQty ?? 0));
      mainStockByRef.set(r, (mainStockByRef.get(r) ?? 0) + qty);
    }
  } catch { /* main warehouse unavailable */ }

  // ── Evaluate consolidated needs ──────────────────────────────────────────

  const allNeeds: ConsolidatedStoreNeed[] = [];

  for (const [, bucket] of buckets) {
    const mainQty = mainStockByRef.get(bucket.referenceCode) ?? 0;
    const isTextile = bucket.line === "castillitos" || bucket.line === "latin_kids";

    // Resolve thresholds: policy rules → domain defaults
    const policyInput = {
      storeId:       bucket.storeId,
      referenceCode: bucket.referenceCode,
      size:          "",
      color:         "",
      line:          bucket.line,
      subgroup:      bucket.subgrupo,
      category:      bucket.subgrupo,
      productClass:  (isTextile ? "textile" : "accessory") as "textile" | "accessory",
      sizeClass:     undefined,
    };
    const rule = resolveStorePolicyForVariant(policyInput, allRules);
    let oMin: number, oMax: number;
    if (rule) {
      oMin = rule.minQty;
      oMax = rule.maxQty ?? rule.idealQty;
    } else {
      oMin = isTextile ? TEXTILE_MIN : IMPORT_MIN;
      oMax = isTextile ? TEXTILE_MAX : IMPORT_MAX;
    }

    let status: EligibleNeedStatus;
    let motivo: string;

    if (bucket.totalStock < oMin) {
      status = "bajo_minimo";
      motivo = `Stock ${bucket.totalStock} por debajo del minimo ${oMin}`;
    } else if (bucket.totalStock > oMax) {
      status = "sobrestock";
      motivo = `Stock ${bucket.totalStock} por encima del maximo ${oMax}`;
    } else {
      status = "saludable";
      motivo = `Stock ${bucket.totalStock} dentro del rango ${oMin}\u2013${oMax}`;
    }

    allNeeds.push({
      storeId:             bucket.storeId,
      storeName:           bucket.storeName,
      referenceCode:       bucket.referenceCode,
      productName:         bucket.productName,
      world:               bucket.world,
      line:                bucket.line,
      grupo:               bucket.grupo,
      subgrupo:            bucket.subgrupo,
      effectiveStoreStock: bucket.totalStock,
      mainWarehouseStock:  mainQty,
      objectiveMin:        oMin,
      objectiveMax:        oMax,
      status,
      motivo,
      variantCount:        bucket.variants.length,
      imageUrl:            bucket.imageUrl,
    });
  }

  // ── CUARTO + DÉCIMO — Assortment opportunities from main warehouse ───────

  // References present in active stores (across all stores)
  const refsInStores = new Set(allNeeds.map(n => n.referenceCode));

  // Load eligible universe from main warehouse for opportunity detection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mainEligible: any[] = [];
  try {
    mainEligible = await invDb().findMany({
      where: { organizationId: orgId, warehouseId: MAIN_WH_PK },
      include: {
        product: { select: {
          name: true, sku: true,
          productLine: true, grupoSag: true, subgrupoSag: true,
        } },
        variant: { select: { sku: true } },
      },
    });
  } catch { /* skip opportunities if main warehouse unavailable */ }

  // Consolidate main warehouse by reference
  const mainRefStock = new Map<string, {
    referenceCode: string; productName: string;
    line: string; world: string; grupo: string; subgrupo: string;
    totalAvailable: number; imageUrl: string | null;
  }>();

  for (const m of mainEligible) {
    const ref = (m.variant?.sku ?? m.product?.sku ?? m.externalRef ?? "").toString().toUpperCase().trim();
    if (!ref) continue;

    const productLine = m.product?.productLine ?? null;
    const line = resolveBusinessLineId(productLine);
    if (!ALLOWED_LINES.has(line)) continue;

    const grupo    = m.product?.grupoSag    ?? "SIN_GRUPO";
    const subgrupo = m.product?.subgrupoSag ?? "SIN_SUBGRUPO";
    if (grupo.toUpperCase().includes("JUPITER")) continue;

    const combined = `${grupo} ${subgrupo} ${m.product?.name ?? ""}`.toUpperCase();
    let excl = false;
    for (const { re } of EXCLUSION_PATTERNS) {
      if (re.test(combined)) { excl = true; break; }
    }
    if (excl) continue;

    const qty = Math.max(0, (m.quantity ?? 0) - (m.reservedQty ?? 0));
    if (qty <= 0) continue;

    const existing = mainRefStock.get(ref);
    if (existing) {
      existing.totalAvailable += qty;
    } else {
      mainRefStock.set(ref, {
        referenceCode: ref,
        productName:   m.product?.name ?? ref,
        line,
        world:         WORLD_LABEL[line] ?? line,
        grupo,
        subgrupo,
        totalAvailable: qty,
        imageUrl:      m.product?.imageUrl ?? null,
      });
    }
  }

  // Build per-store opportunity list: references NOT present in that store
  // but present in main warehouse with meaningful stock
  const MIN_OPPORTUNITY_STOCK_TEXTILE = 36;
  const MIN_OPPORTUNITY_STOCK_IMPORT  = 6;

  // Group existing store refs by storeId
  const storeRefSets = new Map<string, Set<string>>();
  for (const n of allNeeds) {
    let s = storeRefSets.get(n.storeId);
    if (!s) { s = new Set(); storeRefSets.set(n.storeId, s); }
    s.add(n.referenceCode);
  }

  // For each active store, find opportunities
  for (const store of activeStores) {
    const storeRefs = storeRefSets.get(store.slug) ?? new Set<string>();

    for (const [ref, info] of mainRefStock) {
      if (storeRefs.has(ref)) continue;

      const isTextile = info.line === "castillitos" || info.line === "latin_kids";
      const minStock = isTextile ? MIN_OPPORTUNITY_STOCK_TEXTILE : MIN_OPPORTUNITY_STOCK_IMPORT;
      if (info.totalAvailable < minStock) continue;

      allNeeds.push({
        storeId:             store.slug,
        storeName:           store.displayName,
        referenceCode:       ref,
        productName:         info.productName,
        world:               info.world,
        line:                info.line,
        grupo:               info.grupo,
        subgrupo:            info.subgrupo,
        effectiveStoreStock: 0,
        mainWarehouseStock:  info.totalAvailable,
        objectiveMin:        isTextile ? TEXTILE_MIN : IMPORT_MIN,
        objectiveMax:        isTextile ? TEXTILE_MAX : IMPORT_MAX,
        status:              "oportunidad_surtido",
        motivo:              `Sin presencia en tienda. Bodega principal: ${info.totalAvailable} uds`,
        variantCount:        0,
        imageUrl:            info.imageUrl,
      });
      diag.opportunities++;
    }
  }

  // ── SÉPTIMO — KPIs (computed from ALL needs, before user filter) ─────────

  const kpis: EligibleNeedsKpis = {
    bajoMinimo:             allNeeds.filter(n => n.status === "bajo_minimo").length,
    saludables:             allNeeds.filter(n => n.status === "saludable").length,
    sobrestock:             allNeeds.filter(n => n.status === "sobrestock").length,
    oportunidadSurtido:     allNeeds.filter(n => n.status === "oportunidad_surtido").length,
    requierenConfiguracion: allNeeds.filter(n => n.status === "requiere_configuracion").length,
    referenciasEvaluadas:   allNeeds.filter(n => n.status !== "oportunidad_surtido").length,
  };

  // ── OCTAVO — Apply user filters ──────────────────────────────────────────

  let filtered = allNeeds;
  if (filter.storeId) filtered = filtered.filter(n => n.storeId === filter.storeId);
  if (filter.world)   filtered = filtered.filter(n => n.world === filter.world);
  if (filter.status)  filtered = filtered.filter(n => n.status === filter.status);

  // Sort: bajo_minimo → sobrestock → requiere_configuracion → oportunidad → saludable
  const ORDER: Record<EligibleNeedStatus, number> = {
    bajo_minimo: 0, sobrestock: 1, requiere_configuracion: 2,
    oportunidad_surtido: 3, saludable: 4,
  };
  filtered.sort((a, b) => {
    const d = ORDER[a.status] - ORDER[b.status];
    if (d !== 0) return d;
    return a.effectiveStoreStock - b.effectiveStoreStock;
  });

  // Store and world options
  const storeOptions = activeStores.map(s => ({ id: s.slug, name: s.displayName }));
  const worldOptions = [...new Set(allNeeds.map(n => n.world))].sort();

  // Paginate
  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return { kpis, needs: paginated, total, storeOptions, worldOptions, diagnostics: diag };
}

// ── Variant loader (lazy, for expansion) ───────────────────────────────────

export async function loadVariantsForReference(
  orgId: string,
  warehouseId: string,
  referenceCode: string,
): Promise<ConsolidatedVariant[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = await invDb().findMany({
      where: { organizationId: orgId, warehouseId },
      include: {
        product: { select: { sku: true } },
        variant: { include: { variantAttributes: { select: { key: true, value: true } } } },
      },
    });

    const variants: ConsolidatedVariant[] = [];
    for (const r of rows) {
      const ref = (r.variant?.sku ?? r.product?.sku ?? r.externalRef ?? "").toString().toUpperCase().trim();
      if (ref !== referenceCode) continue;
      const qty = Math.max(0, (r.quantity ?? 0) - (r.reservedQty ?? 0));
      if (qty <= 0) continue;

      const resolved = resolveVariantSizeColor(r.variant);
      variants.push({ size: resolved.size, color: resolved.color, qty });
    }

    return variants.sort((a, b) => b.qty - a.qty);
  } catch {
    return [];
  }
}

// ── Empty result ───────────────────────────────────────────────────────────

function emptyResult(): EligibleNeedsResult {
  return {
    kpis: {
      bajoMinimo: 0, saludables: 0, sobrestock: 0,
      oportunidadSurtido: 0, requierenConfiguracion: 0, referenciasEvaluadas: 0,
    },
    needs: [], total: 0,
    storeOptions: [], worldOptions: [],
    diagnostics: {
      totalPilRecords: 0, afterStoreFilter: 0, afterEligibilityFilter: 0,
      afterStockFilter: 0, consolidatedReferences: 0,
      excludedBags: 0, excludedPackaging: 0, excludedNonCommercial: 0,
      excludedZeroStock: 0, opportunities: 0,
    },
  };
}
