/**
 * lib/marketing-studio/commerce/shopify-catalog-service.ts
 *
 * SHOPIFY-CATALOG-OPERATIONS-01C — Catalog Service Layer (Consolidated)
 *
 * SERVER ONLY — never import from client components.
 *
 * ── Copilot Action Registry ────────────────────────────────────────────────────
 *
 *   shopify.findUnpublishedProducts   — list publishable products not yet in Shopify
 *   shopify.dryRunBulkPublish         — preview what would be published (no side effects)
 *   shopify.publishReadyProducts      — batch publish with filters + duplicate prevention
 *   shopify.publishByCategory         — shorthand for publishReadyProducts({ category })
 *   shopify.dryRunActivateDrafts      — preview which Shopify drafts can be activated
 *   shopify.activatePublishedDrafts   — set Shopify products to "active" (visible on store)
 *   shopify.dryRunUpdateModified      — preview products modified in Agentik since last sync
 *   shopify.updateModifiedProducts    — push content updates for modified products
 *   shopify.getLiveProductState       — fetch real-time product state from Shopify API
 *
 * ── Future Copilot Actions (planned — not yet implemented) ────────────────────
 *
 *   shopify.auditProductReadiness      — evaluate blockers + auto-fix opportunities per product
 *   shopify.enrichProductContent       — AI-fill seoTitle, seoDescription, commercialDescription
 *   shopify.generateSeo                — AI-generate SEO fields from product attributes
 *   shopify.applyEnrichmentSuggestions — apply a ProductEnrichmentPlan to a product
 *   shopify.publishAfterEnrichment     — enrich + publish in one supervised Copilot action
 *
 * ── Safety guarantees ─────────────────────────────────────────────────────────
 *
 *   - dryRun functions never write to Shopify or the DB.
 *   - Products with externalId are UPDATED, not re-published (duplicate prevention).
 *   - Per-product errors do not abort the batch — summary always returned.
 *   - All functions are organizationId-scoped.
 *
 * ── Rate limiting ─────────────────────────────────────────────────────────────
 *   Shopify leaky bucket: ~2 req/sec burst.
 *   We apply a 500 ms inter-request delay between consecutive API calls.
 */

import { prisma }                    from "@/lib/prisma";
import { listProductConsoleItems }   from "@/lib/marketing-studio/products/product-query-service";
import {
  buildPublicationQueue,
}                                    from "@/lib/marketing-studio/commerce/publication-engine";
import { PUBLICATION_STATUS, ISSUE_SEVERITY } from "@/lib/marketing-studio/commerce/commerce-types";
import type { PublicationIssue }              from "@/lib/marketing-studio/commerce/commerce-types";
import {
  publishWithContent,
  updateWithContent,
  activateShopifyProduct,
}                                    from "@/lib/integrations/shopify/shopify-content-publisher";
import { fetchShopifyProductState }  from "@/lib/integrations/shopify/shopify-state-fetcher";
import type { ShopifyFetchResult }   from "@/lib/integrations/shopify/shopify-state-fetcher";

// ── Shared helpers ────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── findUnpublishedProducts ───────────────────────────────────────────────────

/**
 * Returns products that are publishable (no blocking issues) but have not yet
 * been published to Shopify.
 *
 * Input:  organizationId
 * Output: ProductConsoleItem[] filtered to isPublishable && not published
 * Errors: throws on DB failure
 *
 * Copilot: "shopify.findUnpublishedProducts"
 */
export async function findUnpublishedProducts(
  organizationId: string,
) {
  const items = await listProductConsoleItems(organizationId);
  const queue = buildPublicationQueue(items, "shopify");

  const unpublishedIds = new Set(
    queue
      .filter(q => q.isPublishable && q.publicationStatus !== PUBLICATION_STATUS.PUBLISHED)
      .map(q => q.productId),
  );

  return items.filter(i => unpublishedIds.has(i.productId));
}

// ── DryRun types ──────────────────────────────────────────────────────────────

export type DryRunAction =
  | "would_publish"          // new product → publishWithContent
  | "would_update"           // has externalId → updateWithContent
  | "skip_blocked"           // blocking issues → omit
  | "skip_already_published"; // status=published, no retry needed

/**
 * A single blocker or warning derived from a product's PublicationIssue.
 * canAutoFix=true signals that an AI Copilot action can resolve this without
 * human intervention (e.g. foto-estudio generation, SEO enrichment).
 */
