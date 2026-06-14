/**
 * lib/marketing-studio/commerce/shopify-collections-service.ts
 *
 * SHOPIFY-COLLECTIONS-03C — Domain Service for Shopify Collections
 * Architecturally closed — production-ready + Copilot-prepared.
 *
 * SERVER ONLY — never import from client components.
 *
 * ── Copilot Action Registry ────────────────────────────────────────────────────
 *
 *   shopify.listCollections              — list collections from the store
 *   shopify.createCollection             — create a new collection (dedup by handle)
 *   shopify.addProductsToCollection      — add products to an existing or new collection
 *   shopify.publishCollection            — publish products + create collection + add all
 *   shopify.syncCollection               — sync product membership for a collection
 *   shopify.createCollectionFromCategory — create collection from Agentik category
 *
 * ── Supported Copilot natural language scenarios ──────────────────────────────
 *
 *   "Crea una colección de juguetes."
 *     → createShopifyCollection / createCollectionFromCategory
 *
 *   "Agrega estas referencias a la colección Navidad."
 *     → syncProductsToCollection (with explicit productIds)
 *
 *   "Publica la colección Bebé."
 *     → publishCollectionProducts (resolves by category or productIds)
 *
 *   "Sincroniza la colección Outlet."
 *     → syncExistingCollection (future — see stub)
 *
 *   "Muéstrame las colecciones administradas por Agentik."
 *     → findShopifyCollections filtered by .managedByAgentik === true
 *
 * ── Safety guarantees ─────────────────────────────────────────────────────────
 *
 *   - dryRun functions never call Shopify or modify DB.
 *   - Idempotent: existing product memberships are detected and skipped.
 *   - A single blocked product never aborts the whole collection sync.
 *   - Deduplication: handle-based check before every collection creation.
 *   - Products without externalId (not published) are never added to a collection.
 *   - All functions are organizationId-scoped.
 *
 * ── Rate limiting ─────────────────────────────────────────────────────────────
 *   Shopify leaky bucket: ~2 req/sec.
 *   We apply a 400 ms delay between consecutive API calls.
 */

import { listProductConsoleItems }   from "@/lib/marketing-studio/products/product-query-service";
import { buildPublicationQueue }     from "@/lib/marketing-studio/commerce/publication-engine";
import { PUBLICATION_STATUS }        from "@/lib/marketing-studio/commerce/commerce-types";
import { publishReadyProducts }      from "@/lib/marketing-studio/commerce/shopify-catalog-service";
import { createShopifyClient }       from "@/lib/integrations/shopify/shopify-client";
import type {
  ShopifyCustomCollection,
} from "@/lib/integrations/shopify/shopify-types";

// ── Shared helpers ─────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function toHandle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Agentik identity marker ────────────────────────────────────────────────────
//
// Design principle: the detection mechanism is fully hidden behind two exported
// functions. NO consumer (UI, Copilot, API routes) should reference body_html,
// HTML comments, or magic strings directly.
//
// Current implementation: hidden HTML comment in body_html.
//
// TODO(SHOPIFY-COLLECTIONS-04): Migrate to Shopify metafields.
//   Target: namespace="agentik", key="managed_by", value="true" (type: single_line_text_field).
//   Required scope: write_product_listings (metafields).
//   Migration plan:
//     1. On first sync, write metafield to all collections that currently have the HTML tag.
//     2. Update isAgentikManagedCollection() to check metafield first, fall back to tag.
//     3. Update markCollectionAsAgentikManaged() to write metafield only (omit tag).
//     4. After rollout, remove the tag check from step 2.
//   Consumers of isAgentikManagedCollection() and markCollectionAsAgentikManaged()
//   require zero changes during this migration.

const AGENTIK_COLLECTION_TAG = "<!-- [agentik-managed] -->";

/**
 * Returns true if this Shopify collection was created and is managed by Agentik.
 *
 * Safe to call with any raw Shopify collection object — never throws.
 * Implementation detail (body_html tag) is fully hidden from callers.
 */
