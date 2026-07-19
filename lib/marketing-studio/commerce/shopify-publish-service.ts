/**
 * lib/marketing-studio/commerce/shopify-publish-service.ts
 *
 * SHOPIFY-EXPERIENCIAS-04 — Shopify Publish Service
 *
 * SERVER ONLY — never import from client components.
 *
 * Orchestrates the publication of approved landing drafts to Shopify.
 * Handles: publish, update, unpublish, status check, history.
 *
 * Uses AgentExecution as backing store for publication records.
 * operation = "SHOPIFY_PUBLISHED_EXPERIENCE"
 * module    = "marketing_studio"
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { getLandingDraft } from "./shopify-landing-draft-service";
import { renderLandingBlocksToHtml } from "./shopify-landing-renderer";
import type { LandingDraft } from "./shopify-landing-draft-types";
import type {
  ShopifyPublishedExperience,
  PublicationSyncStatus,
  PublishLandingResult,
  ExistingLandingCheck,
  PublicationHistoryEntry,
} from "./shopify-publish-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

const MODULE    = "marketing_studio";
const OPERATION = "SHOPIFY_PUBLISHED_EXPERIENCE";
const HISTORY_OP = "SHOPIFY_PUBLISH_HISTORY";

// ── Serialization helpers ────────────────────────────────────────────────────

function pubToMeta(pub: ShopifyPublishedExperience): Record<string, unknown> {
  return {
    draftId:          pub.draftId,
    productId:        pub.productId,
    productName:      pub.productName,
    shopifyPageId:    pub.shopifyPageId,
    shopifyHandle:    pub.shopifyHandle,
    publicationType:  pub.publicationType,
    publishedAt:      pub.publishedAt,
    publishedBy:      pub.publishedBy,
    lastSyncAt:       pub.lastSyncAt,
    lastError:        pub.lastError,
    version:          pub.version,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPub(row: any): ShopifyPublishedExperience {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    id:              row.id,
    orgId:           row.tenantId ?? "",
    draftId:         (meta.draftId        as string) ?? "",
    productId:       (meta.productId      as string) ?? "",
    productName:     (meta.productName    as string) ?? "Sin nombre",
    shopifyPageId:   (meta.shopifyPageId  as string | null) ?? null,
    shopifyHandle:   (meta.shopifyHandle  as string | null) ?? null,
    publicationType: "landing",
    publishedAt:     (meta.publishedAt    as string) ?? "",
    publishedBy:     (meta.publishedBy    as string) ?? "usuario",
    lastSyncAt:      (meta.lastSyncAt     as string) ?? "",
    syncStatus:      (row.status          as PublicationSyncStatus) ?? "pending",
    lastError:       (meta.lastError      as string | null) ?? null,
    version:         (meta.version        as number) ?? 1,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToHistory(row: any): PublicationHistoryEntry {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    id:          row.id,
    draftId:     (meta.draftId     as string) ?? "",
    productName: (meta.productName as string) ?? "",
    action:      (meta.action      as PublicationHistoryEntry["action"]) ?? "publish",
    result:      (meta.result      as "ok" | "error") ?? "ok",
    error:       (meta.error       as string | null) ?? null,
    version:     (meta.version     as number) ?? 1,
    publishedBy: (meta.publishedBy as string) ?? "usuario",
    publishedAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    durationMs:  (meta.durationMs  as number) ?? 0,
  };
}

// ── Check existing publication ───────────────────────────────────────────────

/**
 * Checks if a product already has a published landing.
 */
export async function checkExistingLanding(
  orgId:     string,
  productId: string,
): Promise<ExistingLandingCheck> {
  const row = await execDb().findFirst({
    where: {
      tenantId:  orgId,
      module:    MODULE,
      operation: OPERATION,
      status:    { in: ["published", "updated"] },
      metadataJson: { path: ["productId"], equals: productId },
    },
    orderBy: { createdAt: "desc" },
  });

  return row
    ? { exists: true,  publication: rowToPub(row) }
    : { exists: false, publication: null };
}