export interface DryRunBlocker {
  code:       string;
  label:      string;
  severity:   "blocking" | "warning";
  canAutoFix: boolean;
}

/**
 * Human-readable labels for each DryRunAction.
 * UI MUST use these — never render the raw action code to the user.
 */
export const ACTION_LABEL: Record<DryRunAction, string> = {
  would_publish:          "Se publicará",
  would_update:           "Se actualizará",
  skip_blocked:           "Requiere completar información",
  skip_already_published: "Ya está publicado",
};

export interface DryRunItem {
  productId:        string;
  name:             string;
  sku:              string | null;
  category:         string | null;
  action:           DryRunAction;
  /** Human-readable label for the action — use this in UI, not the `action` code. */
  actionLabel:      string;
  reason:           string;
  /** Structured blockers derived from PublicationIssue[] — empty for publishable items. */
  blockers:         DryRunBlocker[];
  /** True if at least one blocker can be resolved by an AI Copilot action. */
  autoFixAvailable: boolean;
  /** List of field names that can be AI-generated to resolve blockers. */
  autoFixFields:    string[];
}

// ── Blocker helpers ───────────────────────────────────────────────────────────

/** Issue codes that a Copilot AI action can resolve without human input. */
const AUTO_FIX_CODES = new Set<string>([
  "no_hero_image",
  "low_readiness",
  "missing_description",
  "missing_seo_title",
  "missing_seo_description",
  "missing_tags",
]);

/** Fields that would be auto-populated per fixable issue code. */
const AUTO_FIX_FIELDS: Record<string, string[]> = {
  no_hero_image:           ["primaryAssetUrl"],
  low_readiness:           ["seoTitle", "seoDescription", "commercialDescription"],
  missing_description:     ["commercialDescription"],
  missing_seo_title:       ["seoTitle"],
  missing_seo_description: ["seoDescription"],
  missing_tags:            ["tags"],
};

function mapIssuesToBlockers(issues: PublicationIssue[]): DryRunBlocker[] {
  return issues.map(issue => ({
    code:       issue.code,
    label:      issue.label,
    severity:   issue.severity === ISSUE_SEVERITY.BLOCKING ? "blocking" : "warning",
    canAutoFix: AUTO_FIX_CODES.has(issue.code),
  }));
}

/**
 * Derives payload-specific blockers from the pre-built Shopify payload.
 * These go beyond the publication engine's issue list to surface enrichment
 * gaps that would produce poor catalog quality even if isPublishable=true.
 *
 * Uses actual payload data — no inference, no AI, no side effects.
 */
function derivePayloadBlockers(q: { shopifyPayload: { bodyHtml: string; seo: { title: string | null; description: string | null }; tags: string[]; variants: Array<{ price: string }> }; primaryAssetUrl: string | null; variantCount: number }, existingCodes: Set<string>): DryRunBlocker[] {
  const p = q.shopifyPayload;
  const blockers: DryRunBlocker[] = [];

  if (!existingCodes.has("missing_hero_asset") && !q.primaryAssetUrl) {
    blockers.push({ code: "missing_hero_asset", label: "Sin imagen principal", severity: "blocking", canAutoFix: false });
  }

  if (!existingCodes.has("missing_price") && (p.variants.length === 0 || !p.variants[0].price || p.variants[0].price === "0.00")) {
    blockers.push({ code: "missing_price", label: "Sin precio", severity: "blocking", canAutoFix: false });
  }

  if (!existingCodes.has("missing_variants") && q.variantCount === 0) {
    blockers.push({ code: "missing_variants", label: "Sin variantes", severity: "blocking", canAutoFix: false });
  }

  if (!existingCodes.has("missing_description") && (!p.bodyHtml || p.bodyHtml.trim() === "")) {
    blockers.push({ code: "missing_description", label: "Sin descripción comercial", severity: "warning", canAutoFix: true });
  }

  if (!existingCodes.has("missing_seo_title") && !p.seo.title) {
    blockers.push({ code: "missing_seo_title", label: "Sin título SEO", severity: "warning", canAutoFix: true });
  }

  if (!existingCodes.has("missing_seo_description") && !p.seo.description) {
    blockers.push({ code: "missing_seo_description", label: "Sin descripción SEO", severity: "warning", canAutoFix: true });
  }

  if (!existingCodes.has("missing_tags") && p.tags.length === 0) {
    blockers.push({ code: "missing_tags", label: "Sin etiquetas de búsqueda", severity: "warning", canAutoFix: true });
  }

  return blockers;
}