export function isAgentikManagedCollection(
  collection: { body_html: string | null },
): boolean {
  return (collection.body_html ?? "").includes(AGENTIK_COLLECTION_TAG);
}

/**
 * Returns the body_html string to use when creating an Agentik-managed collection.
 * Injects the identity marker so Agentik can recognize this collection later.
 *
 * Pass `description` to include visible storefront content alongside the marker.
 */
export function markCollectionAsAgentikManaged(description?: string): string {
  const base = description ? `${description}\n` : "";
  return `${base}${AGENTIK_COLLECTION_TAG}`;
}

// ── Collection source ──────────────────────────────────────────────────────────

/**
 * Strategy used to resolve which products belong in a collection.
 *
 *   manual   — explicit productIds supplied by the user or Copilot
 *   category — all products in an Agentik category
 *   tags     — (stub) products matched by tag filter
 *   search   — (stub) products matched by free-text search
 */
export type ShopifyCollectionSource = "manual" | "category" | "tags" | "search";

// ── Collection input types ─────────────────────────────────────────────────────

export interface CollectionInput {
  title:       string;
  handle?:     string;
  description?: string;
  /** Explicit product IDs to include. Takes precedence over category. */
  productIds?: string[];
  /** Agentik category — resolves all products in that category. */
  category?:   string;
  /** Source strategy (defaults to manual or category based on which field is set). */
  source?:     ShopifyCollectionSource;
}

// ── Canonical collection model ─────────────────────────────────────────────────

/**
 * Canonical domain model for a Shopify collection surfaced through Agentik.
 * Used by all UI screens and Copilot reasoning — no Shopify internals exposed.
 *
 * `publishedProductCount` and `blockedProductCount` are optional because
 * populating them requires cross-referencing the Agentik product queue (extra
 * DB call). They are null when listing collections cheaply, and populated after
 * a dryRun or enrichment pass.
 */
export interface ShopifyCollectionSummary {
  /** Shopify collection ID */
  id:                    number;
  title:                 string;
  handle:                string;
  description:           string | null;
  isPublished:           boolean;
  /** True if this collection was created and is managed by Agentik. */
  managedByAgentik:      boolean;
  /** Total product count as reported by Shopify. */
  productCount:          number;
  /** Products in this collection that are published in the Agentik catalog. Null if not enriched. */
  publishedProductCount: number | null;
  /** Products in this collection blocked from publication. Null if not enriched. */
  blockedProductCount:   number | null;
  /** ISO timestamp of last update to this collection in Shopify. */
  updatedAt:             string | null;
}

/** @deprecated Use ShopifyCollectionSummary */
export type AgentikCollection = ShopifyCollectionSummary;

export interface CollectionSyncItem {
  productId:   string;
  name:        string;
  sku:         string | null;
  /** Shopify product ID (externalId) — null if not published yet */
  shopifyId:   string | null;
  actionLabel: string;
  /** "added" | "already_in" | "not_published" | "blocked" */
  status:      "added" | "already_in" | "not_published" | "blocked";
  blockers:    string[];
}

export interface CollectionDryRunResult {
  dryRun:                true;
  collectionTitle:       string;
  candidatesCount:       number;
  alreadyInCollectionCount: number;
  willAddCount:          number;
  willPublishCount:      number;
  blockedCount:          number;
  items:                 CollectionSyncItem[];
}

/**
 * Full summary returned after any collection sync or publish operation.
 *
 * Commercial read-aloud format (used by Copilot):
 *   "Colección: {collectionTitle}
 *    - {productsAdded} agregados
 *    - {alreadyInCollection} ya pertenecían
 *    - {productsPublished} publicados durante el proceso
 *    - {productsBlocked} requieren completar información"
 */