// ── Publish landing ──────────────────────────────────────────────────────────

/**
 * Publishes an approved landing draft to Shopify.
 *
 * Steps:
 *   1. Validate draft exists and is approved.
 *   2. Check for existing publication.
 *   3. Render blocks to HTML.
 *   4. Call Shopify Pages API (create or update).
 *   5. Persist publication record.
 *   6. Record history entry.
 */
export async function publishLanding(
  orgId:   string,
  draftId: string,
  userId:  string,
  mode:    "update" | "new" = "new",
): Promise<PublishLandingResult> {
  const startMs = Date.now();

  // 1. Load and validate draft
  const draft = await getLandingDraft(orgId, draftId);
  if (!draft) {
    return { ok: false, publication: null, error: "Borrador no encontrado.", durationMs: Date.now() - startMs };
  }
  if (draft.status !== "aprobado") {
    return { ok: false, publication: null, error: "Solo borradores aprobados pueden publicarse.", durationMs: Date.now() - startMs };
  }

  // 2. Check for existing publication
  const existing = await checkExistingLanding(orgId, draft.productId);

  // 3. Render HTML
  const html = renderLandingBlocksToHtml(draft.blocks, draft.productName);
  if (!html) {
    return { ok: false, publication: null, error: "El borrador no tiene bloques visibles para publicar.", durationMs: Date.now() - startMs };
  }

  // 4. Call Shopify API
  let shopifyResult: { pageId: string; handle: string };
  try {
    if (existing.exists && mode === "update" && existing.publication) {
      shopifyResult = await callShopifyUpdatePage(
        orgId,
        existing.publication.shopifyPageId!,
        draft,
        html,
      );
    } else {
      shopifyResult = await callShopifyCreatePage(orgId, draft, html);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Error al comunicarse con Shopify.";
    await recordHistory(orgId, draftId, draft.productName, "publish", "error", errorMsg, existing.publication?.version ?? 0, userId, Date.now() - startMs);
    return { ok: false, publication: null, error: errorMsg, durationMs: Date.now() - startMs };
  }

  // 5. Persist publication record
  const now = new Date().toISOString();
  const version = existing.exists && existing.publication
    ? existing.publication.version + 1
    : 1;

  const isUpdate = existing.exists && mode === "update";

  let publication: ShopifyPublishedExperience;

  if (isUpdate && existing.publication) {
    // Update existing record
    const updatedRow = await execDb().update({
      where: { id: existing.publication.id },
      data: {
        status: "updated",
        metadataJson: pubToMeta({
          ...existing.publication,
          draftId,
          shopifyPageId:  shopifyResult.pageId,
          shopifyHandle:  shopifyResult.handle,
          lastSyncAt:     now,
          lastError:      null,
          version,
        }),
      },
    });
    publication = rowToPub(updatedRow);
  } else {
    // Create new record
    const pub: ShopifyPublishedExperience = {
      id:              "",
      orgId,
      draftId,
      productId:       draft.productId,
      productName:     draft.productName,
      shopifyPageId:   shopifyResult.pageId,
      shopifyHandle:   shopifyResult.handle,
      publicationType: "landing",
      publishedAt:     now,
      publishedBy:     userId,
      lastSyncAt:      now,
      syncStatus:      "published",
      lastError:       null,
      version,
    };

    const row = await execDb().create({
      data: {
        tenantId:     orgId,
        module:       MODULE,
        operation:    OPERATION,
        action:       "publish_landing",
        status:       "published",
        createdBy:    userId,
        metadataJson: pubToMeta(pub),
      },
    });
    publication = rowToPub(row);
  }

  // 6. Record history
  await recordHistory(orgId, draftId, draft.productName, isUpdate ? "update" : "publish", "ok", null, version, userId, Date.now() - startMs);

  return { ok: true, publication, error: null, durationMs: Date.now() - startMs };
}

// ── Update landing ───────────────────────────────────────────────────────────

export async function updateLanding(
  orgId:   string,
  draftId: string,
  userId:  string,
): Promise<PublishLandingResult> {
  return publishLanding(orgId, draftId, userId, "update");
}

// ── Unpublish landing ────────────────────────────────────────────────────────

export async function unpublishLanding(
  orgId:          string,
  publicationId:  string,
  userId:         string,
): Promise<{ ok: boolean; error: string | null }> {
  const row = await execDb().findFirst({
    where: {
      id:        publicationId,
      tenantId:  orgId,
      module:    MODULE,
      operation: OPERATION,
    },
  });

  if (!row) return { ok: false, error: "Publicacion no encontrada." };

  const pub = rowToPub(row);

  // Archive the publication record
  await execDb().update({
    where: { id: publicationId },
    data: {
      status: "archived",
      metadataJson: pubToMeta({
        ...pub,
        syncStatus: "archived",
        lastSyncAt: new Date().toISOString(),
      }),
    },
  });

  await recordHistory(orgId, pub.draftId, pub.productName, "unpublish", "ok", null, pub.version, userId, 0);

  return { ok: true, error: null };
}

// ── Get publication status ───────────────────────────────────────────────────

export async function getPublicationStatus(
  orgId:   string,
  draftId: string,
): Promise<ShopifyPublishedExperience | null> {
  const row = await execDb().findFirst({
    where: {
      tenantId:  orgId,
      module:    MODULE,
      operation: OPERATION,
      status:    { in: ["published", "updated", "pending"] },
      metadataJson: { path: ["draftId"], equals: draftId },
    },
    orderBy: { createdAt: "desc" },
  });

  return row ? rowToPub(row) : null;
}

// ── Publication history ──────────────────────────────────────────────────────

export async function getPublicationHistory(
  orgId: string,
): Promise<PublicationHistoryEntry[]> {
  const rows = await execDb().findMany({
    where: {
      tenantId:  orgId,
      module:    MODULE,
      operation: HISTORY_OP,
    },
    orderBy: { createdAt: "desc" },
    take:    100,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => rowToHistory(r));
}

// ── Internal: record history entry ───────────────────────────────────────────

async function recordHistory(
  orgId:       string,
  draftId:     string,
  productName: string,
  action:      "publish" | "update" | "unpublish",
  result:      "ok" | "error",
  error:       string | null,
  version:     number,
  userId:      string,
  durationMs:  number,
): Promise<void> {
  await execDb().create({
    data: {
      tenantId:     orgId,
      module:       MODULE,
      operation:    HISTORY_OP,
      action:       `landing_${action}`,
      status:       result,
      createdBy:    userId,
      metadataJson: {
        draftId,
        productName,
        action,
        result,
        error,
        version,
        publishedBy: userId,
        durationMs,
      },
    },
  });
}

// ── Shopify API calls (stubs — real implementation requires Shopify connection) ─

/**
 * Creates a new page in Shopify via the Pages API.
 * Returns the Shopify page ID and handle.
 *
 * Current: generates deterministic IDs for the publication record.
 * When Shopify integration is fully wired, this will use the
 * actual Shopify Admin API (POST /admin/api/2024-01/pages.json).
 */
async function callShopifyCreatePage(
  _orgId: string,
  draft:  LandingDraft,
  _html:  string,
): Promise<{ pageId: string; handle: string }> {
  // TODO: Wire to real Shopify Admin API when connection is available.
  // For now, generate deterministic IDs that will be replaced on real publish.
  const pageId = `shopify_page_${draft.productId}_${Date.now().toString(36)}`;
  const handle = `landing-${draft.productId.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  return { pageId, handle };
}

/**
 * Updates an existing Shopify page.
 */
async function callShopifyUpdatePage(
  _orgId:    string,
  pageId:    string,
  _draft:    LandingDraft,
  _html:     string,
): Promise<{ pageId: string; handle: string }> {
  // TODO: Wire to real Shopify Admin API (PUT /admin/api/2024-01/pages/{pageId}.json)
  const handle = `landing-updated-${Date.now().toString(36)}`;
  return { pageId, handle };
}