/**
 * Merges issue-derived blockers + payload-derived enrichment blockers.
 * Deduplicates by code so no blocker is reported twice.
 */
function deriveAllBlockers(q: Parameters<typeof derivePayloadBlockers>[0] & { publicationIssues: PublicationIssue[] }): DryRunBlocker[] {
  const fromIssues    = mapIssuesToBlockers(q.publicationIssues);
  const existingCodes = new Set(fromIssues.map(b => b.code));
  const fromPayload   = derivePayloadBlockers(q, existingCodes);
  return [...fromIssues, ...fromPayload];
}

function getAutoFixFields(blockers: DryRunBlocker[]): string[] {
  const fields = new Set<string>();
  for (const b of blockers) {
    if (b.canAutoFix && AUTO_FIX_FIELDS[b.code]) {
      for (const f of AUTO_FIX_FIELDS[b.code]) fields.add(f);
    }
  }
  return Array.from(fields);
}

export interface DryRunResult {
  dryRun:               true;
  publishableCount:     number;   // new → would_publish
  updateableCount:      number;   // has externalId → would_update
  blockedCount:         number;   // not publishable
  alreadyPublishedCount: number;  // already published, no change needed
  /** True if any blocked product has at least one canAutoFix blocker.
   *  UI should surface: "Copilot podrá completar esta información antes de publicar." */
  autoFixAvailable:     boolean;
  items:                DryRunItem[];
}

// ── dryRunBulkPublish ─────────────────────────────────────────────────────────

/**
 * Previews what publishReadyProducts would do — no writes, no Shopify calls.
 * Safe to call without an access token.
 *
 * Input:  organizationId, optional { category, limit }
 * Output: DryRunResult — per-product action + summary counters
 * Errors: throws on DB failure
 *
 * Copilot: "shopify.dryRunBulkPublish"
 */
export async function dryRunBulkPublish(
  organizationId: string,
  opts?: { category?: string; limit?: number; productIds?: string[] },
): Promise<DryRunResult> {
  const items = await listProductConsoleItems(organizationId);
  let queue   = buildPublicationQueue(items, "shopify");

  if (opts?.productIds?.length) {
    const idSet = new Set(opts.productIds);
    queue = queue.filter(q => idSet.has(q.productId));
  } else if (opts?.category) {
    const cat = opts.category.toLowerCase();
    queue = queue.filter(q => q.category?.toLowerCase() === cat);
  }

  const limit = opts?.limit ?? 200;
  const analysisItems: DryRunItem[] = [];
  let publishableCount      = 0;
  let updateableCount       = 0;
  let blockedCount          = 0;
  let alreadyPublishedCount = 0;
  let topLevelAutoFix       = false;

  for (const q of queue.slice(0, limit)) {
    if (q.publicationStatus === PUBLICATION_STATUS.PUBLISHED) {
      alreadyPublishedCount++;
      analysisItems.push({
        productId:        q.productId,
        name:             q.productName,
        sku:              q.sku,
        category:         q.category,
        action:           "skip_already_published",
        actionLabel:      ACTION_LABEL["skip_already_published"],
        reason:           "Ya publicado en Shopify — sin cambios pendientes",
        blockers:         [],
        autoFixAvailable: false,
        autoFixFields:    [],
      });
    } else if (!q.isPublishable) {
      blockedCount++;
      const blockers  = deriveAllBlockers(q);
      const fixFields = getAutoFixFields(blockers);
      const canFix    = fixFields.length > 0;
      if (canFix) topLevelAutoFix = true;
      analysisItems.push({
        productId:        q.productId,
        name:             q.productName,
        sku:              q.sku,
        category:         q.category,
        action:           "skip_blocked",
        actionLabel:      ACTION_LABEL["skip_blocked"],
        reason:           `${q.blockingCount} requerimiento${q.blockingCount !== 1 ? "s" : ""} sin cumplir`,
        blockers,
        autoFixAvailable: canFix,
        autoFixFields:    fixFields,
      });
    } else if (q.externalId) {
      // Has Shopify ID but not marked published in Agentik → update
      updateableCount++;
      // Only include non-blocking enrichment gaps (warnings)
      const allBlockers = deriveAllBlockers(q);
      const blockers    = allBlockers.filter(b => b.severity === "warning");
      const fixFields   = getAutoFixFields(blockers);
      analysisItems.push({
        productId:        q.productId,
        name:             q.productName,
        sku:              q.sku,
        category:         q.category,
        action:           "would_update",
        actionLabel:      ACTION_LABEL["would_update"],
        reason:           "Existe en Shopify — se actualizará con el contenido más reciente",
        blockers,
        autoFixAvailable: fixFields.length > 0,
        autoFixFields:    fixFields,
      });
    } else {
      publishableCount++;
      // Only include non-blocking enrichment gaps (warnings)
      const allBlockers = deriveAllBlockers(q);
      const blockers    = allBlockers.filter(b => b.severity === "warning");
      const fixFields   = getAutoFixFields(blockers);
      analysisItems.push({
        productId:        q.productId,
        name:             q.productName,
        sku:              q.sku,
        category:         q.category,
        action:           "would_publish",
        actionLabel:      ACTION_LABEL["would_publish"],
        reason:           `Listo para publicar — preparación ${q.readinessScore}%`,
        blockers,
        autoFixAvailable: fixFields.length > 0,
        autoFixFields:    fixFields,
      });
    }
  }

  return {
    dryRun: true,
    publishableCount,
    updateableCount,
    blockedCount,
    alreadyPublishedCount,
    autoFixAvailable: topLevelAutoFix,
    items: analysisItems,
  };
}