export interface CollectionSyncResult {
  collectionTitle:    string;
  collectionId:       number;
  collectionCreated:  boolean;
  productsPublished:  number;
  productsAdded:      number;
  /** Products already in the collection before this sync — idempotency counter. */
  alreadyInCollection: number;
  productsBlocked:    number;
  errors:             Array<{ productId: string; name: string; message: string }>;
  durationMs:         number;
}

// ── findShopifyCollections ────────────────────────────────────────────────────

/**
 * Lists all custom collections in the store, mapped to business language.
 * No Agentik DB call — reads directly from Shopify.
 *
 * Copilot: "shopify.listCollections"
 */
export async function findShopifyCollections(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
): Promise<AgentikCollection[]> {
  const client = createShopifyClient(shopDomain);
  const raw    = await client.listCustomCollections(accessToken);

  return raw.map(c => ({
    id:                    c.id,
    title:                 c.title,
    handle:                c.handle,
    description:           c.body_html ?? null,
    isPublished:           c.published_at !== null,
    managedByAgentik:      isAgentikManagedCollection(c),
    productCount:          c.products_count,
    publishedProductCount: null,   // not enriched at list time
    blockedProductCount:   null,   // not enriched at list time
    updatedAt:             c.updated_at ?? null,
  }));
}

// ── createShopifyCollection ───────────────────────────────────────────────────

/**
 * Creates a new collection in Shopify, deduplicating by handle.
 * If a collection with the same handle already exists, returns it without
 * creating a duplicate.
 *
 * Copilot: "shopify.createCollection"
 */
export async function createShopifyCollection(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  input:           Pick<CollectionInput, "title" | "handle" | "description">,
): Promise<{ collection: AgentikCollection; created: boolean }> {
  const client       = createShopifyClient(shopDomain);
  const handle       = input.handle ?? toHandle(input.title);
  const existing     = await client.listCustomCollections(accessToken);
  const duplicate    = existing.find(c => c.handle === handle);

  if (duplicate) {
    return {
      collection: {
        id:                    duplicate.id,
        title:                 duplicate.title,
        handle:                duplicate.handle,
        description:           duplicate.body_html ?? null,
        isPublished:           duplicate.published_at !== null,
        managedByAgentik:      isAgentikManagedCollection(duplicate),
        productCount:          duplicate.products_count,
        publishedProductCount: null,
        blockedProductCount:   null,
        updatedAt:             duplicate.updated_at ?? null,
      },
      created: false,
    };
  }

  const created = await client.createCustomCollection(accessToken, {
    title:      input.title,
    handle,
    body_html:  markCollectionAsAgentikManaged(input.description),
    published:  true,
  });

  return {
    collection: {
      id:                    created.id,
      title:                 created.title,
      handle:                created.handle,
      description:           created.body_html ?? null,
      isPublished:           created.published_at !== null,
      managedByAgentik:      true,
      productCount:          created.products_count,
      publishedProductCount: null,
      blockedProductCount:   null,
      updatedAt:             created.updated_at ?? null,
    },
    created: true,
  };
}

// ── dryRunCollectionSync ──────────────────────────────────────────────────────

/**
 * Previews what syncProductsToCollection would do — no Shopify calls for adds,
 * no DB writes. Safe to call without executing.
 *
 * Resolution order:
 *   1. productIds (explicit selection)
 *   2. category (Agentik internal category)
 *
 * Copilot: "shopify.dryRunCollectionSync"
 */
