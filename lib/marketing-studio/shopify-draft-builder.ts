/**
 * lib/marketing-studio/shopify-draft-builder.ts
 *
 * Builds a Shopify-ready product draft package from Do Jeans strict intake data.
 *
 * ── What this builds ──────────────────────────────────────────────────────────
 *
 *   ShopifyDraftPackage — a self-contained JSON record that maps 1:1 to the
 *   fields required by the Shopify Products REST API / GraphQL productCreate.
 *
 *   It includes:
 *     title         — from MinimumInputFields.title
 *     productType   — "Jeans"
 *     vendor        — "Do Jeans"
 *     tags          — derived from attributes + detail locks
 *     bodyHtml      — auto-generated product description
 *     variants      — placeholder with price + SKU (no sizes yet)
 *     imageSlots    — maps front_clean / back_clean asset IDs to positions
 *
 * ── What this does NOT do ────────────────────────────────────────────────────
 *
 *   - No HTTP calls (no Shopify API)
 *   - No real image URLs (those come back from the generation provider)
 *   - No size/inventory management (future sprint)
 */

import type { ShopifyDraftPackage }                     from "./guided-flow";
import type { MinimumInputFields, ProductUpload }       from "./guided-flow";
import { extractDetailLocks }                           from "./do-jeans-intake";
import { describeJeansDetailLocks }                     from "./detail-locks";

// ── Tag builder ───────────────────────────────────────────────────────────────

function buildShopifyTags(
  inputs:     Partial<MinimumInputFields>,
  sku?:       string,
): string[] {
  const tags: string[] = ["jeans", "denim", "do-jeans"];

  // Colors
  for (const color of inputs.colors ?? []) {
    tags.push(color.toLowerCase().trim());
  }

  // Detail locks
  const locks = extractDetailLocks(inputs);
  if (locks.wash)     tags.push(locks.wash);
  if (locks.rise)     tags.push(locks.rise);
  if (locks.pocket && locks.pocket !== "no-pocket") tags.push(locks.pocket);
  if (locks.stitching && locks.stitching !== "none") tags.push(`stitching-${locks.stitching}`);
  for (const emb of locks.embellishments ?? []) {
    if (emb !== "none") tags.push(emb);
  }

  // SKU tag
  if (sku?.trim()) tags.push(`sku-${sku.trim()}`);

  return [...new Set(tags)]; // deduplicate
}

// ── Body HTML builder ─────────────────────────────────────────────────────────

function buildBodyHtml(
  title:  string,
  inputs: Partial<MinimumInputFields>,
): string {
  const locks    = extractDetailLocks(inputs);
  const lockDesc = describeJeansDetailLocks(locks);
  const colors   = (inputs.colors ?? []).join(", ");

  const lines: string[] = [
    `<p><strong>${title}</strong></p>`,
    `<p>Color: ${colors || "—"}</p>`,
  ];

  if (lockDesc) {
    lines.push(`<p>Detalles: ${lockDesc}</p>`);
  }

  lines.push(
    "<p>Denim colombiano de alta calidad. " +
    "Fabricado en Colombia con los mejores materiales.</p>",
  );

  return lines.join("\n");
}

// ── Main builder ──────────────────────────────────────────────────────────────

export interface BuildShopifyDraftOptions {
  product:        Partial<ProductUpload>;
  inputs:         Partial<MinimumInputFields>;
  /** GeneratedAsset IDs in order: [frontAssetId, backAssetId] */
  frontAssetId:   string;
  backAssetId:    string;
}

/**
 * Assembles a ShopifyDraftPackage from Do Jeans strict intake data.
 * The result is stored in session.publishResultJson.shopifyDraft.
 *
 * Image URLs are NOT included here — they will be filled in by the
 * generation provider callback when assets become READY.
 */
export function buildShopifyDraft(
  opts: BuildShopifyDraftOptions,
): ShopifyDraftPackage {
  const { product, inputs, frontAssetId, backAssetId } = opts;

  const title   = inputs.title?.trim() ?? "Jean Do Jeans";
  const price   = inputs.price ?? 0;
  const sku     = product.sku?.trim() || undefined;

  return {
    title,
    productType: "Jeans",
    vendor:      "Do Jeans",
    tags:        buildShopifyTags(inputs, sku),
    bodyHtml:    buildBodyHtml(title, inputs),

    variants: [
      {
        price:  price.toFixed(2),
        sku,
        option1: "One Size",  // size variants added in a future sprint
      },
    ],

    imageSlots: [
      {
        assetId:   frontAssetId,
        assetType: "front_clean",
        position:  1,
      },
      {
        assetId:   backAssetId,
        assetType: "back_clean",
        position:  2,
      },
    ],
  };
}
