/**
 * lib/marketing-studio/catalogs/catalog-readiness.ts
 *
 * MS-08 — Catalog Readiness Engine
 *
 * Computes a catalog-level readiness from its included + partial product sets.
 * A catalog has its own operational health distinct from individual products.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   empty   — no products at all
 *   blocked — fewer than MIN_CATALOG_SIZE included products
 *   partial — included < total * READY_THRESHOLD, or issues present
 *   ready   — enough included products with assets, no critical blockers
 */

import type { ProductConsoleItem } from "../products/product-display";
import type { ExcludedProduct }    from "./catalog-query-engine";
import type { CatalogChannel }     from "./catalog-types";
import { CatalogReadinessLevel }   from "./catalog-types";

// ── Thresholds ────────────────────────────────────────────────────────────────

const MIN_CATALOG_SIZE = 3;     // minimum included products for "ready"
const READY_THRESHOLD  = 0.6;   // 60% of eligible products must be included

// ── Result ────────────────────────────────────────────────────────────────────

export interface CatalogReadinessResult {
  level:          CatalogReadinessLevel;
  score:          number;          // 0–100
  includedCount:  number;
  partialCount:   number;
  blockedCount:   number;
  totalCount:     number;
  missingAssets:  number;
  missingPrice:   number;
  issues:         string[];
  suggestions:    string[];
}

// ── Computation ───────────────────────────────────────────────────────────────

export function computeCatalogReadiness(
  included:  ProductConsoleItem[],
  partial:   ProductConsoleItem[],
  excluded:  ExcludedProduct[],
  channel:   CatalogChannel,
): CatalogReadinessResult {
  const total        = included.length + partial.length + excluded.length;
  const missingAssets = [...included, ...partial].filter(p => !p.primaryAssetUrl).length;
  const missingPrice  = [...included, ...partial].filter(
    p => p.milaSignals.some(s => s.key === "missing_commercial_data"),
  ).length;

  const issues:      string[] = [];
  const suggestions: string[] = [];

  if (total === 0) {
    return {
      level: CatalogReadinessLevel.EMPTY, score: 0,
      includedCount: 0, partialCount: 0, blockedCount: 0, totalCount: 0,
      missingAssets: 0, missingPrice: 0, issues: ["Sin productos disponibles"], suggestions: [],
    };
  }

  if (included.length === 0) {
    issues.push("Ningún producto cumple todos los criterios del catálogo");
    suggestions.push("Completa metadata de productos en la Biblioteca");
  }

  if (included.length < MIN_CATALOG_SIZE && included.length > 0) {
    issues.push(`Solo ${included.length} producto${included.length > 1 ? "s" : ""} incluido${included.length > 1 ? "s" : ""}. Se recomienda mínimo ${MIN_CATALOG_SIZE}.`);
  }

  if (missingAssets > 0) {
    issues.push(`${missingAssets} producto${missingAssets > 1 ? "s" : ""} sin imagen principal`);
    suggestions.push("Vincula assets visuales desde Foto Estudio");
  }

  if (missingPrice > 0 && (channel === "shopify" || channel === "catalog")) {
    issues.push(`${missingPrice} producto${missingPrice > 1 ? "s" : ""} sin precio definido`);
    suggestions.push("Agrega precios en Biblioteca → editar producto");
  }

  if (partial.length > 0) {
    suggestions.push(`${partial.length} producto${partial.length > 1 ? "s" : ""} parcialmente listo${partial.length > 1 ? "s" : ""} — completa metadata para incluirlos`);
  }

  if (excluded.length > 0 && included.length < total * READY_THRESHOLD) {
    issues.push(`${excluded.length} producto${excluded.length > 1 ? "s" : ""} excluido${excluded.length > 1 ? "s" : ""} por blockers`);
    suggestions.push("Resuelve bloqueos en Review Center");
  }

  // Score: weighted sum
  const inclusionRate  = total > 0 ? included.length / total : 0;
  const assetRate      = (included.length + partial.length) > 0
    ? 1 - (missingAssets / (included.length + partial.length))
    : 0;
  const avgReadiness   = included.length > 0
    ? included.reduce((s, p) => s + p.readinessScore, 0) / included.length
    : 0;

  const rawScore = (inclusionRate * 40) + (assetRate * 30) + (avgReadiness / 100 * 30);
  const score    = Math.min(100, Math.round(rawScore));

  const level =
    included.length === 0                         ? CatalogReadinessLevel.BLOCKED  :
    included.length < MIN_CATALOG_SIZE            ? CatalogReadinessLevel.PARTIAL  :
    inclusionRate < READY_THRESHOLD               ? CatalogReadinessLevel.PARTIAL  :
    issues.length > 0                             ? CatalogReadinessLevel.PARTIAL  :
    CatalogReadinessLevel.READY;

  return {
    level,
    score,
    includedCount: included.length,
    partialCount:  partial.length,
    blockedCount:  excluded.length,
    totalCount:    total,
    missingAssets,
    missingPrice,
    issues,
    suggestions,
  };
}
