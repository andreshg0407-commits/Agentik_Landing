/**
 * lib/comercial/tiendas/store-rule-catalog.ts
 *
 * Catalog service for the rule builder.
 * Extracts real lines, subgroups, product classes, and size classes
 * from actual synchronized inventory data.
 *
 * Sprint: TIENDAS-RULE-CATALOG-INTEGRATION-01
 */

import type { StoreInventoryVariant } from "./store-replenishment-types";
import type { StoreProductClass, StoreSizeClass } from "./store-policy-types";
import { prisma } from "@/lib/prisma";
import { resolveBusinessLine, BUSINESS_LINE_MAP } from "./store-business-lines";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  /** Normalized value for storage and matching */
  value: string;
  /** Human-readable label */
  label: string;
}

export interface StoreRuleCatalog {
  lines:            CatalogEntry[];
  subgroupsByLine:  Record<string, CatalogEntry[]>;
  productClasses:   CatalogEntry[];
  sizeClasses:      CatalogEntry[];
}

// ── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalize a string to a stable key:
 *   "Latin Kids" → "latin_kids"
 *   "Camisetas niño" → "camisetas_nino"
 */
export function normalizeValue(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // strip accents
    .replace(/[^a-z0-9]+/g, "_")                        // non-alphanum → _
    .replace(/^_|_$/g, "");                              // trim leading/trailing _
}

// ── Product class inference (matches assortment-engine heuristic) ────────────

function inferProductClass(v: { category: string; line: string }): StoreProductClass {
  const cat = (v.category || "").toUpperCase(); // Now = real subgrupoSag

  if (/PIJAMA|CAMISET|CAMISILLA|BLUSA|PANTALON|VESTID|CONJUNTO|BODY|SHORT|LEGGIN|FALDA|SUDAD|JEAN|BATA|CAMIBUSO|POLO|BUZO|CHAQUETA|JOGGER|BERMUDA|MAMELUCO/i.test(cat)) {
    return "textile";
  }
  if (/COCHE|CUNA|MESA|SILLA|COMODA|ESTANTE|MUEBLE|CAMINADOR|MOTO/i.test(cat)) {
    return "bulky";
  }
  if (/BOLSO|MORRAL|LONCHERA|MALET|GUANT|GORRO|MEDIA|CALCETIN|ZAPATO|SAND|TETERO|TERMOS|ACCESORI/i.test(cat)) {
    return "accessory";
  }
  // Business line fallback
  const lineId = (v.line || "").trim();
  if (lineId === "castillitos" || lineId === "latin_kids") return "textile";
  if (lineId === "accesorios_importacion") return "other";
  return "other";
}

// ── Subgroup resolution (matches textile-coverage-engine convention) ────────

function resolveSubgroup(v: StoreInventoryVariant): string {
  return v.category || v.line || "—";
}

// ── Build catalog from inventory ─────────────────────────────────────────────

