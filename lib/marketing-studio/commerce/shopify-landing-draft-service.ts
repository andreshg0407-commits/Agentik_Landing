/**
 * lib/marketing-studio/commerce/shopify-landing-draft-service.ts
 *
 * SHOPIFY-EXPERIENCIAS-02 — Landing Draft Service
 *
 * SERVER ONLY — never import from client components.
 *
 * Persists landing drafts using AgentExecution as the backing store.
 * operation = "SHOPIFY_LANDING_DRAFT"
 * module    = "marketing_studio"
 *
 * When a dedicated Prisma model is added, swap the implementation here
 * without changing the public API.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  LandingDraft,
  LandingDraftStatus,
  LandingDraftBlock,
  LandingDraftAssetRef,
  LandingDraftSource,
} from "./shopify-landing-draft-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

const MODULE    = "marketing_studio";
const OPERATION = "SHOPIFY_LANDING_DRAFT";

// ── Serialization helpers ────────────────────────────────────────────────────

function draftToMeta(draft: LandingDraft): Record<string, unknown> {
  return {
    productId:    draft.productId,
    productName:  draft.productName,
    sku:          draft.sku,
    templateId:   draft.templateId,
    templateName: draft.templateName,
    tenantPreset: draft.tenantPreset,
    source:       draft.source,
    blocks:       draft.blocks,
    assetsUsed:   draft.assetsUsed,
    generatedAt:  draft.generatedAt,
    createdBy:    draft.createdBy,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDraft(row: any): LandingDraft {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    id:           row.id,
    productId:    (meta.productId    as string)  ?? "",
    productName:  (meta.productName  as string)  ?? "Sin nombre",
    sku:          (meta.sku          as string | null) ?? null,
    templateId:   (meta.templateId   as string)  ?? "",
    templateName: (meta.templateName as string)  ?? "",
    tenantPreset: (meta.tenantPreset as string | null) ?? null,
    status:       (row.status        as LandingDraftStatus) ?? "borrador",
    source:       (meta.source       as LandingDraftSource) ?? "auto_single",
    blocks:       (meta.blocks       as LandingDraftBlock[]) ?? [],
    assetsUsed:   (meta.assetsUsed   as LandingDraftAssetRef[]) ?? [],
    generatedAt:  (meta.generatedAt  as string) ?? (row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)),
    updatedAt:    row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? row.createdAt),
    createdBy:    (meta.createdBy    as string) ?? "sistema",
    orgId:        row.tenantId ?? "",
  };
}

// ── createLandingDraft ───────────────────────────────────────────────────────

/**
 * Persists a landing draft. Checks for existing draft for the same product
 * to avoid duplicates.
 */
export async function createLandingDraft(
  orgId: string,
  draft: LandingDraft,
): Promise<LandingDraft> {
  // Check for existing non-archived draft for same product
  const existing = await execDb().findFirst({
    where: {
      tenantId:  orgId,
      module:    MODULE,
      operation: OPERATION,
      status:    { notIn: ["archivado", "rechazado"] },
      metadataJson: { path: ["productId"], equals: draft.productId },
    },
  });

  if (existing) {
    // Return existing draft instead of creating duplicate
    return rowToDraft(existing);
  }

  const row = await execDb().create({
    data: {
      tenantId:     orgId,
      module:       MODULE,
      operation:    OPERATION,
      action:       `landing_${draft.source}`,
      status:       draft.status,
      createdBy:    draft.createdBy,
      metadataJson: draftToMeta(draft),
    },
  });

  return rowToDraft(row);
}

// ── getLandingDraft ──────────────────────────────────────────────────────────

export async function getLandingDraft(
  orgId:   string,
  draftId: string,
): Promise<LandingDraft | null> {
  const row = await execDb().findFirst({
    where: {
      id:        draftId,
      tenantId:  orgId,
      module:    MODULE,
      operation: OPERATION,
    },
  });

  return row ? rowToDraft(row) : null;
}

// ── listLandingDrafts ────────────────────────────────────────────────────────

export async function listLandingDrafts(
  orgId: string,
): Promise<LandingDraft[]> {
  const rows = await execDb().findMany({
    where: {
      tenantId:  orgId,
      module:    MODULE,
      operation: OPERATION,
      status:    { notIn: ["archivado"] },
    },
    orderBy: { createdAt: "desc" },
    take:    100,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => rowToDraft(r));
}

// ── updateLandingDraft ──────────────────────────────────────────────────────

export async function updateLandingDraft(
  orgId:   string,
  draftId: string,
  updates: Partial<Pick<LandingDraft, "blocks" | "status" | "productName">>,
): Promise<LandingDraft | null> {
  const existing = await getLandingDraft(orgId, draftId);
  if (!existing) return null;

  const newMeta = draftToMeta({
    ...existing,
    ...updates,
  });

  const row = await execDb().update({
    where: { id: draftId },
    data: {
      status:       updates.status ?? existing.status,
      metadataJson: newMeta,
    },
  });

  return rowToDraft(row);
}

// ── Status transitions ───────────────────────────────────────────────────────

export async function markLandingDraftInReview(
  orgId: string, draftId: string,
): Promise<LandingDraft | null> {
  return updateLandingDraft(orgId, draftId, { status: "en_revision" });
}

export async function markLandingDraftApproved(
  orgId: string, draftId: string,
): Promise<LandingDraft | null> {
  return updateLandingDraft(orgId, draftId, { status: "aprobado" });
}

export async function markLandingDraftRejected(
  orgId: string, draftId: string,
): Promise<LandingDraft | null> {
  return updateLandingDraft(orgId, draftId, { status: "rechazado" });
}

export async function archiveLandingDraft(
  orgId: string, draftId: string,
): Promise<LandingDraft | null> {
  return updateLandingDraft(orgId, draftId, { status: "archivado" });
}
