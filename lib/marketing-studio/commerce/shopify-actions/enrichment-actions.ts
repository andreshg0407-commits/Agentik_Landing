/**
 * lib/marketing-studio/commerce/shopify-actions/enrichment-actions.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01B — Enrichment action stubs.
 * SERVER ONLY — no React imports.
 *
 * All functions in this file are stubs — extension points for future AI enrichment.
 * They preserve the Copilot contract without implementing AI generation.
 * Implementation: SHOPIFY-ENRICHMENT-01 (future sprint).
 */

import type { ShopifyActionMeta }   from "./action-types";
import {
  mkStub,
  type ShopifyContext,
  type ShopifyActionResult,
} from "./action-types";

// ── Registry entries ───────────────────────────────────────────────────────────

export const ENRICHMENT_ACTION_META: Record<string, ShopifyActionMeta> = {
  completeSeo: {
    id: "completeSeo", category: "enrichment",
    displayName: "Completar SEO",
    description: "Completa metadatos SEO (título, descripción, palabras clave) de los productos indicados.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  ["productIds?: string[]"],
    expectedOutputs: ["ShopifyActionResult"],
  },
  completeSeoTitle: {
    id: "completeSeoTitle", category: "enrichment",
    displayName: "Completar título SEO",
    description: "Genera el título SEO para los productos indicados.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  ["productIds?: string[]"],
    expectedOutputs: ["ShopifyActionResult"],
  },
  completeSeoDescription: {
    id: "completeSeoDescription", category: "enrichment",
    displayName: "Completar meta descripción SEO",
    description: "Genera la meta-descripción SEO para los productos indicados.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  ["productIds?: string[]"],
    expectedOutputs: ["ShopifyActionResult"],
  },
  completeAltText: {
    id: "completeAltText", category: "enrichment",
    displayName: "Completar alt text de imágenes",
    description: "Genera alt text para todas las imágenes de los productos indicados.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  ["productIds?: string[]"],
    expectedOutputs: ["ShopifyActionResult"],
  },
  completeSearchKeywords: {
    id: "completeSearchKeywords", category: "enrichment",
    displayName: "Generar palabras clave de búsqueda",
    description: "Genera keywords optimizadas para Shopify Search.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  ["productIds?: string[]"],
    expectedOutputs: ["ShopifyActionResult"],
  },
  completeCommercialDescription: {
    id: "completeCommercialDescription", category: "enrichment",
    displayName: "Completar descripción comercial",
    description: "Redacta la descripción comercial del producto.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  ["productIds?: string[]"],
    expectedOutputs: ["ShopifyActionResult"],
  },
  completeShopifyTitle: {
    id: "completeShopifyTitle", category: "enrichment",
    displayName: "Optimizar título de Shopify",
    description: "Reescribe el título del producto siguiendo las mejores prácticas de Shopify SEO.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  ["productIds?: string[]"],
    expectedOutputs: ["ShopifyActionResult"],
  },
  completeCatalogMetadata: {
    id: "completeCatalogMetadata", category: "enrichment",
    displayName: "Completar metadatos del catálogo",
    description: "Detecta y completa campos faltantes (descripción, SEO, alt text, tags) en el catálogo.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  [],
    expectedOutputs: ["ShopifyActionResult"],
  },
};

// ── Stub implementations ───────────────────────────────────────────────────────

const noop = (id: string) => (_ctx: ShopifyContext, _productIds?: string[]): Promise<ShopifyActionResult<null>> =>
  Promise.resolve(mkStub(id));

const completeSeo                  = noop("completeSeo");
const completeSeoTitle             = noop("completeSeoTitle");
const completeSeoDescription       = noop("completeSeoDescription");
const completeAltText              = noop("completeAltText");
const completeSearchKeywords       = noop("completeSearchKeywords");
const completeCommercialDescription = noop("completeCommercialDescription");
const completeShopifyTitle         = noop("completeShopifyTitle");

async function completeCatalogMetadata(_ctx: ShopifyContext): Promise<ShopifyActionResult<null>> {
  return mkStub("completeCatalogMetadata");
}

// ── Domain object ──────────────────────────────────────────────────────────────

export const enrichmentActions = {
  completeSeo,
  completeSeoTitle,
  completeSeoDescription,
  completeAltText,
  completeSearchKeywords,
  completeCommercialDescription,
  completeShopifyTitle,
  completeCatalogMetadata,
} as const;
