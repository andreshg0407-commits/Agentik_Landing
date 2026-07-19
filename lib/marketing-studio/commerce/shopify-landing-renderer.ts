/**
 * lib/marketing-studio/commerce/shopify-landing-renderer.ts
 *
 * SHOPIFY-EXPERIENCIAS-04 — Landing HTML Renderer
 *
 * Transforms LandingDraftBlock[] into clean, semantic HTML
 * compatible with Shopify pages.
 *
 * Pure function — no side effects, no API calls, no persistence.
 *
 * Output uses reusable CSS classes (agk-landing-*) so Shopify
 * themes can style them. Inline styles are minimal and structural only.
 */

import type { LandingDraftBlock, LandingBlockContent } from "./shopify-landing-draft-types";

// ── Escape helper ────────────────────────────────────────────────────────────

function esc(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Block renderers ──────────────────────────────────────────────────────────

function renderHero(c: LandingBlockContent): string {
  const parts: string[] = [];
  parts.push(`<section class="agk-landing-hero">`);
  if (c.imageUrl) {
    parts.push(`  <div class="agk-landing-hero__image"><img src="${esc(c.imageUrl)}" alt="${esc(c.title)}" loading="lazy" /></div>`);
  }
  parts.push(`  <div class="agk-landing-hero__content">`);
  if (c.title) parts.push(`    <h1 class="agk-landing-hero__title">${esc(c.title)}</h1>`);
  if (c.subtitle) parts.push(`    <p class="agk-landing-hero__subtitle">${esc(c.subtitle)}</p>`);
  if (c.price) parts.push(`    <p class="agk-landing-hero__price">${esc(c.price)}</p>`);
  parts.push(`  </div>`);
  parts.push(`</section>`);
  return parts.join("\n");
}

function renderGallery(c: LandingBlockContent): string {
  const urls = c.imageUrls ?? [];
  if (urls.length === 0) return "";
  const parts: string[] = [];
  parts.push(`<section class="agk-landing-gallery">`);
  if (c.title) parts.push(`  <h2 class="agk-landing-gallery__title">${esc(c.title)}</h2>`);
  parts.push(`  <div class="agk-landing-gallery__grid">`);
  for (const url of urls) {
    parts.push(`    <img src="${esc(url)}" alt="" class="agk-landing-gallery__img" loading="lazy" />`);
  }
  parts.push(`  </div>`);
  parts.push(`</section>`);
  return parts.join("\n");
}

function renderVideo(c: LandingBlockContent): string {
  if (!c.videoUrl) return "";
  const parts: string[] = [];
  parts.push(`<section class="agk-landing-video">`);
  if (c.title) parts.push(`  <h2 class="agk-landing-video__title">${esc(c.title)}</h2>`);
  parts.push(`  <div class="agk-landing-video__player">`);
  parts.push(`    <video src="${esc(c.videoUrl)}" controls preload="metadata"></video>`);
  parts.push(`  </div>`);
  parts.push(`</section>`);
  return parts.join("\n");
}

function renderBenefits(c: LandingBlockContent): string {
  const items = c.items ?? [];
  if (items.length === 0) return "";
  const parts: string[] = [];
  parts.push(`<section class="agk-landing-benefits">`);
  if (c.title) parts.push(`  <h2 class="agk-landing-benefits__title">${esc(c.title)}</h2>`);
  parts.push(`  <ul class="agk-landing-benefits__list">`);
  for (const item of items) {
    parts.push(`    <li>${esc(item)}</li>`);
  }
  parts.push(`  </ul>`);
  parts.push(`</section>`);
  return parts.join("\n");
}

function renderProductDetails(c: LandingBlockContent): string {
  const parts: string[] = [];
  parts.push(`<section class="agk-landing-details">`);
  if (c.title) parts.push(`  <h2 class="agk-landing-details__title">${esc(c.title)}</h2>`);
  parts.push(`  <div class="agk-landing-details__meta">`);
  if (c.sku) parts.push(`    <p class="agk-landing-details__sku">SKU: ${esc(c.sku)}</p>`);
  if (c.price) parts.push(`    <p class="agk-landing-details__price">${esc(c.price)}</p>`);
  if (c.collection) parts.push(`    <p class="agk-landing-details__collection">${esc(c.collection)}</p>`);
  if (c.description) parts.push(`    <p class="agk-landing-details__description">${esc(c.description)}</p>`);
  parts.push(`  </div>`);
  parts.push(`</section>`);
  return parts.join("\n");
}

function renderTrust(c: LandingBlockContent): string {
  const items = c.items ?? [];
  if (items.length === 0) return "";
  const parts: string[] = [];
  parts.push(`<section class="agk-landing-trust">`);
  if (c.title) parts.push(`  <h2 class="agk-landing-trust__title">${esc(c.title)}</h2>`);
  parts.push(`  <ul class="agk-landing-trust__list">`);
  for (const item of items) {
    parts.push(`    <li>${esc(item)}</li>`);
  }
  parts.push(`  </ul>`);
  parts.push(`</section>`);
  return parts.join("\n");
}

function renderCta(c: LandingBlockContent): string {
  const parts: string[] = [];
  parts.push(`<section class="agk-landing-cta">`);
  if (c.title) parts.push(`  <h2 class="agk-landing-cta__title">${esc(c.title)}</h2>`);
  if (c.ctaUrl && c.ctaLabel) {
    parts.push(`  <a href="${esc(c.ctaUrl)}" class="agk-landing-cta__button">${esc(c.ctaLabel)}</a>`);
  } else if (c.ctaLabel) {
    parts.push(`  <span class="agk-landing-cta__button">${esc(c.ctaLabel)}</span>`);
  }
  if (c.price) parts.push(`  <p class="agk-landing-cta__price">${esc(c.price)}</p>`);
  parts.push(`</section>`);
  return parts.join("\n");
}

function renderRelatedProducts(c: LandingBlockContent): string {
  const parts: string[] = [];
  parts.push(`<section class="agk-landing-related">`);
  if (c.title) parts.push(`  <h2 class="agk-landing-related__title">${esc(c.title)}</h2>`);
  parts.push(`  <div class="agk-landing-related__grid"></div>`);
  parts.push(`</section>`);
  return parts.join("\n");
}

// ── Block type → renderer ────────────────────────────────────────────────────

const RENDERERS: Record<string, (c: LandingBlockContent) => string> = {
  hero:             renderHero,
  gallery:          renderGallery,
  video:            renderVideo,
  benefits:         renderBenefits,
  product_details:  renderProductDetails,
  related_products: renderRelatedProducts,
  trust:            renderTrust,
  cta:              renderCta,
};

// ── Main renderer ────────────────────────────────────────────────────────────

/**
 * Renders an array of landing draft blocks into a single HTML string
 * ready for Shopify page body_html.
 *
 * Only renders visible blocks. Orders by block.order.
 * Returns empty string if no visible blocks.
 */
export function renderLandingBlocksToHtml(
  blocks: LandingDraftBlock[],
  productName?: string,
): string {
  const visible = blocks
    .filter(b => b.visible)
    .sort((a, b) => a.order - b.order);

  if (visible.length === 0) return "";

  const sections = visible
    .map(block => {
      const render = RENDERERS[block.type];
      return render ? render(block.content) : "";
    })
    .filter(Boolean);

  const title = productName ? `<!-- Landing: ${esc(productName)} -->\n` : "";

  return `${title}<div class="agk-landing">\n${sections.join("\n\n")}\n</div>`;
}
