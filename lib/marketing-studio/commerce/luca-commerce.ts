/**
 * lib/marketing-studio/commerce/luca-commerce.ts
 *
 * MS-09D — Luca Commerce Intelligence
 *
 * Luca evolves from content advisor → commerce strategist.
 * Generates commerce-specific signals about distribution readiness,
 * dormant high-value products, channel imbalances, and growth opportunities.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Pure computation — no Prisma, no fetch, no side effects.
 *   Output is serializable for RSC → client boundary.
 */

import type { ProductConsoleItem } from "../products/product-display";
import type { OrgCommerceSyncSummary } from "./sync-monitor";
import type { PublicationQueueItem } from "./publication-engine";
import type { CommerceDestination } from "./commerce-types";
import { SYNC_HEALTH } from "./commerce-types";

// ── Signal types ──────────────────────────────────────────────────────────────

export type CommerceSignalUrgency = "critical" | "high" | "medium" | "low";

export interface LucaCommerceSignal {
  key:               string;
  label:             string;
  detail:            string;
  urgency:           CommerceSignalUrgency;
  affectedCount:     number;
  expectedImpact?:   string;
  recommendedAction?: string;
  agentLabel:        string;
}

// ── Generator ─────────────────────────────────────────────────────────────────

export function generateLucaCommerceSignals(
  products:    ProductConsoleItem[],
  queue:       PublicationQueueItem[],
  destination: CommerceDestination,
  syncSummary?: OrgCommerceSyncSummary | null,
): LucaCommerceSignal[] {
  const signals: LucaCommerceSignal[] = [];

  // ── 0. Sync-aware signals (MS-12) ────────────────────────────────────────
  if (syncSummary) {
    if (syncSummary.missingExternal > 0) {
      signals.push({
        key:               "external_product_missing",
        label:             `${syncSummary.missingExternal} producto${syncSummary.missingExternal > 1 ? "s" : ""} eliminado${syncSummary.missingExternal > 1 ? "s" : ""} en Shopify`,
        detail:            "Productos que estaban publicados en Shopify fueron eliminados externamente. Hay que re-publicar para restablecer presencia.",
        urgency:           "critical" as CommerceSignalUrgency,
        affectedCount:     syncSummary.missingExternal,
        expectedImpact:    "Producto invisible en tienda Shopify",
        recommendedAction: "Re-publicar desde el panel de Shopify",
        agentLabel:        "Luca · Comercio",
      });
    }

    if (syncSummary.conflict > 0) {
      signals.push({
        key:               "shopify_conflict",
        label:             `${syncSummary.conflict} conflicto${syncSummary.conflict > 1 ? "s" : ""} de sincronización`,
        detail:            "Tanto Agentik como Shopify tienen cambios recientes no reconciliados. Requiere intervención manual para evitar sobreescritura.",
        urgency:           "critical" as CommerceSignalUrgency,
        affectedCount:     syncSummary.conflict,
        expectedImpact:    "Pérdida de datos si se sobreescribe sin revisar",
        recommendedAction: "Revisar conflictos en el panel de reconciliación",
        agentLabel:        "Luca · Comercio",
      });
    }

    if (syncSummary.driftDetected > 0) {
      signals.push({
        key:               "shopify_drift",
        label:             `${syncSummary.driftDetected} producto${syncSummary.driftDetected > 1 ? "s" : ""} con drift detectado`,
        detail:            "Los datos en Shopify no coinciden con el registro en Agentik. Pueden ser cambios de título, precio, variantes o imágenes.",
        urgency:           syncSummary.driftDetected >= 5 ? "high" as CommerceSignalUrgency : "medium" as CommerceSignalUrgency,
        affectedCount:     syncSummary.driftDetected,
        expectedImpact:    "Inconsistencia entre catálogo interno y tienda visible",
        recommendedAction: "Ejecutar sync check y revisar drift report",
        agentLabel:        "Luca · Comercio",
      });
    }

    if (syncSummary.agentikNewer > 0) {
      signals.push({
        key:               "agentik_updates_pending",
        label:             `${syncSummary.agentikNewer} producto${syncSummary.agentikNewer > 1 ? "s" : ""} actualizados en Agentik sin reflejar en Shopify`,
        detail:            "Hay cambios en Agentik más recientes que la última sincronización. Shopify está mostrando datos desactualizados.",
        urgency:           "medium" as CommerceSignalUrgency,
        affectedCount:     syncSummary.agentikNewer,
        expectedImpact:    "Clientes ven datos desactualizados en la tienda",
        recommendedAction: "Publicar actualizaciones desde la cola de sincronización",
        agentLabel:        "Luca · Comercio",
      });
    }

    if (syncSummary.webhookPending > 0) {
      signals.push({
        key:               "webhooks_pending",
        label:             `${syncSummary.webhookPending} evento${syncSummary.webhookPending > 1 ? "s" : ""} de Shopify sin procesar`,
        detail:            "Hay webhooks de Shopify guardados que aún no se han procesado. Pueden contener cambios en productos, inventario o estado.",
        urgency:           syncSummary.webhookPending >= 10 ? "high" as CommerceSignalUrgency : "medium" as CommerceSignalUrgency,
        affectedCount:     syncSummary.webhookPending,
        expectedImpact:    "Estado interno desactualizado respecto a Shopify",
        recommendedAction: "Procesar webhooks desde el panel de monitoreo",
        agentLabel:        "Luca · Comercio",
      });
    }
  }

  // ── 1. Sync critical failures ────────────────────────────────────────────
  const criticalSyncs = queue.filter(i => i.syncHealth === SYNC_HEALTH.CRITICAL);
  if (criticalSyncs.length > 0) {
    signals.push({
      key:               "critical_sync_failures",
      label:             `${criticalSyncs.length} producto${criticalSyncs.length > 1 ? "s" : ""} con sync crítico`,
      detail:            "El dato en el canal puede estar desactualizado o ausente. Cada hora sin resolución incrementa el riesgo de inconsistencia comercial.",
      urgency:           "critical",
      affectedCount:     criticalSyncs.length,
      expectedImpact:    "Desincronización visible en tienda o catálogo",
      recommendedAction: "Reintentar sync desde el panel de operaciones",
      agentLabel:        "Luca · Comercio",
    });
  }

  // ── 2. High readiness dormant products ──────────────────────────────────
  const dormant = products.filter(
    p => p.readinessScore >= 70 &&
         p.primaryAssetUrl &&
         p.publicationSummary.every(pub => pub.publicationStatus === "unpublished"),
  );
  if (dormant.length > 0) {
    signals.push({
      key:               "high_readiness_dormant",
      label:             `${dormant.length} producto${dormant.length > 1 ? "s" : ""} listos sin distribuir`,
      detail:            `Readiness ≥70, asset principal presente, sin publicar en ningún canal. Valor comercial latente máximo.`,
      urgency:           dormant.length >= 5 ? "high" : "medium",
      affectedCount:     dormant.length,
      expectedImpact:    "Activación directa en Shopify sin trabajo adicional",
      recommendedAction: "Publicar en Shopify desde la cola de publicación",
      agentLabel:        "Luca · Comercio",
    });
  }

  // ── 3. Ready for Ads but not distributed ────────────────────────────────
  const adsReady = products.filter(
    p => p.variantCount > 0 &&
         p.readinessScore >= 60 &&
         p.primaryAssetUrl &&
         !p.readyDestinations.includes("ads" as never),
  );
  if (adsReady.length >= 2) {
    signals.push({
      key:               "ads_ready_not_distributed",
      label:             `${adsReady.length} productos con assets para pauta sin activar`,
      detail:            "Tienen variantes y assets pero no están habilitados en el canal de Ads. Completar metadata de campaña desbloquea impresiones pagadas.",
      urgency:           "medium",
      affectedCount:     adsReady.length,
      expectedImpact:    "Reducción de costo por impresión al contar con assets pre-aprobados",
      recommendedAction: "Activar canal Ads en Biblioteca → editar producto",
      agentLabel:        "Luca · Comercio",
    });
  }

  // ── 4. Weak Shopify coverage ─────────────────────────────────────────────
  const shopifyReady    = products.filter(p => p.readyDestinations.includes("shopify" as never)).length;
  const shopifyEligible = products.filter(
    p => p.readinessScore >= 40 && p.primaryAssetUrl,
  ).length;

  if (shopifyEligible > 0 && shopifyReady < shopifyEligible * 0.5) {
    signals.push({
      key:               "weak_shopify_coverage",
      label:             `Solo ${shopifyReady} de ${shopifyEligible} productos elegibles están listos para Shopify`,
      detail:            "Hay productos con assets y readiness suficiente que no tienen completa la metadata requerida por Shopify (precio, categoría, descripción).",
      urgency:           "medium",
      affectedCount:     shopifyEligible - shopifyReady,
      expectedImpact:    "Ampliar el catálogo de Shopify con productos ya aprobados",
      recommendedAction: "Completar metadata Shopify en Biblioteca",
      agentLabel:        "Luca · Comercio",
    });
  }

  // ── 5. Missing mobile variants ───────────────────────────────────────────
  const noVariants = products.filter(
    p => p.variantCount === 0 && p.primaryAssetUrl && p.readinessScore >= 40,
  );
  if (noVariants.length >= 3) {
    signals.push({
      key:               "missing_mobile_variants",
      label:             `${noVariants.length} productos sin variante 9:16`,
      detail:            "El formato vertical es requerido para Ads, TikTok y Reels. Sin él, los productos no son activables en canales móviles.",
      urgency:           "medium",
      affectedCount:     noVariants.length,
      expectedImpact:    "Desbloquear pauta digital en formatos móviles",
      recommendedAction: "Generar variantes 9:16 desde Foto Estudio",
      agentLabel:        "Luca · Comercio",
    });
  }

  // ── 6. Stale hero products ───────────────────────────────────────────────
  const stalePublished = queue.filter(
    i => i.publicationStatus === "published" &&
         i.syncDriftDays !== null &&
         i.syncDriftDays > 14,
  );
  if (stalePublished.length > 0) {
    signals.push({
      key:               "stale_hero_products",
      label:             `${stalePublished.length} productos publicados sin re-sincronizar`,
      detail:            `Llevan más de 14 días sin sincronización. El dato en el canal puede no reflejar cambios recientes en metadata o precios.`,
      urgency:           stalePublished.length >= 5 ? "high" : "medium",
      affectedCount:     stalePublished.length,
      expectedImpact:    "Mantener consistencia entre Agentik y el canal de venta",
      recommendedAction: "Re-sincronizar desde el panel de sincronización",
      agentLabel:        "Luca · Comercio",
    });
  }

  // ── 7. Duplicate catalog density ─────────────────────────────────────────
  const categoryMap = new Map<string, number>();
  for (const p of products) {
    if (!p.category) continue;
    categoryMap.set(p.category, (categoryMap.get(p.category) ?? 0) + 1);
  }
  const overloadedCategories = [...categoryMap.entries()]
    .filter(([, count]) => count > 15)
    .map(([cat]) => cat);

  if (overloadedCategories.length > 0) {
    signals.push({
      key:               "overloaded_categories",
      label:             `${overloadedCategories.length} categoría${overloadedCategories.length > 1 ? "s" : ""} con densidad alta`,
      detail:            `Las categorías: ${overloadedCategories.join(", ")} tienen más de 15 productos. Dividir en sub-colecciones mejora conversión en Shopify.`,
      urgency:           "low",
      affectedCount:     overloadedCategories.length,
      expectedImpact:    "Mejor navegación y SEO en colecciones Shopify",
      recommendedAction: "Crear sub-colecciones en el Catalog Builder",
      agentLabel:        "Luca · Comercio",
    });
  }

  // Sort by urgency
  const URGENCY_ORDER: Record<CommerceSignalUrgency, number> = {
    critical: 4, high: 3, medium: 2, low: 1,
  };
  return signals.sort((a, b) =>
    URGENCY_ORDER[b.urgency] - URGENCY_ORDER[a.urgency],
  );
}