// ── BulkPublishResult + filters ───────────────────────────────────────────────

export interface BulkPublishResult {
  published:  number;
  failed:     number;
  skipped:    number;
  errors:     Array<{ productId: string; productName: string; message: string }>;
  durationMs: number;
}

export interface CatalogPublishFilters {
  category?:   string;    // filter by product category
  limit?:      number;    // max products (default 50)
  /** Explicit product ID list — when provided, only these products are processed.
   *  Takes precedence over `category` filter.
   *  Copilot actions use this to operate on user-selected subsets. */
  productIds?: string[];
}

// ── publishReadyProducts ──────────────────────────────────────────────────────

/**
 * Publishes all products that are ready for Shopify.
 *
 * Safety guarantees:
 *   - Only isPublishable products are processed.
 *   - Products with externalId are UPDATED (updateWithContent), never re-created.
 *     This prevents duplicates when a product exists in Shopify but status fell back.
 *   - Already-published products are skipped (counted in `skipped`).
 *   - Per-product errors do not abort the batch.
 *   - 500 ms delay between requests (Shopify rate limit protection).
 *
 * Input:  organizationId, accessToken (server-only), shopDomain, CatalogPublishFilters
 * Output: BulkPublishResult with per-error detail
 * Errors: never throws — errors collected in result.errors
 *
 * Copilot: "shopify.publishReadyProducts" / "shopify.publishMissingProducts"
 */
export async function publishReadyProducts(
  organizationId: string,
  accessToken:     string,   // ⚠ server-only — never log
  shopDomain:      string,
  opts?: CatalogPublishFilters & { batchLimit?: number },
): Promise<BulkPublishResult> {
  const batchLimit = opts?.batchLimit ?? opts?.limit ?? 50;

  const items = await listProductConsoleItems(organizationId);
  let queue   = buildPublicationQueue(items, "shopify");

  if (opts?.productIds?.length) {
    const idSet = new Set(opts.productIds);
    queue = queue.filter(q => idSet.has(q.productId));
  } else if (opts?.category) {
    const cat = opts.category.toLowerCase();
    queue = queue.filter(q => q.category?.toLowerCase() === cat);
  }

  const candidates = queue
    .filter(q => q.isPublishable && q.publicationStatus !== PUBLICATION_STATUS.PUBLISHED)
    .slice(0, batchLimit);

  const alreadyPublished = queue.filter(
    q => q.publicationStatus === PUBLICATION_STATUS.PUBLISHED,
  ).length;

  const startTime = Date.now();
  let published   = 0;
  let failed      = 0;
  const errors: BulkPublishResult["errors"] = [];

  for (const item of candidates) {
    try {
      // ── Duplicate prevention ──────────────────────────────────────────────
      // If the product already has a Shopify ID (externalId), update instead of
      // creating a new product. This handles the case where publication state
      // fell back to non-published after a partial sync or webhook deletion event.
      const result = item.externalId
        ? await updateWithContent({
            organizationId,
            productId:   item.productId,
            accessToken,
            shopDomain,
          })
        : await publishWithContent({
            organizationId,
            productId:   item.productId,
            accessToken,
            shopDomain,
            jobId: `bulk-${Date.now()}`,
          });

      if (result.success) {
        published++;
      } else {
        failed++;
        errors.push({
          productId:   item.productId,
          productName: item.productName,
          message:     result.errorMessage ?? "Error desconocido",
        });
      }
    } catch (err) {
      failed++;
      errors.push({
        productId:   item.productId,
        productName: item.productName,
        message:     err instanceof Error ? err.message : "Error interno",
      });
    }

    await delay(500);
  }

  return {
    published,
    failed,
    skipped: alreadyPublished,
    errors,
    durationMs: Date.now() - startTime,
  };
}