export async function dryRunCollectionSync(
  organizationId: string,
  input:          CollectionInput,
): Promise<CollectionDryRunResult> {
  const items = await listProductConsoleItems(organizationId);
  const queue = buildPublicationQueue(items, "shopify");

  // Resolve candidates
  let candidates = queue;
  if (input.productIds?.length) {
    const ids = new Set(input.productIds);
    candidates = candidates.filter(q => ids.has(q.productId));
  } else if (input.category) {
    const cat = input.category.toLowerCase();
    candidates = candidates.filter(q => q.category?.toLowerCase() === cat);
  }

  const syncItems: CollectionSyncItem[] = [];
  let blockedCount      = 0;
  let notPublishedCount = 0;
  let willAddCount      = 0;

  for (const q of candidates) {
    if (!q.isPublishable && !q.externalId) {
      // Truly blocked — can't publish and not yet in Shopify
      blockedCount++;
      syncItems.push({
        productId:   q.productId,
        name:        q.productName,
        sku:         q.sku,
        shopifyId:   null,
        actionLabel: "Requiere completar información",
        status:      "blocked",
        blockers:    q.publicationIssues
          .filter(i => i.severity === "blocking")
          .map(i => i.label),
      });
    } else if (!q.externalId && q.publicationStatus !== PUBLICATION_STATUS.PUBLISHED) {
      // Publishable but not yet in Shopify
      notPublishedCount++;
      syncItems.push({
        productId:   q.productId,
        name:        q.productName,
        sku:         q.sku,
        shopifyId:   null,
        actionLabel: "Se publicará y agregará",
        status:      "not_published",
        blockers:    [],
      });
    } else {
      // Already in Shopify — would be added to collection
      willAddCount++;
      syncItems.push({
        productId:   q.productId,
        name:        q.productName,
        sku:         q.sku,
        shopifyId:   q.externalId,
        actionLabel: "Se agregará a la colección",
        status:      "added",
        blockers:    [],
      });
    }
  }

  return {
    dryRun:                    true,
    collectionTitle:           input.title,
    candidatesCount:           candidates.length,
    alreadyInCollectionCount:  0,   // requires live Shopify call — populated in real sync
    willAddCount,
    willPublishCount:          notPublishedCount,
    blockedCount,
    items:                     syncItems,
  };
}

// ── syncProductsToCollection ──────────────────────────────────────────────────

/**
 * Adds a set of already-published products to a Shopify collection.
 * Products that are not yet published in Shopify are SKIPPED (use
 * publishCollectionProducts to publish + add in one step).
 *
 * Deduplication: fetches existing membership before adding to avoid
 * creating duplicate collect records.
 *
 * Copilot: "shopify.syncCollection" / "shopify.addProductsToCollection"
 */
export async function syncProductsToCollection(
  organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  input:           CollectionInput & { collectionId: number },
): Promise<CollectionSyncResult> {
  const client = createShopifyClient(shopDomain);
  const items  = await listProductConsoleItems(organizationId);
  const queue  = buildPublicationQueue(items, "shopify");

  // Resolve candidates
  let candidates = queue;
  if (input.productIds?.length) {
    const ids = new Set(input.productIds);
    candidates = candidates.filter(q => ids.has(q.productId));
  } else if (input.category) {
    const cat = input.category.toLowerCase();
    candidates = candidates.filter(q => q.category?.toLowerCase() === cat);
  }

  // Only operate on published products with a Shopify ID
  const publishedCandidates = candidates.filter(
    q => q.externalId && q.publicationStatus === PUBLICATION_STATUS.PUBLISHED,
  );
  const blockedCandidates = candidates.filter(q => !q.externalId);

  // Fetch existing membership to detect "already in collection"
  let existingProductIds = new Set<number>();
  try {
    const existing = await client.listProductsInCollection(accessToken, input.collectionId);
    existingProductIds = new Set(existing.map(p => p.id));
  } catch {
    // Non-blocking — if we can't fetch existing, we'll attempt adds anyway
  }

  const startTime = Date.now();
  let added              = 0;
  let alreadyInCollection = 0;
  const errors: CollectionSyncResult["errors"] = [];

  for (const item of publishedCandidates) {
    const shopifyProductId = Number(item.externalId);

    if (existingProductIds.has(shopifyProductId)) {
      alreadyInCollection++;
      await delay(400);
      continue;
    }

    try {
      await client.addProductToCollection(accessToken, input.collectionId, shopifyProductId);
      added++;
    } catch (err) {
      errors.push({
        productId: item.productId,
        name:      item.productName,
        message:   err instanceof Error ? err.message : "Error al agregar a colección",
      });
    }

    await delay(400);
  }

  return {
    collectionTitle:     input.title,
    collectionId:        input.collectionId,
    collectionCreated:   false,
    productsPublished:   0,
    productsAdded:       added,
    alreadyInCollection,
    productsBlocked:     blockedCandidates.length,
    errors,
    durationMs:          Date.now() - startTime,
  };
}

