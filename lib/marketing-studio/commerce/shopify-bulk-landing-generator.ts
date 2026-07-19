/**
 * lib/marketing-studio/commerce/shopify-bulk-landing-generator.ts
 *
 * SHOPIFY-EXPERIENCIAS-05 — Bulk Landing Draft Generator
 *
 * SERVER ONLY — never import from client components.
 *
 * Generates multiple landing drafts in a single batch.
 * Reuses:
 *   - shopify-landing-generator.ts (single draft generation)
 *   - shopify-landing-draft-service.ts (persistence + duplicate check)
 *   - readiness engine (ExperienceAvailability)
 *
 * Does NOT publish to Shopify.
 */

import "server-only";

import { generateLandingDraft }  from "./shopify-landing-generator";
import { createLandingDraft }    from "./shopify-landing-draft-service";
import { EXPERIENCE_TEMPLATES }  from "./shopify-experiences-templates";
import type { LandingDraftGenerationInput } from "./shopify-landing-draft-types";
import type { LandingDraft }     from "./shopify-landing-draft-types";
import type { GenerationRules }  from "./shopify-experiences-types";
import type { ExperienceAvailability } from "./shopify-experiences-types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BulkLandingCandidate {
  productId:   string;
  productName: string;
  sku:         string | null;
  precio:      string | null;
  coleccion:   string | null;
  shopifyUrl:  string | null;
  readiness:   "READY" | "PARTIAL" | "MISSING_ASSETS" | "NO_MEDIA";
  photoCount:  number;
  videoCount:  number;
}

export interface BulkLandingValidation {
  eligible:  BulkLandingCandidate[];
  skipped:   BulkSkippedItem[];
}

export interface BulkSkippedItem {
  productId:   string;
  productName: string;
  reason:      string;
}

export interface BulkGenerationSummary {
  requested: number;
  created:   number;
  skipped:   number;
  failed:    number;
}

export interface BulkGenerationResult {
  ok:            boolean;
  summary:       BulkGenerationSummary;
  createdDrafts: LandingDraft[];
  skippedItems:  BulkSkippedItem[];
  failedItems:   BulkFailedItem[];
}

export interface BulkFailedItem {
  productId:   string;
  productName: string;
  error:       string;
}

// ── Template selection ───────────────────────────────────────────────────────

/**
 * Selects the best template for bulk generation.
 * Prefers tenant-specific templates, then active landing_producto templates.
 */
export function selectDefaultTemplateForBulk(
  tenantPreset?: string | null,
): string | null {
  // Prefer tenant-specific template
  if (tenantPreset) {
    const tenantTpl = EXPERIENCE_TEMPLATES.find(
      t => t.activa && t.etiquetas.includes(tenantPreset),
    );
    if (tenantTpl) return tenantTpl.id;
  }

  // Fallback to first active landing_producto template
  const fallback = EXPERIENCE_TEMPLATES.find(
    t => t.activa && t.destino === "landing_producto",
  ) ?? EXPERIENCE_TEMPLATES.find(t => t.activa);

  return fallback?.id ?? null;
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates which products are eligible for bulk generation.
 * Only READY and PARTIAL products can generate drafts.
 */
export function validateBulkLandingCandidates(
  candidates:   BulkLandingCandidate[],
  availability: ExperienceAvailability[],
): BulkLandingValidation {
  const eligible: BulkLandingCandidate[] = [];
  const skipped:  BulkSkippedItem[] = [];

  for (const c of candidates) {
    const avail = availability.find(a => a.productId === c.productId);
    const readiness = avail?.readiness ?? c.readiness;

    if (readiness === "READY" || readiness === "PARTIAL") {
      eligible.push({ ...c, readiness });
    } else if (readiness === "MISSING_ASSETS") {
      skipped.push({
        productId:   c.productId,
        productName: c.productName,
        reason:      "Faltan recursos en Biblioteca",
      });
    } else {
      skipped.push({
        productId:   c.productId,
        productName: c.productName,
        reason:      "Sin recursos multimedia",
      });
    }
  }

  return { eligible, skipped };
}

// ── Bulk generation ──────────────────────────────────────────────────────────

/**
 * Creates landing drafts for multiple products in a single batch.
 *
 * Steps per product:
 *   1. Build generation input with photo/video refs.
 *   2. Call generateLandingDraft() (pure, no side effects).
 *   3. Persist via createLandingDraft() (checks for duplicates).
 *   4. Collect results.
 *
 * Does NOT publish to Shopify.
 */
export async function createBulkLandingDrafts(
  orgId:           string,
  candidates:      BulkLandingCandidate[],
  templateId:      string,
  generationRules: GenerationRules,
  tenantPreset:    string | null,
): Promise<BulkGenerationResult> {
  const createdDrafts: LandingDraft[] = [];
  const skippedItems:  BulkSkippedItem[] = [];
  const failedItems:   BulkFailedItem[] = [];

  for (const candidate of candidates) {
    // Only process READY or PARTIAL
    if (candidate.readiness !== "READY" && candidate.readiness !== "PARTIAL") {
      skippedItems.push({
        productId:   candidate.productId,
        productName: candidate.productName,
        reason:      candidate.readiness === "MISSING_ASSETS"
          ? "Faltan recursos en Biblioteca"
          : "Sin recursos multimedia",
      });
      continue;
    }

    // Build photo/video refs
    const photoUrls = Array.from(
      { length: candidate.photoCount },
      (_, i) => `biblioteca://${candidate.productId}/foto/${i}`,
    );
    const videoUrl = candidate.videoCount > 0
      ? `biblioteca://${candidate.productId}/video/0`
      : null;

    const input: LandingDraftGenerationInput = {
      productId:       candidate.productId,
      productName:     candidate.productName,
      sku:             candidate.sku,
      price:           candidate.precio,
      collection:      candidate.coleccion,
      shopifyUrl:      candidate.shopifyUrl,
      templateId,
      photoUrls,
      videoUrl,
      bannerUrl:       null,
      generationRules,
      tenantPreset,
      orgId,
      createdBy:       "usuario",
    };

    // Generate
    const result = generateLandingDraft(input);
    if (!result.ok || !result.draft) {
      failedItems.push({
        productId:   candidate.productId,
        productName: candidate.productName,
        error:       result.error ?? "Error al generar borrador.",
      });
      continue;
    }

    // Persist (createLandingDraft handles duplicate detection)
    try {
      const saved = await createLandingDraft(orgId, result.draft);
      createdDrafts.push(saved);
    } catch (err) {
      failedItems.push({
        productId:   candidate.productId,
        productName: candidate.productName,
        error:       err instanceof Error ? err.message : "Error al guardar borrador.",
      });
    }
  }

  const summary: BulkGenerationSummary = {
    requested: candidates.length,
    created:   createdDrafts.length,
    skipped:   skippedItems.length,
    failed:    failedItems.length,
  };

  return {
    ok: failedItems.length === 0,
    summary,
    createdDrafts,
    skippedItems,
    failedItems,
  };
}

/**
 * Summarizes a bulk generation result for display.
 */
export function summarizeBulkGeneration(result: BulkGenerationResult): string {
  const { summary } = result;
  const parts: string[] = [];
  if (summary.created > 0) parts.push(`${summary.created} borrador${summary.created !== 1 ? "es" : ""} creado${summary.created !== 1 ? "s" : ""}`);
  if (summary.skipped > 0) parts.push(`${summary.skipped} omitido${summary.skipped !== 1 ? "s" : ""}`);
  if (summary.failed  > 0) parts.push(`${summary.failed} con error`);
  return parts.join(" · ") || "Sin resultados";
}