export function buildRuleCatalog(allInventory: StoreInventoryVariant[]): StoreRuleCatalog {
  const lineSet = new Map<string, string>();         // value → label
  const subgroupMap = new Map<string, Map<string, string>>();  // lineValue → Map<sgValue, sgLabel>
  const classSet = new Set<StoreProductClass>();

  for (const v of allInventory) {
    if (v.currentUnits <= 0) continue;

    const lineId = (v.line || "").trim();
    if (!lineId) continue;

    const lineVal = normalizeValue(lineId);
    const lineLabel = BUSINESS_LINE_MAP[lineVal]?.label ?? lineId;
    if (!lineSet.has(lineVal)) lineSet.set(lineVal, lineLabel);

    const sgLabel = resolveSubgroup(v);
    const sgVal = normalizeValue(sgLabel);
    if (!subgroupMap.has(lineVal)) subgroupMap.set(lineVal, new Map());
    const sgMap = subgroupMap.get(lineVal)!;
    if (!sgMap.has(sgVal)) sgMap.set(sgVal, sgLabel);

    classSet.add(inferProductClass(v));
  }

  // Sort lines alphabetically by label
  const lines: CatalogEntry[] = [...lineSet.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  // Build subgroupsByLine sorted
  const subgroupsByLine: Record<string, CatalogEntry[]> = {};
  for (const [lineVal, sgMap] of subgroupMap) {
    subgroupsByLine[lineVal] = [...sgMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }

  // Product classes
  const productClasses: CatalogEntry[] = [
    ...(classSet.has("textile")   ? [{ value: "textile",   label: "Textil" }]      : []),
    ...(classSet.has("accessory") ? [{ value: "accessory", label: "Accesorio" }]   : []),
    ...(classSet.has("bulky")     ? [{ value: "bulky",     label: "Voluminoso" }]  : []),
    ...(classSet.has("other")     ? [{ value: "other",     label: "Otro" }]        : []),
  ];

  // Size classes are structural (not inventory-derived)
  const sizeClasses: CatalogEntry[] = [
    { value: "small",     label: "Pequeno" },
    { value: "medium",    label: "Mediano" },
    { value: "large",     label: "Grande" },
  ];

  return { lines, subgroupsByLine, productClasses, sizeClasses };
}

// ── Direct Prisma catalog builder (TIENDAS-RULE-CATALOG-EMPTY-01) ────────

/**
 * Build catalog directly from ProductInventoryLevel + ProductEntity.
 * Bypasses the store-filtered inventory pipeline to ensure ALL products
 * with real SAG classification are included.
 *
 * This is the authoritative source for the rule builder UI.
 */
export async function buildRuleCatalogFromPrisma(orgId: string): Promise<StoreRuleCatalog> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invDb = () => (prisma as any).productInventoryLevel;

  try {
    if (typeof invDb() !== "object" || !invDb()) {
      console.log("[TIENDAS_RULE_CATALOG_DEBUG] PIL model not available");
      return emptyCatalog();
    }

    const rows: Array<{
      quantity: number;
      product?: { productLine: string | null; subgrupoSag: string | null } | null;
    }> = await invDb().findMany({
      where: { organizationId: orgId },
      select: {
        quantity: true,
        product: { select: { productLine: true, subgrupoSag: true } },
      },
    });

    console.log(`[TIENDAS_RULE_CATALOG_DEBUG] orgId=${orgId} totalPIL=${rows.length}`);

    const lineSet = new Map<string, string>();
    const subgroupMap = new Map<string, Map<string, string>>();
    const classSet = new Set<StoreProductClass>();

    let withSubgrupo = 0;
    let withLine = 0;

    for (const row of rows) {
      const subgrupo = row.product?.subgrupoSag?.trim() ?? "";
      const lineRaw  = row.product?.productLine?.trim() ?? "";

      if (subgrupo) withSubgrupo++;
      if (lineRaw) withLine++;

      // Skip items without real classification
      if (!subgrupo && !lineRaw) continue;

      // Resolve business line from SAG productLine
      const bl = resolveBusinessLine(lineRaw || null);
      const lineVal = bl.id;
      if (!lineSet.has(lineVal)) lineSet.set(lineVal, bl.label);

      // Subgroup entry (only if real)
      if (subgrupo) {
        const sgVal = normalizeValue(subgrupo);
        if (!subgroupMap.has(lineVal)) subgroupMap.set(lineVal, new Map());
        const sgMap = subgroupMap.get(lineVal)!;
        if (!sgMap.has(sgVal)) sgMap.set(sgVal, subgrupo);

        // Infer product class from subgrupo
        classSet.add(inferProductClass({ category: subgrupo, line: lineVal }));
      }
    }

    console.log(`[TIENDAS_RULE_CATALOG_DEBUG] withSubgrupo=${withSubgrupo} withLine=${withLine} lines=${lineSet.size} subgroups=${[...subgroupMap.values()].reduce((s, m) => s + m.size, 0)}`);

    const lines: CatalogEntry[] = [...lineSet.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));

    const subgroupsByLine: Record<string, CatalogEntry[]> = {};
    for (const [lineVal, sgMap] of subgroupMap) {
      subgroupsByLine[lineVal] = [...sgMap.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "es"));
    }

    const productClasses: CatalogEntry[] = [
      ...(classSet.has("textile")   ? [{ value: "textile",   label: "Textil" }]      : []),
      ...(classSet.has("accessory") ? [{ value: "accessory", label: "Accesorio" }]   : []),
      ...(classSet.has("bulky")     ? [{ value: "bulky",     label: "Voluminoso" }]  : []),
      ...(classSet.has("other")     ? [{ value: "other",     label: "Otro" }]        : []),
    ];

    const sizeClasses: CatalogEntry[] = [
      { value: "small",     label: "Pequeno" },
      { value: "medium",    label: "Mediano" },
      { value: "large",     label: "Grande" },
      ];

    return { lines, subgroupsByLine, productClasses, sizeClasses };
  } catch (err) {
    console.error("[TIENDAS_RULE_CATALOG_DEBUG] Error building catalog from Prisma:", err);
    return emptyCatalog();
  }
}

