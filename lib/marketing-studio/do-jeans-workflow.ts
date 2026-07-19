/**
 * lib/marketing-studio/do-jeans-workflow.ts
 *
 * Do Jeans shopify_listing workflow plan — strict fidelity, ecommerce studio.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────
 *
 *   Tenant:    do-jeans
 *   Objective: shopify_listing
 *   Fidelity:  strict (always — Do Jeans config overrides session-level)
 *   Assets:    front_clean + back_clean (+ product_draft if back image present)
 *
 * ── Asset plan ────────────────────────────────────────────────────────────────
 *
 *   front_clean  — studio_clean_white preset, front angle, strict fidelity.
 *                  PRESERVE EXACTLY directive applied to all detail locks.
 *   back_clean   — same preset, back angle. Only created when backImageUrl is
 *                  provided by the operator; otherwise omitted from the plan.
 *   product_draft — Shopify draft package descriptor (no generation required —
 *                   built by shopify-draft-builder.ts).
 *
 * ── Prompt strategy ───────────────────────────────────────────────────────────
 *
 *   Both visual assets share the same garment description but differ in the
 *   angle instruction appended at the end. The buildFidelityDirective() output
 *   is included verbatim as a hard constraint for the generation provider.
 */

import type { GarmentFingerprint, PhotoPreset, GarmentDetailLocks } from "./types";
import type { ProductUpload, MinimumInputFields, OutputAssetType, ResolvedWorkflow } from "./guided-flow";
import { describeJeansDetailLocks, buildFidelityDirective } from "./detail-locks";
import { extractDetailLocks } from "./do-jeans-intake";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DO_JEANS_PRESET_ID = "studio_clean_white";

/**
 * The fixed workflow plan for Do Jeans strict shopify_listing.
 * back_clean is ALWAYS in the plan — the asset row is created regardless of
 * whether a back image was supplied; the executor skips generation when
 * sourceImageUrl is absent.
 */
export const DO_JEANS_SHOPIFY_WORKFLOW: Readonly<ResolvedWorkflow> = {
  presetId:           DO_JEANS_PRESET_ID,
  assets:             ["front_clean", "back_clean", "product_draft"] as OutputAssetType[],
  createProductDraft: true,
  publishToLuca:      false,
  includeVideo:       false,
} as const;

// ── Workflow resolver ─────────────────────────────────────────────────────────

/**
 * Returns the Do Jeans shopify_listing workflow plan.
 * Provides the same interface as resolveWorkflow() for drop-in use in the execute route.
 */
export function resolveDoJeansWorkflow(): Readonly<ResolvedWorkflow> {
  return DO_JEANS_SHOPIFY_WORKFLOW;
}

// ── Per-asset prompt builders ─────────────────────────────────────────────────

interface DoJeansAssetPrompt {
  assetType:       OutputAssetType;
  prompt?:         string;   // visual assets only
  sourceImageUrl?: string;   // reference image passed to img2img provider
  angle?:          "front" | "back";
}

/**
 * Builds per-asset generation specs for the Do Jeans strict shopify_listing path.
 *
 * Combines:
 *   • Garment fingerprint attributes (category, colors, fit)
 *   • Jeans detail lock description (pocket, stitching, wash, rise)
 *   • Preset AI prompt hint (background, lighting, style)
 *   • Strict fidelity directive (PRESERVE EXACTLY…)
 *   • Angle instruction (front vs back)
 */
export function buildDoJeansAssetPrompts(
  product:     Partial<ProductUpload>,
  inputs:      Partial<MinimumInputFields>,
  fingerprint: GarmentFingerprint,
  preset:      PhotoPreset,
): DoJeansAssetPrompt[] {
  const locks:   GarmentDetailLocks = extractDetailLocks(inputs);
  const lockDesc = describeJeansDetailLocks(locks);
  const fidelityDirective = buildFidelityDirective(locks);

  const { colors = [], category = "jeans" } = fingerprint.attributes;
  const colorStr = colors.join(", ") || "unspecified color";

  const baseDesc =
    `Product photography of ${colorStr} ${category}` +
    (lockDesc ? `, ${lockDesc}` : "") +
    ". " +
    (preset.aiPromptHint ? preset.aiPromptHint + ". " : "") +
    "White studio background, even softbox lighting, full body shot, model standing straight, professional e-commerce quality. " +
    (fidelityDirective ? fidelityDirective + " " : "");

  const prompts: DoJeansAssetPrompt[] = [
    {
      assetType:       "front_clean",
      prompt:          baseDesc + "CAMERA: front view, straight-on angle.",
      sourceImageUrl:  product.imageUrl?.trim() || undefined,
      angle:           "front",
    },
    {
      assetType:       "back_clean",
      prompt:          baseDesc + "CAMERA: back view, straight-on angle.",
      sourceImageUrl:  product.backImageUrl?.trim() || undefined,
      angle:           "back",
    },
    {
      assetType: "product_draft",
      // No prompt — product_draft is assembled by the builder, not the generator
    },
  ];

  return prompts;
}
