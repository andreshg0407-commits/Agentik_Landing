/**
 * lib/marketing-studio/do-jeans-intake.ts
 *
 * Strict intake validation for the Do Jeans shopify_listing happy path.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────
 *
 *   Tenant:     do-jeans
 *   Objective:  shopify_listing
 *   Fidelity:   strict (always)
 *
 *   This module validates that all required fields are present BEFORE the
 *   execute route builds the execution payload.  It is called from:
 *     - The wizard (client-side gate on "generate preview" button)
 *     - The execute API route (server-side guard)
 *
 * ── Required fields ───────────────────────────────────────────────────────────
 *
 *   Product upload:
 *     frontImageUrl  — required (primary reference image)
 *     backImageUrl   — optional (generates back_clean asset when present)
 *
 *   Minimum fields:
 *     title          — required (Shopify product title)
 *     price          — required (Shopify variant price)
 *     colors         — required (at least one)
 *     category       — must be "jeans"
 *
 *   Detail locks (strict mode — all required):
 *     detailPocket
 *     detailWash
 *     detailStitching
 *     detailRise
 *     detailEmbellishments  — at least one value (including "none")
 */

import type { GarmentDetailLocks, ValidationResult }          from "./types";
import type { ProductUpload, MinimumInputFields }             from "./guided-flow";
import { validateJeansDetailLocks }                           from "./detail-locks";

// ── Reconstruct GarmentDetailLocks from flat MinimumInputFields ───────────────

/**
 * Converts the flat wizard form fields back into a GarmentDetailLocks object
 * so the existing validateJeansDetailLocks() validator can consume them.
 */
export function extractDetailLocks(inputs: Partial<MinimumInputFields>): GarmentDetailLocks {
  return {
    pocket:              inputs.detailPocket              ?? undefined,
    wash:                inputs.detailWash                ?? undefined,
    stitching:           inputs.detailStitching           ?? undefined,
    rise:                inputs.detailRise                ?? undefined,
    embellishments:      inputs.detailEmbellishments
      ? inputs.detailEmbellishments.split(",").map(s => s.trim()).filter(Boolean)
      : undefined,
    hardwareType:        inputs.detailHardwareType        ?? undefined,
    hardwareFinish:      inputs.detailHardwareFinish      ?? undefined,
    hardwareDetail:      inputs.detailHardwareDetail      ?? undefined,
    embellishmentDetail: inputs.detailEmbellishmentDetail ?? undefined,
    washDetail:          inputs.detailWashDetail          ?? undefined,
  };
}

// ── Main validator ────────────────────────────────────────────────────────────

/**
 * Validates a Do Jeans strict intake before execution.
 *
 * Returns { valid: true, errors: [] } when all requirements are met.
 * Returns { valid: false, errors: [...] } with human-readable messages otherwise.
 */
export function validateDoJeansStrictIntake(
  product: Partial<ProductUpload>,
  inputs:  Partial<MinimumInputFields>,
): ValidationResult {
  const errors: string[] = [];

  // ── Product ───────────────────────────────────────────────────────────────
  if (!product.imageUrl?.trim()) {
    errors.push("Imagen frontal es requerida (imageUrl)");
  }
  // backImageUrl is optional — no error when absent

  // ── Category ──────────────────────────────────────────────────────────────
  if (inputs.category !== "jeans") {
    errors.push(`Categoría debe ser "jeans" para el flujo Do Jeans (recibido: "${inputs.category ?? "—"}")`);
  }

  // ── Title + price (Shopify listing requirements) ──────────────────────────
  if (!inputs.title?.trim()) {
    errors.push("Título del producto es requerido para Shopify listing");
  }
  if (inputs.price === undefined || inputs.price === null || inputs.price <= 0) {
    errors.push("Precio debe ser mayor a 0 para Shopify listing");
  }

  // ── Colors ────────────────────────────────────────────────────────────────
  if (!inputs.colors || inputs.colors.length === 0) {
    errors.push("Al menos un color es requerido");
  }

  // ── Detail locks (strict jeans) ───────────────────────────────────────────
  const locks       = extractDetailLocks(inputs);
  const locksResult = validateJeansDetailLocks(locks, "strict");
  errors.push(...locksResult.errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Returns true when the wizard form satisfies Do Jeans strict requirements.
 * Lightweight version for the wizard's "can advance" gate (no error messages).
 */
export function canAdvanceDoJeansStrict(
  product: Partial<ProductUpload>,
  inputs:  Partial<MinimumInputFields>,
): boolean {
  return validateDoJeansStrictIntake(product, inputs).valid;
}