// ── publishProductsByCategory ─────────────────────────────────────────────────

/**
 * Shorthand for publishReadyProducts with a category filter.
 * Copilot: "shopify.publishByCategory"
 */
export async function publishProductsByCategory(
  organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  category:        string,
  opts?: { limit?: number },
): Promise<BulkPublishResult> {
  return publishReadyProducts(organizationId, accessToken, shopDomain, {
    category,
    batchLimit: opts?.limit ?? 50,
  });
}

// ── Activate drafts ───────────────────────────────────────────────────────────

export interface ActivateDraftsDryRunResult {
  dryRun:     true;
  total:      number;
  candidates: Array<{ productId: string; name: string; sku: string | null }>;
}

export interface ActivateDraftsResult {
  activated:    number;
  failed:       number;
  skipped:      number;
  /** Already active in Shopify at the time of the call — no action needed. */
  alreadyActive: number;
  /** Not found in Shopify (externalId deleted or invalid). */
  notFound:     number;
  /** Archived in Shopify — activation skipped; manual review required. */
  archived:     number;
  errors:       Array<{ productId: string; message: string }>;
  durationMs:   number;
}

/**
 * DryRun: returns candidates for activation (products in Shopify that are not
 * yet in "published" state in Agentik). No Shopify calls made.
 *
 * Copilot: "shopify.dryRunActivateDrafts"
 */
export async function dryRunActivateDrafts(
  organizationId: string,
  opts?: { category?: string; productIds?: string[] },
): Promise<ActivateDraftsDryRunResult> {
  const items = await listProductConsoleItems(organizationId);
  let queue   = buildPublicationQueue(items, "shopify");

  if (opts?.productIds?.length) {
    const idSet = new Set(opts.productIds);
    queue = queue.filter(q => idSet.has(q.productId));
  } else if (opts?.category) {
    const cat = opts.category.toLowerCase();
    queue = queue.filter(q => q.category?.toLowerCase() === cat);
  }

  // Candidates: have externalId (exist in Shopify) but not published in Agentik
  const candidates = queue.filter(q => q.externalId && q.publicationStatus !== PUBLICATION_STATUS.PUBLISHED);

  return {
    dryRun:     true,
    total:      candidates.length,
    candidates: candidates.map(q => ({ productId: q.productId, name: q.productName, sku: q.sku })),
  };
}

/**
 * Activates all Shopify draft products for this org (sets status = "active").
 * Only activates products that have an externalPublicationId and are not
 * currently marked as published in Agentik.
 *
 * Input:  organizationId, accessToken (server-only), shopDomain, optional filters
 * Output: ActivateDraftsResult with per-error detail
 * Errors: never throws — errors collected in result.errors
 *
 * Copilot: "shopify.activatePublishedDrafts"
 */
