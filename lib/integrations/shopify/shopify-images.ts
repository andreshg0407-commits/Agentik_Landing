/**
 * lib/integrations/shopify/shopify-images.ts
 *
 * MS-11 — Shopify Image Publication Pipeline
 *
 * Validates and builds image payloads for the Shopify Admin API.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Pure computation for build/validate.
 *   publishProductImages() calls the Shopify API.
 *   No images → publication is blocked (hard rule).
 */

import type { ShopifyAdminImageDraft } from "./shopify-types";

// ── Supported formats ─────────────────────────────────────────────────────────

const VALID_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"] as const;
const MAX_IMAGE_SIZE_BYTES    = 20 * 1024 * 1024; // 20 MB Shopify limit
const MAX_IMAGES_PER_PRODUCT  = 20;               // Shopify hard limit

// ── Validation ────────────────────────────────────────────────────────────────

export interface ImageValidationResult {
  url:     string;
  valid:   boolean;
  reason?: string;
}

export function validateShopifyImageSource(url: string): ImageValidationResult {
  if (!url) {
    return { url, valid: false, reason: "URL is empty" };
  }

  // Must be HTTPS
  if (!url.startsWith("https://")) {
    return { url, valid: false, reason: "Image URL must use HTTPS" };
  }

  // Must have a valid extension or known CDN pattern
  const lower = url.toLowerCase().split("?")[0];  // strip query params before checking ext
  const hasValidExtension = VALID_IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
  // Also accept Vercel Blob, Cloudinary, S3, and similar CDNs that may not have extensions
  const isKnownCdn = (
    url.includes(".vercel-storage.com") ||
    url.includes(".cloudinary.com") ||
    url.includes(".amazonaws.com") ||
    url.includes(".googleusercontent.com") ||
    url.includes(".supabase.co") ||
    url.includes(".r2.dev")
  );

  if (!hasValidExtension && !isKnownCdn) {
    return {
      url,
      valid:  false,
      reason: `Unsupported image format. Use: ${VALID_IMAGE_EXTENSIONS.join(", ")}`,
    };
  }

  return { url, valid: true };
}

// ── Payload builder ───────────────────────────────────────────────────────────

export function buildShopifyImagePayload(
  imageUrls: string[],
  productName: string,
): ShopifyAdminImageDraft[] {
  return imageUrls
    .slice(0, MAX_IMAGES_PER_PRODUCT)
    .map((src, i) => ({
      src,
      alt:      `${productName}${i > 0 ? ` ${i + 1}` : ""}`,
      position: i + 1,
    }));
}

// ── Readiness check ───────────────────────────────────────────────────────────

export interface ImageReadinessResult {
  isReady:        boolean;
  validImages:    string[];
  invalidImages:  ImageValidationResult[];
  blockerReason?: string;
}

export function checkImageReadiness(imageUrls: string[]): ImageReadinessResult {
  if (imageUrls.length === 0) {
    return {
      isReady:       false,
      validImages:   [],
      invalidImages: [],
      blockerReason: "No images available — at least one product image is required for Shopify publication",
    };
  }

  const results = imageUrls.map(url => validateShopifyImageSource(url));
  const valid   = results.filter(r => r.valid).map(r => r.url);
  const invalid = results.filter(r => !r.valid);

  if (valid.length === 0) {
    return {
      isReady:       false,
      validImages:   [],
      invalidImages: invalid,
      blockerReason: "No valid image URLs — all images failed validation",
    };
  }

  return {
    isReady:       true,
    validImages:   valid,
    invalidImages: invalid,
  };
}

// ── Image metadata (for after Shopify creates the product) ────────────────────

export interface ShopifyImageResult {
  shopifyImageId: number;
  src:            string;
  position:       number;
}

export function mapShopifyImageResponse(raw: {
  id:       number;
  src:      string;
  position: number;
}[]): ShopifyImageResult[] {
  return raw.map(img => ({
    shopifyImageId: img.id,
    src:            img.src,
    position:       img.position,
  }));
}
