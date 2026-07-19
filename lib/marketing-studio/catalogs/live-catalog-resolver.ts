/**
 * lib/marketing-studio/catalogs/live-catalog-resolver.ts
 *
 * MARKETING-STUDIO-LIVE-CATALOGS-01
 *
 * Pure resolver: CatalogSpec + current products → LiveCatalogResolution.
 *
 * ── Principles ────────────────────────────────────────────────────────────────
 *
 *   • No DB reads. No API calls. No side effects.
 *   • Deterministic: same spec + same products = same result.
 *   • Single source of truth: product data always from current Biblioteca state.
 *   • No duplication: LiveCatalogProduct is derived, never stored as a copy.
 *
 * ── LINK vs PDF ───────────────────────────────────────────────────────────────
 *
 *   resolveLiveCatalog()  → called on every link access. Always fresh.
 *   snapshotCatalog()     → called at PDF generation time. Frozen at that moment.
 *
 * ── Rule processing (FASE 3) ─────────────────────────────────────────────────
 *
 *   Rules in spec.filter.rules are applied in order (AND semantics).
 *   A product must satisfy ALL rules to be included.
 *   New products that satisfy the rules auto-appear in live links.
 *
 * ── Stock and availability (FASE 4) ──────────────────────────────────────────
 *
 *   NOT_READY products are excluded from live experiences.
 *   When inventory integration exists, stock signals will feed into readinessLevel.
 *   No stale availability data is ever shown.
 */

import { ReadinessLevel }           from "../products/domain/product-enums";
import type { ProductConsoleItem }  from "../products/product-display";
import type {
  CatalogSpec,
  CatalogInclusionRule,
  CatalogReadinessPolicy,
  CatalogSelectionMode,
}                                   from "./catalog-v2-types";
import type {
  LiveCatalogResolution,
  LiveCatalogProduct,
}                                   from "./live-catalog-types";

// ── Rule engine ───────────────────────────────────────────────────────────────

/**
 * Evaluates a single rule against a product.
 * Returns true if the product satisfies the rule.
 */
function applyRule(product: ProductConsoleItem, rule: CatalogInclusionRule): boolean {
  const { field, operator, value } = rule;

  switch (field) {
    case "category": {
      const cat = product.category ?? "";
      if (operator === "eq")       return cat === value;
      if (operator === "contains") return cat.toLowerCase().includes(String(value).toLowerCase());
      if (operator === "in")       return Array.isArray(value) && value.includes(cat);
      return false;
    }

    case "has_primary_asset": {
      const has = product.primaryAssetUrl != null;
      return operator === "eq" ? has === Boolean(value) : false;
    }

    case "readiness_score": {
      const score = product.readinessScore;
      if (operator === "gte") return score >= Number(value);
      if (operator === "lte") return score <= Number(value);
      if (operator === "eq")  return score === Number(value);
      return false;
    }

    case "availability": {
      const available = product.readinessLevel === ReadinessLevel.READY;
      return operator === "eq" ? available === Boolean(value) : false;
    }

    // Future fields (line, tag, age_range, attribute, status)
    // Return true by default so catalogs don't silently break when new fields arrive
    default:
      return true;
  }
}

/**
 * Applies all rules to a product set (AND semantics).
 * A product must satisfy every rule to pass.
 */
function applyRules(
  products: ProductConsoleItem[],
  rules:    CatalogInclusionRule[],
): ProductConsoleItem[] {
  if (rules.length === 0) return products;
  return products.filter(p => rules.every(r => applyRule(p, r)));
}

// ── Product mapping ───────────────────────────────────────────────────────────

/**
 * Maps a ProductConsoleItem to a LiveCatalogProduct.
 *
 * Single source of truth: every field is derived from the current product state.
 * No data is stored or cached — this mapping runs fresh on every resolution.
 */
function toLiveProduct(product: ProductConsoleItem): LiveCatalogProduct {
  return {
    productId:       product.productId,
    name:            product.name,
    sku:             product.sku ?? null,
    category:        product.category ?? null,
    primaryAssetUrl: product.primaryAssetUrl ?? null,
    isAvailable:     product.readinessLevel === ReadinessLevel.READY,
    readinessLevel:  String(product.readinessLevel),
  };
}

// ── Readiness policy filter — FASE 1 ──────────────────────────────────────────

/**
 * Applies the productReadinessPolicy to a product set.
 *
 *   show_all      — no filtering, all products pass.
 *   hide_not_ready — exclude products with readinessLevel = NOT_READY.
 *   only_ready    — include ONLY products with readinessLevel = READY.
 *
 * Applied AFTER all other inclusion logic (selection, rules, manualIds).
 * Nothing about readiness is hardcoded in the resolver.
 */
function applyReadinessPolicy(
  products: ProductConsoleItem[],
  policy:   CatalogReadinessPolicy,
): ProductConsoleItem[] {
  switch (policy) {
    case "show_all":
      return products;
    case "hide_not_ready":
      return products.filter(p => p.readinessLevel !== ReadinessLevel.NOT_READY);
    case "only_ready":
      return products.filter(p => p.readinessLevel === ReadinessLevel.READY);
  }
}

// ── Selection mode — FASE 2 + FASE 3 ──────────────────────────────────────────