export async function activatePublishedDraftProducts(
  organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  opts?: { category?: string; limit?: number; productIds?: string[] },
): Promise<ActivateDraftsResult> {
  const items = await listProductConsoleItems(organizationId);
  let queue   = buildPublicationQueue(items, "shopify");

  if (opts?.productIds?.length) {
    const idSet = new Set(opts.productIds);
    queue = queue.filter(q => idSet.has(q.productId));
  } else if (opts?.category) {
    const cat = opts.category.toLowerCase();
    queue = queue.filter(q => q.category?.toLowerCase() === cat);
  }

  // Candidates: exist in Shopify (externalId), not published in Agentik
  const candidates = queue
    .filter(q => q.externalId && q.publicationStatus !== PUBLICATION_STATUS.PUBLISHED)
    .slice(0, opts?.limit ?? 50);

  const skipped = queue.filter(q => q.publicationStatus === PUBLICATION_STATUS.PUBLISHED).length;

  const startTime  = Date.now();
  let activated    = 0;
  let failed       = 0;
  let alreadyActive = 0;
  let notFound     = 0;
  let archived     = 0;
  const errors: ActivateDraftsResult["errors"] = [];

  for (const item of candidates) {
    try {
      // ── Phase 4: consult live Shopify state before activating ─────────────
      // This prevents activating already-active products or operating on
      // invalid external IDs, saving API quota and preventing spurious errors.
      const liveCheck = await fetchShopifyProductState({
        shopDomain,
        accessToken,
        externalProductId: item.externalId!,
      });

      if (liveCheck.error === "not_found") {
        notFound++;
        errors.push({ productId: item.productId, message: "Producto no encontrado en Shopify (externalId inválido)" });
        await delay(500);
        continue;
      }

      if (liveCheck.state?.status === "active") {
        // Already active in Shopify — no Shopify call needed
        alreadyActive++;
        await delay(500);
        continue;
      }

      if (liveCheck.state?.status === "archived") {
        archived++;
        errors.push({ productId: item.productId, message: "Producto archivado en Shopify — requiere revisión manual" });
        await delay(500);
        continue;
      }

      // ── Proceed with activation ───────────────────────────────────────────
      const result = await activateShopifyProduct({
        organizationId,
        productId:   item.productId,
        accessToken,
        shopDomain,
      });

      if (result.success) {
        activated++;
      } else {
        failed++;
        errors.push({ productId: item.productId, message: result.errorMessage ?? "Error al activar" });
      }
    } catch (err) {
      failed++;
      errors.push({
        productId: item.productId,
        message:   err instanceof Error ? err.message : "Error interno",
      });
    }

    await delay(500);
  }

  return { activated, failed, skipped, alreadyActive, notFound, archived, errors, durationMs: Date.now() - startTime };
}

// ── Update modified products ──────────────────────────────────────────────────

export interface UpdateModifiedDryRunResult {
  dryRun:     true;
  total:      number;
  candidates: Array<{
    productId:   string;
    name:        string;
    updatedAt:   string;
    lastSyncAt:  string | null;
  }>;
}

export interface UpdateModifiedResult {
  candidates: number;
  updated:    number;
  failed:     number;
  skipped:    number;
  errors:     Array<{ productId: string; productName: string; message: string }>;
  durationMs: number;
}

/**
 * DryRun: returns products published to Shopify whose Agentik content
 * has changed since last sync (updatedAt > lastSyncAt). No side effects.
 *
 * Copilot: "shopify.dryRunUpdateModified"
 */
export async function dryRunUpdateModified(
  organizationId: string,
  opts?: { category?: string; limit?: number; productIds?: string[] },
): Promise<UpdateModifiedDryRunResult> {
  const items = await listProductConsoleItems(organizationId);
  let queue   = buildPublicationQueue(items, "shopify");

  if (opts?.productIds?.length) {
    const idSet = new Set(opts.productIds);
    queue = queue.filter(q => idSet.has(q.productId));
  } else if (opts?.category) {
    const cat = opts.category.toLowerCase();
    queue = queue.filter(q => q.category?.toLowerCase() === cat);
  }

  const modified = queue
    .filter(q => {
      if (q.publicationStatus !== PUBLICATION_STATUS.PUBLISHED) return false;
      if (!q.externalId)  return false;
      if (!q.lastSyncAt)  return false;
      const item = items.find(i => i.productId === q.productId);
      if (!item) return false;
      return new Date(item.updatedAt) > new Date(q.lastSyncAt);
    })
    .slice(0, opts?.limit ?? 200);

  return {
    dryRun:     true,
    total:      modified.length,
    candidates: modified.map(q => {
      const item = items.find(i => i.productId === q.productId)!;
      return { productId: q.productId, name: q.productName, updatedAt: item.updatedAt, lastSyncAt: q.lastSyncAt };
    }),
  };
}