// ── Mila commerce intelligence ────────────────────────────────────────────────

export interface MilaCommerceSignal {
  key:       string;
  label:     string;
  detail:    string;
  urgency:   CommerceSignalUrgency;
  agentLabel: string;
}

export function generateMilaCommerceSignals(
  products:     ProductConsoleItem[],
  queue:        PublicationQueueItem[],
  syncSummary?: OrgCommerceSyncSummary | null,
): MilaCommerceSignal[] {
  const signals: MilaCommerceSignal[] = [];

  // ── Sync-aware Mila signals (MS-12) ─────────────────────────────────────
  if (syncSummary) {
    if (syncSummary.externalNewer > 0) {
      signals.push({
        key:       "external_modified_products",
        label:     `${syncSummary.externalNewer} producto${syncSummary.externalNewer > 1 ? "s" : ""} modificados externamente en Shopify`,
        detail:    "Shopify tiene cambios que no están en Agentik. Pueden ser ediciones de precio, disponibilidad o descripción realizadas directamente en el panel de Shopify.",
        urgency:   "high" as CommerceSignalUrgency,
        agentLabel: "Mila · Ventas",
      });
    }

    if (syncSummary.stale > 0) {
      signals.push({
        key:       "stale_published_products",
        label:     `${syncSummary.stale} producto${syncSummary.stale > 1 ? "s" : ""} publicado${syncSummary.stale > 1 ? "s" : ""} sin sincronizar en +14 días`,
        detail:    "Estos productos están en Shopify pero llevan más de 14 días sin verificación. Los datos de disponibilidad o precio pueden estar desactualizados para el equipo de ventas.",
        urgency:   "medium" as CommerceSignalUrgency,
        agentLabel: "Mila · Ventas",
      });
    }
  }

  const whatsappReady = products.filter(
    p => p.readyDestinations.includes("whatsapp" as never) && p.primaryAssetUrl,
  );
  if (whatsappReady.length > 0) {
    signals.push({
      key:       "whatsapp_commerce_ready",
      label:     `${whatsappReady.length} productos listos para comercio WhatsApp`,
      detail:    "Tienen nombre, disponibilidad y asset. El equipo de ventas puede compartirlos directamente con clientes desde el CRM.",
      urgency:   whatsappReady.length >= 5 ? "high" : "medium",
      agentLabel: "Mila · Ventas",
    });
  }

  const missingCommercial = products.filter(
    p => p.milaSignals.some(s => s.key === "missing_commercial_data"),
  );
  if (missingCommercial.length > 0) {
    signals.push({
      key:       "missing_commercial_metadata",
      label:     `${missingCommercial.length} productos sin precio o SKU`,
      detail:    "Sin estos campos, los productos no pueden procesarse en Shopify, WhatsApp Commerce ni CRM. El equipo de ventas no puede cotizarlos.",
      urgency:   missingCommercial.length >= 5 ? "high" : "medium",
      agentLabel: "Mila · Ventas",
    });
  }

  const publishedProducts = queue.filter(i => i.publicationStatus === "published");
  if (publishedProducts.length > 0) {
    signals.push({
      key:       "commerce_live",
      label:     `${publishedProducts.length} productos activos en canales de venta`,
      detail:    "El equipo de ventas puede referenciar estos productos en cotizaciones, WhatsApp y catálogos personalizados.",
      urgency:   "low",
      agentLabel: "Mila · Ventas",
    });
  }

  return signals;
}