function emptyCatalog(): StoreRuleCatalog {
  return {
    lines: [],
    subgroupsByLine: {},
    productClasses: [],
    sizeClasses: [
      { value: "small",     label: "Pequeno" },
      { value: "medium",    label: "Mediano" },
      { value: "large",     label: "Grande" },
    ],
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface CatalogValidationResult {
  valid:    boolean;
  errors:   string[];
}

export function validateRuleAgainstCatalog(
  catalog: StoreRuleCatalog,
  rule: { line?: string; subgroup?: string; productClass?: string; sizeClass?: string },
): CatalogValidationResult {
  const errors: string[] = [];

  if (rule.line) {
    const lineVal = normalizeValue(rule.line);
    if (!catalog.lines.some(l => l.value === lineVal)) {
      errors.push(`Linea "${rule.line}" no existe en el catalogo sincronizado.`);
    }
  }

  if (rule.subgroup && rule.line) {
    const lineVal = normalizeValue(rule.line);
    const sgVal = normalizeValue(rule.subgroup);
    const lineSubgroups = catalog.subgroupsByLine[lineVal];
    if (!lineSubgroups || !lineSubgroups.some(s => s.value === sgVal)) {
      errors.push(`Subgrupo "${rule.subgroup}" no pertenece a la linea "${rule.line}".`);
    }
  }

  if (rule.productClass) {
    if (!catalog.productClasses.some(c => c.value === rule.productClass)) {
      errors.push(`Clase de producto "${rule.productClass}" no existe en el catalogo.`);
    }
  }

  if (rule.sizeClass) {
    if (!catalog.sizeClasses.some(s => s.value === rule.sizeClass)) {
      errors.push(`Tamano comercial "${rule.sizeClass}" no existe.`);
    }
  }

  // Structural guards for simplified rule format (TIENDAS-RULES-SIMPLIFICATION-01)
  const r = rule as Record<string, unknown>;
  const minQty   = typeof r.minQty === "number" ? r.minQty : 0;
  const idealQty = typeof r.idealQty === "number" ? r.idealQty : 0;
  const maxQty   = typeof r.maxQty === "number" ? r.maxQty : 0;

  if (minQty < 0 || idealQty < 0 || maxQty < 0) {
    errors.push("Las cantidades no pueden ser negativas.");
  }
  if (idealQty < minQty) {
    errors.push("Ideal no puede ser menor que Min.");
  }
  if (maxQty < idealQty) {
    errors.push("Max no puede ser menor que Ideal.");
  }

  // Textile must have line
  if (r.productClass === "textile" && (r.scope === "line_subgroup" || r.scope === "line")) {
    if (!rule.line) {
      errors.push("Regla textil requiere una linea.");
    }
  }

  // Accessory must have sizeClass
  if (r.productClass === "accessory" && r.scope === "class_size") {
    if (!rule.sizeClass) {
      errors.push("Regla de accesorios requiere un tamano comercial.");
    }
  }

  return { valid: errors.length === 0, errors };
}
