/**
 * lib/comercial/catalog/is-commercial-article.ts
 *
 * SAG-CATALOG-FULL-SYNC-03 Phase 2 — Official commercial filter.
 *
 * Approved rule (CATALOG_FILTER_DECISION.md §7, Rule R2):
 *   sc_activo = 'S'
 *   sc_bloqueado = 'N'
 *   n_valor_venta_normal > 0
 *   sc_maneja_kardex = 'S'
 *
 * Result on Castillitos: 4,561 commercial products out of 10,439 total.
 *
 * Every sync pipeline MUST use this function — no duplicating filter logic.
 */

import type { SagArticleNormalized } from "@/lib/connectors/adapters/sag-pya-soap/catalog/sag-articles-types";

/**
 * Returns true if a normalized SAG article is a commercial (sellable) product.
 *
 * Non-commercial articles include: accounting concepts (PUC), payroll items,
 * raw materials, supplies, taxes, and inactive/blocked products.
 */
export function isCommercialArticle(art: SagArticleNormalized): boolean {
  return (
    art.activo &&
    !art.bloqueado &&
    art.precio > 0 &&
    art.manejaKardex
  );
}