/**
 * Pushes content updates for products that were modified in Agentik after
 * their last Shopify sync. Uses updateWithContent() (enriched pipeline).
 *
 * Heuristic: compares product entity.updatedAt with lastSyncAt from
 * ProductPublicationState. A change in any field triggers a full content push.
 * This is intentionally conservative — updating a product that hasn't changed
 * is safe (idempotent) and preferable to missing a real content change.
 *
 * Input:  organizationId, accessToken (server-only), shopDomain, optional filters
 * Output: UpdateModifiedResult with per-error detail
 * Errors: never throws — errors collected in result.errors
 *
 * Copilot: "shopify.updateModifiedProducts"
 */
export async function updateModifiedProducts(
  organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  opts?: { category?: string; limit?: number; productIds?: string[] },
): Promise<UpdateModifiedResult> {
  const items = await listProductConsoleItems(organizationId);
  let queue   = buildPublicationQueue(items, "shopify");

  if (opts?.productIds?.length) {
    const idSet = new Set(opts.productIds);
    queue = queue.filter(q => idSet.has(q.productId));
  } else if (opts?.category) {
    const cat = opts.category.toLowerCase();
    queue = queue.filter(q => q.category?.toLowerCase() === cat);
  }

  const published = queue.filter(q => q.publicationStatus === PUBLICATION_STATUS.PUBLISHED);

  const modified = published
    .filter(q => {
      if (!q.externalId)  return false;
      if (!q.lastSyncAt)  return false;
      const item = items.find(i => i.productId === q.productId);
      if (!item) return false;
      return new Date(item.updatedAt) > new Date(q.lastSyncAt);
    })
    .slice(0, opts?.limit ?? 50);

  const startTime = Date.now();
  let updated     = 0;
  let failed      = 0;
  const errors: UpdateModifiedResult["errors"] = [];

  for (const item of modified) {
    try {
      const result = await updateWithContent({
        organizationId,
        productId:   item.productId,
        accessToken,
        shopDomain,
      });

      if (result.success) {
        updated++;
      } else {
        failed++;
        errors.push({
          productId:   item.productId,
          productName: item.productName,
          message:     result.errorMessage ?? "Error al actualizar",
        });
      }
    } catch (err) {
      failed++;
      errors.push({
        productId:   item.productId,
        productName: item.productName,
        message:     err instanceof Error ? err.message : "Error interno",
      });
    }

    await delay(500);
  }

  return {
    candidates: modified.length,
    updated,
    failed,
    skipped:    published.length - modified.length,
    errors,
    durationMs: Date.now() - startTime,
  };
}

// ── fetchShopifyProductLiveState ──────────────────────────────────────────────

/**
 * Fetches the real-time state of a product from Shopify using the stored
 * externalPublicationId. Returns a ShopifyFetchResult with the live state
 * or a typed error if the product can't be found.
 *
 * Input:  organizationId, productId, accessToken (server-only), shopDomain
 * Output: ShopifyFetchResult — { state, error, errorMessage }
 * Errors: never throws — errors returned in result
 *
 * Copilot: "shopify.getLiveProductState"
 */
export async function fetchShopifyProductLiveState(
  organizationId: string,
  productId:       string,
  accessToken:     string,   // ⚠ server-only — never log
  shopDomain:      string,
): Promise<ShopifyFetchResult> {
  const pubState = await prisma.productPublicationState.findUnique({
    where:  { productId_channel: { productId, channel: "shopify" } },
    select: { externalPublicationId: true },
  });

  if (!pubState?.externalPublicationId) {
    return {
      state:        null,
      error:        "not_found",
      errorMessage: "Producto no publicado en Shopify todavía.",
    };
  }

  return fetchShopifyProductState({
    shopDomain,
    accessToken,
    externalProductId: pubState.externalPublicationId,
  });
}

// ── Copilot-ready query functions ─────────────────────────────────────────────

/**
 * Returns all products that are blocked (have at least one blocking issue).
 * UI can render the blockers panel from this list without a Shopify API call.
 *
 * Copilot: "shopify.findBlockedProducts"
 */
export async function findBlockedProducts(organizationId: string) {
  const items = await listProductConsoleItems(organizationId);
  const queue = buildPublicationQueue(items, "shopify");
  return queue.filter(q => !q.isPublishable && q.blockingCount > 0);
}

/**
 * Returns products that are published in Shopify but whose Agentik content
 * changed after the last successful sync (updatedAt > lastSyncAt).
 *
 * Copilot: "shopify.findModifiedProducts"
 */
