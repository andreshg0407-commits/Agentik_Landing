/**
 * lib/marketing-studio/orchestration/orchestration-signals.ts
 *
 * MS-12 — Commerce Orchestration Layer: Luca + Mila Operational Intelligence
 *
 * Extended signal generation for the orchestration layer.
 * Pure computation — no Prisma, no fetch, no side effects.
 */

import type { ProductConsoleItem } from "../products/product-display";
import type { LucaCommerceSignal, MilaCommerceSignal } from "../commerce/luca-commerce";
import type { OrgCommerceSyncSummary } from "../commerce/sync-monitor";
import type { OrchestrationJob, DestinationHealth } from "./orchestration-types";
import {
  ORCHESTRATION_JOB_STATUS,
  DESTINATION_HEALTH_LEVEL,
} from "./orchestration-types";

// ── Luca Orchestration Signals ────────────────────────────────────────────────

export function generateOrchestrationLucaSignals(
  products:     ProductConsoleItem[],
  jobs:         OrchestrationJob[],
  destinations: DestinationHealth[],
  syncSummary:  OrgCommerceSyncSummary | null,
): LucaCommerceSignal[] {
  const signals: LucaCommerceSignal[] = [];

  // ── 1. Products ready but dormant (no channel active for 30+ days) ───────
  const dormant = products.filter(p => {
    const readySince = p.approvedAt ? new Date(p.approvedAt) : null;
    if (!readySince) return false;
    const daysSinceApproval = (Date.now() - readySince.getTime()) / (1000 * 60 * 60 * 24);
    const hasActiveChannel  = p.publicationSummary.some(s => s.publicationStatus === "published");
    return daysSinceApproval > 30 && !hasActiveChannel && p.readinessScore >= 60;
  });
  if (dormant.length > 0) {
    signals.push({
      key:               "dormant_approved_products",
      label:             `${dormant.length} producto(s) aprobado(s) sin activar`,
      detail:            `Productos con buen readiness llevan más de 30 días sin publicarse en ningún canal. Stock dormido = ingreso perdido.`,
      urgency:           "high",
      affectedCount:     dormant.length,
      expectedImpact:    "Activar presencia en Shopify y catálogo",
      recommendedAction: "Publicar desde Review Center",
      agentLabel:        "Luca · Orquestación",
    });
  }

  // ── 2. Reusable assets (hero images already approved) ────────────────────
  const withReusableAssets = products.filter(
    p => p.assetCount >= 3 && p.readyDestinations.includes("ads" as never),
  );
  if (withReusableAssets.length > 0) {
    signals.push({
      key:               "reusable_assets_available",
      label:             `${withReusableAssets.length} producto(s) con assets reutilizables`,
      detail:            "Assets aprobados que pueden usarse para campañas de Ads, Reels y Stories sin regeneración.",
      urgency:           "medium",
      affectedCount:     withReusableAssets.length,
      expectedImpact:    "Reducción de costo de producción",
      recommendedAction: "Crear campaña desde Biblioteca",
      agentLabel:        "Luca · Orquestación",
    });
  }

  // ── 3. Catalogs with incomplete coverage ─────────────────────────────────
  const catalogDest = destinations.find(d => d.channel === "catalog");
  if (catalogDest && catalogDest.syncedProducts < products.length * 0.5) {
    const gap = products.length - catalogDest.syncedProducts;
    signals.push({
      key:               "catalog_incomplete",
      label:             `Catálogo incompleto — faltan ${gap} producto(s)`,
      detail:            "El catálogo activo representa menos del 50% del inventario publicado. Operadores y mayoristas ven un catálogo parcial.",
      urgency:           "medium",
      affectedCount:     gap,
      expectedImpact:    "Mayor cobertura de catálogo para clientes",
      recommendedAction: "Reconstruir catálogo desde Catálogos",
      agentLabel:        "Luca · Orquestación",
    });
  }

  // ── 4. Sync degraded — Shopify ────────────────────────────────────────────
  if (syncSummary && syncSummary.stale > 0) {
    signals.push({
      key:               "sync_stale_products",
      label:             `${syncSummary.stale} producto(s) con sync desactualizado`,
      detail:            "Sync de más de 14 días en Shopify. Cambios en precio, variantes o disponibilidad pueden no estar reflejados.",
      urgency:           "medium",
      affectedCount:     syncSummary.stale,
      expectedImpact:    "Consistencia de datos en tienda",
      recommendedAction: "Ejecutar sync check desde Commerce OS",
      agentLabel:        "Luca · Orquestación",
    });
  }

  // ── 5. Failed jobs accumulating ───────────────────────────────────────────
  const criticalFailed = jobs.filter(
    j => j.status === ORCHESTRATION_JOB_STATUS.FAILED && j.retryCount >= 3,
  );
  if (criticalFailed.length > 0) {
    signals.push({
      key:               "critical_job_failures",
      label:             `${criticalFailed.length} job(s) críticos sin resolver`,
      detail:            "Jobs con reintentos agotados. La distribución de productos en estos canales está interrumpida.",
      urgency:           "critical",
      affectedCount:     criticalFailed.length,
      expectedImpact:    "Recuperar distribución bloqueada",
      recommendedAction: "Revisar en Orchestration Center",
      agentLabel:        "Luca · Orquestación",
    });
  }

  // ── 6. High readiness products without variants ──────────────────────────
  const missingVariants = products.filter(
    p => p.readinessScore >= 70 && p.variantCount === 0,
  );
  if (missingVariants.length > 0) {
    signals.push({
      key:               "high_readiness_no_variants",
      label:             `${missingVariants.length} producto(s) sin variantes`,
      detail:            "Productos con readiness alto sin variantes. Shopify y campañas de Ads requieren al menos 1 variante activa.",
      urgency:           "medium",
      affectedCount:     missingVariants.length,
      expectedImpact:    "Desbloquear publicación en Shopify",
      recommendedAction: "Agregar variantes desde Biblioteca",
      agentLabel:        "Luca · Orquestación",
    });
  }

  // ── 7. Campaign opportunity from dormant approved products ───────────────
  const campaignReady = products.filter(
    p => p.readinessScore >= 85 && p.assetCount >= 2,
  );
  if (campaignReady.length >= 3) {
    signals.push({
      key:               "campaign_opportunity",
      label:             `${campaignReady.length} productos listos para campaña`,
      detail:            `Hay ${campaignReady.length} productos con readiness > 85 y assets disponibles. Oportunidad de campaña coordinada.`,
      urgency:           "low",
      affectedCount:     campaignReady.length,
      expectedImpact:    "Campaña multi-producto posible sin producción adicional",
      recommendedAction: "Activar desde IA Marketing",
      agentLabel:        "Luca · Orquestación",
    });
  }

  return signals;
}