// ── publishCollectionProducts ─────────────────────────────────────────────────

/**
 * Full publish-and-collect pipeline:
 *
 *   1. Resolve products by productIds or category.
 *   2. Publish unpublished products via publishReadyProducts.
 *   3. Find or create the Shopify collection.
 *   4. Add all published products to the collection.
 *   5. Return a full summary.
 *
 * This is the canonical "Publicar colección" action for Copilot.
 *
 * Copilot: "shopify.publishCollection"
 */
export async function publishCollectionProducts(
  organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  input:           CollectionInput,
): Promise<CollectionSyncResult> {
  const startTime = Date.now();
  const client    = createShopifyClient(shopDomain);
  const errors:   CollectionSyncResult["errors"] = [];

  // ── Step 1: Publish unpublished products ────────────────────────────────────
  let published = 0;
  try {
    const pubResult = await publishReadyProducts(
      organizationId,
      accessToken,
      shopDomain,
      input.productIds?.length
        ? { productIds: input.productIds }
        : input.category
          ? { category: input.category }
          : undefined,
    );
    published = pubResult.published;
    for (const e of pubResult.errors) {
      errors.push({ productId: e.productId, name: e.productName, message: e.message });
    }
  } catch (err) {
    errors.push({
      productId: "",
      name:      "Publicación masiva",
      message:   err instanceof Error ? err.message : "Error al publicar productos",
    });
  }

  // ── Step 2: Find or create the collection ───────────────────────────────────
  const handle    = input.handle ?? toHandle(input.title);
  const existing  = await client.listCustomCollections(accessToken);
  const duplicate = existing.find(c => c.handle === handle);

  let collection: ShopifyCustomCollection;
  let collectionCreated = false;

  if (duplicate) {
    collection = duplicate;
  } else {
    try {
      collection = await client.createCustomCollection(accessToken, {
        title:     input.title,
        handle,
        body_html: markCollectionAsAgentikManaged(input.description),
        published: true,
      });
      collectionCreated = true;
    } catch (err) {
      return {
        collectionTitle:    input.title,
        collectionId:       0,
        collectionCreated:  false,
        productsPublished:  published,
        productsAdded:      0,
        alreadyInCollection: 0,
        productsBlocked:    0,
        errors:             [...errors, {
          productId: "",
          name:      "Creación de colección",
          message:   err instanceof Error ? err.message : "Error al crear colección",
        }],
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ── Step 3: Re-fetch queue (some products just got published) ───────────────
  const items = await listProductConsoleItems(organizationId);
  const queue = buildPublicationQueue(items, "shopify");

  let candidates = queue;
  if (input.productIds?.length) {
    const ids = new Set(input.productIds);
    candidates = candidates.filter(q => ids.has(q.productId));
  } else if (input.category) {
    const cat = input.category.toLowerCase();
    candidates = candidates.filter(q => q.category?.toLowerCase() === cat);
  }

  const publishedCandidates = candidates.filter(
    q => q.externalId && q.publicationStatus === PUBLICATION_STATUS.PUBLISHED,
  );
  const blocked = candidates.filter(q => !q.externalId && !q.isPublishable);

  // ── Step 4: Fetch existing membership ───────────────────────────────────────
  let existingProductIds = new Set<number>();
  try {
    const inColl = await client.listProductsInCollection(accessToken, collection.id);
    existingProductIds = new Set(inColl.map(p => p.id));
  } catch { /* non-blocking */ }

  // ── Step 5: Add products to collection ──────────────────────────────────────
  let added              = 0;
  let alreadyInCollection = 0;

  for (const item of publishedCandidates) {
    const shopifyProductId = Number(item.externalId);

    if (existingProductIds.has(shopifyProductId)) {
      alreadyInCollection++;
      await delay(400);
      continue;
    }

    try {
      await client.addProductToCollection(accessToken, collection.id, shopifyProductId);
      added++;
    } catch (err) {
      errors.push({
        productId: item.productId,
        name:      item.productName,
        message:   err instanceof Error ? err.message : "Error al agregar a colección",
      });
    }

    await delay(400);
  }

  return {
    collectionTitle:    collection.title,
    collectionId:       collection.id,
    collectionCreated,
    productsPublished:  published,
    productsAdded:      added,
    alreadyInCollection,
    productsBlocked:    blocked.length,
    errors,
    durationMs:         Date.now() - startTime,
  };
}

// ── createCollectionFromCategory ──────────────────────────────────────────────

/**
 * Creates a Shopify collection from an Agentik product category.
 * Shorthand for: createShopifyCollection + syncProductsToCollection.
 *
 * Copilot: "shopify.createCollectionFromCategory"
 */
export async function createCollectionFromCategory(
  organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  category:        string,
  opts?: { description?: string; publish?: boolean },
): Promise<CollectionSyncResult> {
  const { collection, created } = await createShopifyCollection(
    organizationId,
    accessToken,
    shopDomain,
    { title: category, description: opts?.description },
  );

  if (opts?.publish) {
    return publishCollectionProducts(organizationId, accessToken, shopDomain, {
      title:    category,
      handle:   collection.handle,
      category,
    });
  }

  const syncResult = await syncProductsToCollection(
    organizationId,
    accessToken,
    shopDomain,
    {
      title:        category,
      handle:       collection.handle,
      category,
      collectionId: collection.id,
    },
  );

  return { ...syncResult, collectionCreated: created };
}

// ── Stub contracts (future sprints) ───────────────────────────────────────────

/**
 * Removes a list of products from an existing collection.
 * Does NOT delete the collection or the products.
 *
 * Copilot: "shopify.removeProductsFromCollection"
 * @stub — not yet implemented
 */
export async function removeProductsFromCollection(
  _organizationId: string,
  _accessToken:    string,
  _shopDomain:     string,
  _collectionId:   number,
  _productIds:     string[],
): Promise<{ removed: number; errors: Array<{ productId: string; message: string }> }> {
  throw new Error("removeProductsFromCollection: not yet implemented");
}

/**
 * Renames an existing Shopify collection.
 * Preserves all product memberships and handle (unless renameHandle is true).
 *
 * Copilot: "shopify.renameCollection"
 * @stub — not yet implemented
 */
export async function renameCollection(
  _organizationId: string,
  _accessToken:    string,
  _shopDomain:     string,
  _collectionId:   number,
  _newTitle:       string,
  _opts?:          { renameHandle?: boolean },
): Promise<AgentikCollection> {
  throw new Error("renameCollection: not yet implemented");
}

/**
 * Deletes a Shopify collection.
 * This removes the collection from the storefront; products are NOT deleted.
 *
 * Copilot: "shopify.deleteCollection"
 * @stub — not yet implemented
 */
export async function deleteCollection(
  _organizationId: string,
  _accessToken:    string,
  _shopDomain:     string,
  _collectionId:   number,
): Promise<{ deleted: boolean }> {
  throw new Error("deleteCollection: not yet implemented");
}

/**
 * Syncs an existing collection: adds missing products, optionally removes
 * products that no longer match the collection's source criteria.
 *
 * Copilot: "shopify.syncExistingCollection"
 * @stub — not yet implemented
 */
export async function syncExistingCollection(
  _organizationId: string,
  _accessToken:    string,
  _shopDomain:     string,
  _collectionId:   number,
  _input:          CollectionInput & { source?: ShopifyCollectionSource; removeStale?: boolean },
): Promise<CollectionSyncResult> {
  throw new Error("syncExistingCollection: not yet implemented");
}