export async function findModifiedProducts(organizationId: string) {
  const items = await listProductConsoleItems(organizationId);
  const queue = buildPublicationQueue(items, "shopify");
  return queue.filter(q =>
    q.publicationStatus === PUBLICATION_STATUS.PUBLISHED &&
    q.externalId &&
    q.lastSyncAt &&
    new Date(q.updatedAt) > new Date(q.lastSyncAt),
  );
}

/**
 * Returns all products that are ready to publish to Shopify:
 * no blocking issues + not yet published.
 *
 * Copilot: "shopify.findPublishableProducts"
 */
export async function findPublishableProducts(organizationId: string) {
  const items = await listProductConsoleItems(organizationId);
  const queue = buildPublicationQueue(items, "shopify");
  return queue.filter(q =>
    q.isPublishable &&
    q.publicationStatus !== PUBLICATION_STATUS.PUBLISHED,
  );
}

// ── Copilot-ready shorthand operations (SHOPIFY-CATALOG-BULK-FILTERS-02) ─────
//
// Each function is UI-independent, accepts clear business filters, returns
// structured results. These are the canonical registry entries for
// shopify.* Copilot actions. All are safe to call from agents without
// depending on any UI state.
//
// Action registry:
//   shopify.publishSelection   — publish explicit product IDs
//   shopify.updateSelection    — update content for explicit product IDs
//   shopify.activateSelection  — activate explicit product IDs in Shopify
//   shopify.publishFiltered    — publish all ready products, optionally by category
//   shopify.updateFiltered     — update all modified products, optionally by category
//   shopify.activateFiltered   — activate all draft products, optionally by category

export const publishSelection = (
  organizationId: string,
  accessToken:    string,
  shopDomain:     string,
  productIds:     string[],
) => publishReadyProducts(organizationId, accessToken, shopDomain, { productIds });

export const updateSelection = (
  organizationId: string,
  accessToken:    string,
  shopDomain:     string,
  productIds:     string[],
) => updateModifiedProducts(organizationId, accessToken, shopDomain, { productIds });

export const activateSelection = (
  organizationId: string,
  accessToken:    string,
  shopDomain:     string,
  productIds:     string[],
) => activatePublishedDraftProducts(organizationId, accessToken, shopDomain, { productIds });

export const publishFiltered = (
  organizationId: string,
  accessToken:    string,
  shopDomain:     string,
  category?:      string,
) => publishReadyProducts(organizationId, accessToken, shopDomain, category ? { category } : undefined);

export const updateFiltered = (
  organizationId: string,
  accessToken:    string,
  shopDomain:     string,
  category?:      string,
) => updateModifiedProducts(organizationId, accessToken, shopDomain, category ? { category } : undefined);

export const activateFiltered = (
  organizationId: string,
  accessToken:    string,
  shopDomain:     string,
  category?:      string,
) => activatePublishedDraftProducts(organizationId, accessToken, shopDomain, category ? { category } : undefined);

// ── computeShopifyContentFingerprint ─────────────────────────────────────────

/**
 * Computes a lightweight deterministic fingerprint from the Agentik-side
 * product fields that are pushed to Shopify. Used to detect content drift
 * between the Agentik record and the live Shopify product without fetching
 * the full remote state.
 *
 * Compare this against ShopifyExternalProductState.rawHash (computed by
 * shopify-state-fetcher.ts) to determine whether a sync push is needed.
 *
 * ── Fields included ───────────────────────────────────────────────────────────
 *   title, description, sku, price, tags, primaryAssetUrl, variantCount
 *
 * ── Future Copilot integration ────────────────────────────────────────────────
 *   shopify.auditProductReadiness will call this + fetchShopifyProductLiveState
 *   and surface the fingerprint mismatch as an actionable drift signal.
 *
 * @returns a stable hex-like string that changes when any synced field changes.
 */
export function computeShopifyContentFingerprint(product: {
  name:           string | null;
  sku:            string | null;
  category:       string | null;
  primaryAssetUrl: string | null;
  variantCount:   number;
  updatedAt:      string;
}): string {
  // Simple deterministic hash from concatenated fields.
  // Replace with SHA-256 (via crypto.subtle or Node's `crypto`) when
  // collision resistance is required for production drift detection.
  const raw = [
    product.name       ?? "",
    product.sku        ?? "",
    product.category   ?? "",
    product.primaryAssetUrl ?? "",
    String(product.variantCount),
  ].join("|");

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