// ── Mila Orchestration Signals ────────────────────────────────────────────────

export function generateOrchestrationMilaSignals(
  products:    ProductConsoleItem[],
  syncSummary: OrgCommerceSyncSummary | null,
): MilaCommerceSignal[] {
  const signals: MilaCommerceSignal[] = [];

  // ── 1. Products available for immediate sale ──────────────────────────────
  const sellable = products.filter(
    p => p.publicationSummary.some(s => s.publicationStatus === "published") &&
      p.readinessScore >= 70,
  );
  if (sellable.length > 0) {
    signals.push({
      key:           "products_available_for_sale",
      label:         `${sellable.length} producto(s) disponibles para venta`,
      detail:        "Productos publicados con readiness adecuado. Disponibles en canales activos.",
      urgency:       "low",
      agentLabel:    "Mila · Comercio",
    });
  }

  // ── 2. Products without pricing ──────────────────────────────────────────
  const noPricing = products.filter(p => !p.readyDestinations.includes("shopify" as never));
  if (noPricing.length > 0) {
    signals.push({
      key:           "products_without_pricing",
      label:         `${noPricing.length} producto(s) sin condiciones para Shopify`,
      detail:        "Productos que no cumplen los requisitos de Shopify (precio, variantes, imágenes). No pueden venderse online.",
      urgency:       "medium",
      agentLabel:    "Mila · Comercio",
    });
  }

  // ── 3. Catalog incomplete for ordering ───────────────────────────────────
  const noAvailability = products.filter(
    p => p.status === "approved" && !p.readyDestinations.includes("catalog" as never),
  );
  if (noAvailability.length > 0) {
    signals.push({
      key:           "catalog_gaps",
      label:         `${noAvailability.length} producto(s) fuera del catálogo`,
      detail:        "Productos aprobados que no están en el catálogo activo. Clientes y vendedores no los ven al pedir.",
      urgency:       "high",
      agentLabel:    "Mila · Comercio",
    });
  }

  // ── 4. WhatsApp catalog out of date ──────────────────────────────────────
  if (syncSummary && syncSummary.stale > 0) {
    signals.push({
      key:           "whatsapp_catalog_stale",
      label:         `Catálogo de WhatsApp desactualizado`,
      detail:        `${syncSummary.stale} productos con cambios recientes no reflejados en WhatsApp Business Catalog.`,
      urgency:       "medium",
      agentLabel:    "Mila · Comercio",
    });
  }

  // ── 5. Products eligible for WhatsApp but not configured ─────────────────
  const waReady = products.filter(
    p => p.readinessScore >= 60 &&
      !p.publicationSummary.some(s => s.channel === "whatsapp" && s.publicationStatus === "published"),
  );
  if (waReady.length > 0) {
    signals.push({
      key:           "whatsapp_catalog_candidates",
      label:         `${waReady.length} producto(s) aptos para WhatsApp`,
      detail:        "Productos con readiness suficiente para WhatsApp Business Catalog que aún no están configurados.",
      urgency:       "low",
      agentLabel:    "Mila · Comercio",
    });
  }

  return signals;
}