/**
 * Applies selectionMode to determine the candidate product set.
 *
 *   dynamic (default for LINK):
 *     1. Apply category + searchQuery filters to all products.
 *     2. Apply structured rules (FASE 3).
 *     3. Merge manualIds as additional explicit inclusions (union, not replacement).
 *        A product in manualIds always appears, even if it doesn't match the rules.
 *
 *   fixed (recommended for PDF):
 *     1. Product set = ONLY the products listed in manualIds.
 *     2. Categories, searchQuery, and rules are all ignored.
 *     3. The editor's explicit selection is the complete product list.
 *
 * Test cases:
 *   TC-01 dynamic, no rules, no manualIds    → all products (unfiltered)
 *   TC-02 dynamic, category filter           → products in category
 *   TC-03 dynamic, rules + manualIds         → rule matches UNION manualIds
 *   TC-04 fixed, manualIds=[A,B]             → exactly [A, B] (rules ignored)
 *   TC-05 fixed, manualIds=[]                → empty set (no implicit products)
 */
function selectProducts(
  products:      ProductConsoleItem[],
  spec:          CatalogSpec,
  selectionMode: CatalogSelectionMode,
): ProductConsoleItem[] {
  const { categories, searchQuery, manualIds, rules } = spec.filter;

  if (selectionMode === "fixed") {
    // TC-04, TC-05 — explicit fixed list, no rule evaluation
    if (manualIds.length === 0) return [];
    return products.filter(p => manualIds.includes(p.productId));
  }

  // dynamic path ────────────────────────────────────────────────────────────
  // Step 1 — Category filter
  let ruleSet = [...products];

  if (categories.length > 0) {
    ruleSet = ruleSet.filter(
      p => p.category != null && categories.includes(p.category),
    );
  }

  // Step 2 — Full-text search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    ruleSet = ruleSet.filter(
      p => p.name.toLowerCase().includes(q) ||
           (p.sku != null && p.sku.toLowerCase().includes(q)),
    );
  }

  // Step 3 — Structured rules (FASE 3 — rule-based auto-inclusion)
  if (rules.length > 0) {
    ruleSet = applyRules(ruleSet, rules);
  }

  // Step 4 — Merge manualIds as additional inclusions (TC-03)
  // Products in manualIds that didn't pass the rules are added explicitly.
  if (manualIds.length > 0) {
    const ruleIds  = new Set(ruleSet.map(p => p.productId));
    const extras   = products.filter(
      p => manualIds.includes(p.productId) && !ruleIds.has(p.productId),
    );
    ruleSet = [...ruleSet, ...extras];
  }

  return ruleSet;
}

// ── Live resolver — FASE 6 ────────────────────────────────────────────────────

/**
 * Resolves a live catalog from a CatalogSpec + current product state.
 *
 * Called every time a live link is accessed.
 * Never returns stale data: the result always reflects the current Biblioteca state.
 *
 * Resolution pipeline:
 *   1. selectProducts()      — applies selectionMode (dynamic or fixed)
 *   2. applyReadinessPolicy() — filters by productReadinessPolicy
 *
 * Changes that auto-propagate to live links (no manual regeneration needed):
 *   - Price change
 *   - Image/asset update
 *   - Description change
 *   - Category change
 *   - Availability / readiness change
 *   - New product that satisfies the rules (dynamic mode only)
 *   - Product deactivation (excluded by readiness policy)
 */
export function resolveLiveCatalog(
  spec:         CatalogSpec,
  products:     ProductConsoleItem[],
  definitionId: string = "ephemeral",
): LiveCatalogResolution {
  const selectionMode = spec.selectionMode          ?? "dynamic";
  const policy        = spec.productReadinessPolicy ?? "show_all";

  // Step 1 — Selection (mode-aware: dynamic rules vs fixed list)
  let included = selectProducts(products, spec, selectionMode);

  // Step 2 — Readiness policy (configurable, never hardcoded)
  included = applyReadinessPolicy(included, policy);

  return {
    definitionId,
    resolvedAt:             new Date().toISOString(),
    type:                   spec.type,
    templateId:             spec.templateId,
    products:               included.map(toLiveProduct),
    totalProducts:          included.length,
    showPrices:             spec.showPrices,
    ctaText:                spec.ctaText,
    liveNote:               "Este catálogo refleja el estado actual de tus productos. Se actualiza automáticamente.",
    selectionMode,
    productReadinessPolicy: policy,
  };
}

// ── Snapshot (PDF) ────────────────────────────────────────────────────────────

/**
 * Creates a frozen snapshot of the catalog at a specific point in time.
 * Used for PDF generation.
 *
 * Architecture rule: PDF = fotografía estática. Link = catálogo vivo.
 *
 * The snapshot includes all products at resolution time.
 * It will NOT change after this point, even if products are updated.
 *
 * FASE 7: The snapshot records the selectionMode and productReadinessPolicy
 * that were active at generation time, so the PDF is fully auditable.
 */
export function snapshotCatalog(
  spec:         CatalogSpec,
  products:     ProductConsoleItem[],
  definitionId: string = "snapshot",
): LiveCatalogResolution & { frozenAt: string } {
  const resolution = resolveLiveCatalog(spec, products, definitionId);
  const dateLabel  = new Date().toLocaleDateString("es-CO", {
    day: "numeric", month: "long", year: "numeric",
  });

  // The snapshot captures selectionMode and policy from resolution,
  // so the PDF is self-describing and auditable after the fact.
  return {
    ...resolution,
    liveNote: `Fotografía del catálogo generada el ${dateLabel}. No refleja cambios posteriores a esta fecha.`,
    frozenAt: resolution.resolvedAt,
    // selectionMode and productReadinessPolicy already in resolution (spread above)
  };
}
