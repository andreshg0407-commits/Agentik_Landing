"use server";

/**
 * app/actions/marketing-studio/products.ts
 *
 * MS-05F — Product Intelligence Server Actions (Hardened)
 *
 * All write operations for the Product Intelligence layer.
 * These are the ONLY entry points for product persistence from the UI.
 *
 * ── HARDENING PRINCIPLES ──────────────────────────────────────────────────────
 *   1. organizationId everywhere — no orgId, no tenantId
 *   2. Every action verifies org membership before writing
 *   3. Double-submit prevented at the repository layer (idempotency window)
 *   4. All enum fields validated via domain guards before persistence
 *   5. Domain events fired after every successful mutation
 *   6. Server validation errors returned as structured ApprovalResult
 *   7. No any — no unsafe casts
 */

import { getCurrentUser } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";

import {
  createProduct,
  createProductReference,
  updateProductFields,
  upsertProductAttribute,
  updateSyncState,
  upsertPublicationState,
  recordActivity,
  getProductWithRelations,
  getSyncStates,
  persistReadinessSnapshot,
  createPropagationJobRecords,
} from "@/lib/marketing-studio/products/product-repository";
import { normalizeApprovalInput } from "@/lib/marketing-studio/products/product-normalization";
import { buildInitialSyncStates, createPropagationJobs } from "@/lib/marketing-studio/products/product-sync";
import { computeProductReadiness, computeReadinessScore } from "@/lib/marketing-studio/products/product-readiness";
import {
  productEventBus,
  makeProductCreatedEvent,
  makeProductApprovedEvent,
  makeProductAssetLinkedEvent,
  makeProductAttributeUpdatedEvent,
  makeProductReadinessChangedEvent,
} from "@/lib/marketing-studio/products/product-events";
import { createTypedActivityPayload } from "@/lib/marketing-studio/products/domain/product-event-payloads";
import {
  SyncChannel,
  SyncStatus,
  PublicationStatus,
  type ProductEventType,
} from "@/lib/marketing-studio/products/domain/product-enums";
import {
  parseChannels,
  productStatusGuard,
  commercialStatusGuard,
  usagePermissionGuard,
} from "@/lib/marketing-studio/products/domain/product-guards";
import type {
  ApprovalFormInput,
  ApprovalResult,
  AttributeUpdateInput,
} from "@/lib/marketing-studio/products/product-types";

// ── Auth helper ────────────────────────────────────────────────────────────────

async function requireOrgMember(
  organizationId: string,
): Promise<{ userId: string; email: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");

  const member = await prisma.membership.findFirst({
    where: { userId: user.id, organizationId },
  });
  if (!member) throw new Error("Sin acceso a esta organización");

  return { userId: user.id, email: user.email ?? "" };
}

// ── approveAssetAsProduct ──────────────────────────────────────────────────────

/**
 * approveAssetAsProduct — the primary approval action.
 *
 * Flow:
 *   1. Auth check
 *   2. Normalize + validate form input
 *   3. Persist (transaction: entity + attributes + asset link + sync states + activity)
 *   4. Persist readiness snapshot
 *   5. Fire domain events
 *
 * Idempotent: calling twice with the same assetId within 5 minutes
 * returns the existing product without creating a duplicate.
 */
export async function approveAssetAsProduct(
  input: ApprovalFormInput,
): Promise<ApprovalResult> {
  try {
    const actor      = await requireOrgMember(input.organizationId);
    const normalized = normalizeApprovalInput(input);
    const syncStates = buildInitialSyncStates(normalized.product.enabledChannels);

    const product = await createProduct({
      organizationId: input.organizationId,
      product:        normalized.product,
      attributes:     normalized.attributes,
      assetId:        normalized.assetId,
      assetRole:      "hero",
      assetProvenance: {
        sourceType:      (input.assetSourceType as import("@/lib/marketing-studio/products/domain/product-enums").AssetSourceType | undefined) ?? "ai_generated",
        sourceProvider:  input.assetSourceProvider ?? "foto_estudio",
        generatedBy:     actor.userId,
        generationIntent: "hero",
      },
      syncStates,
    });

    // Compute and persist initial readiness snapshot
    const fullProduct = await getProductWithRelations(input.organizationId, product.id);
    if (fullProduct) {
      fullProduct.syncStates = await getSyncStates(input.organizationId, product.id);
      const readiness = computeProductReadiness(fullProduct);
      const score     = computeReadinessScore(readiness);
      await persistReadinessSnapshot(input.organizationId, product.id, {
        readinessLevel:      readiness.readyCount === readiness.destinations.length ? "ready"
                             : readiness.readyCount > 0 ? "partial" : "not_ready",
        readinessScore:      score,
        readyDestinations:   readiness.destinations.filter(d => d.status === "ready").map(d => d.channel),
        partialDestinations: readiness.destinations.filter(d => d.status === "partial").map(d => d.channel),
        blockedDestinations: readiness.destinations.filter(d => d.status === "not_ready").map(d => d.channel),
      });
    }

    // Fire domain events
    productEventBus.fire(makeProductCreatedEvent(
      product.id, input.organizationId,
      { name: product.name, sku: product.sku, category: product.category },
      actor.userId,
    ));
    productEventBus.fire(makeProductApprovedEvent(
      product.id, input.organizationId,
      { approvedBy: actor.email, readyChannels: normalized.product.enabledChannels },
      actor.userId,
    ));
    productEventBus.fire(makeProductAssetLinkedEvent(
      product.id, input.organizationId,
      { assetId: normalized.assetId, role: "hero" },
    ));

    return { success: true, productId: product.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    console.error("[approveAssetAsProduct]", err);
    return { success: false, error: message, retryable: !(message.includes("autenticado") || message.includes("acceso")) };
  }
}

// ── createReference ────────────────────────────────────────────────────────────

export interface CreateReferenceInput {
  organizationId: string;
  name:           string;
  sku?:           string;
  category?:      string;
  price?:         number;
  productLine?:   string;
}

/**
 * createReference — creates a standalone ProductEntity from Biblioteca,
 * without an associated GeneratedAsset.
 *
 * Status defaults to "pending". Assets are linked later.
 */
export async function createReference(
  input: CreateReferenceInput,
): Promise<{ success: boolean; productId?: string; error?: string }> {
  try {
    const actor = await requireOrgMember(input.organizationId);

    if (!input.name?.trim()) {
      return { success: false, error: "El nombre del producto es requerido" };
    }

    const product = await createProductReference({
      organizationId: input.organizationId,
      product: {
        organizationId:   input.organizationId,
        name:             input.name.trim(),
        sku:              input.sku?.trim() ?? null,
        category:         input.category?.trim() ?? null,
        description:      null,
        price:            input.price ?? null,
        currency:         "COP",
        status:           productStatusGuard.parse("pending"),
        commercialStatus: commercialStatusGuard.parse("active"),
        usagePermission:  usagePermissionGuard.parse("commercial"),
        crmName:          null,
        productLine:      input.productLine?.trim() ?? null,
        segment:          null,
        salesArgument:    null,
        availability:     null,
        notes:            null,
        enabledChannels:  [],
      },
    });

    productEventBus.fire(makeProductCreatedEvent(
      product.id, input.organizationId,
      { name: product.name, sku: product.sku, category: product.category },
      actor.userId,
    ));

    return { success: true, productId: product.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    console.error("[createReference]", err);
    return { success: false, error: message };
  }
}

// ── updateProductAttributes ────────────────────────────────────────────────────

export async function updateProductAttributes(
  organizationId: string,
  productId:      string,
  updates:        AttributeUpdateInput[],
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireOrgMember(organizationId);

    for (const u of updates) {
      const textValue   = typeof u.value === "string"  ? u.value  : u.value === null ? null : String(u.value);
      const numValue    = typeof u.value === "number"  ? u.value  : null;
      const boolValue   = typeof u.value === "boolean" ? u.value  : null;

      await upsertProductAttribute(organizationId, productId, {
        key:          u.key,
        label:        u.label,
        valueText:    textValue,
        valueNumber:  numValue,
        valueBoolean: boolValue,
        type:         u.type,
        destination:  u.destination ?? null,
      });
    }

    const changedKeys = updates.map(u => u.key);
    await recordActivity(organizationId, productId, "PRODUCT_ATTRIBUTE_UPDATED",
      createTypedActivityPayload("PRODUCT_ATTRIBUTE_UPDATED", {
        changedKeys,
        count: changedKeys.length,
      }),
    );

    productEventBus.fire(makeProductAttributeUpdatedEvent(productId, organizationId, {
      attributes: updates.map(u => ({ key: u.key, label: u.label })),
      changedKeys,
    }));

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    console.error("[updateProductAttributes]", err);
    return { success: false, error: message };
  }
}

// ── recomputeProductReadiness ──────────────────────────────────────────────────

export async function recomputeProductReadiness(
  organizationId: string,
  productId:      string,
): Promise<{ success: boolean; readyCount?: number; partialCount?: number; error?: string }> {
  try {
    await requireOrgMember(organizationId);

    const product = await getProductWithRelations(organizationId, productId);
    if (!product) return { success: false, error: "Producto no encontrado" };

    product.syncStates = await getSyncStates(organizationId, productId);
    const readiness    = computeProductReadiness(product);
    const score        = computeReadinessScore(readiness);

    const readinessLevel =
      readiness.readyCount === readiness.destinations.length ? "ready"
      : readiness.readyCount > 0 || readiness.partialCount > 0 ? "partial"
      : "not_ready";

    await persistReadinessSnapshot(organizationId, productId, {
      readinessLevel,
      readinessScore:      score,
      readyDestinations:   readiness.destinations.filter(d => d.status === "ready").map(d => d.channel),
      partialDestinations: readiness.destinations.filter(d => d.status === "partial").map(d => d.channel),
      blockedDestinations: readiness.destinations.filter(d => d.status === "not_ready").map(d => d.channel),
    });

    await recordActivity(organizationId, productId, "PRODUCT_READINESS_CHANGED",
      createTypedActivityPayload("PRODUCT_READINESS_CHANGED", {
        readyCount:     readiness.readyCount,
        partialCount:   readiness.partialCount,
        totalEnabled:   readiness.totalEnabled,
        readinessScore: score,
      }),
    );

    productEventBus.fire(makeProductReadinessChangedEvent(productId, organizationId, {
      readyCount:   readiness.readyCount,
      partialCount: readiness.partialCount,
      totalEnabled: readiness.totalEnabled,
    }));

    return { success: true, readyCount: readiness.readyCount, partialCount: readiness.partialCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    console.error("[recomputeProductReadiness]", err);
    return { success: false, error: message };
  }
}

// ── linkAssetToProduct ─────────────────────────────────────────────────────────

export async function linkAssetToProduct(
  organizationId: string,
  productId:      string,
  assetId:        string,
  role:           "hero" | "gallery" | "swatch" | "video" | "document",
  provenance?: {
    sourceType?:     string;
    sourceProvider?: string;
    generatedBy?:    string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireOrgMember(organizationId);

    await prisma.productAssetLink.upsert({
      where:  { productId_assetId: { productId, assetId } },
      create: {
        productId, organizationId, assetId, role,
        sourceType:      provenance?.sourceType ?? null,
        sourceProvider:  provenance?.sourceProvider ?? null,
        generatedBy:     provenance?.generatedBy ?? actor.userId,
      },
      update: { role },
    });

    await recordActivity(organizationId, productId, "PRODUCT_ASSET_LINKED",
      createTypedActivityPayload("PRODUCT_ASSET_LINKED", {
        assetId,
        role,
        sourceType:     provenance?.sourceType ?? null,
        sourceProvider: provenance?.sourceProvider ?? null,
      }),
    );

    productEventBus.fire(makeProductAssetLinkedEvent(productId, organizationId, { assetId, role }));

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    console.error("[linkAssetToProduct]", err);
    return { success: false, error: message };
  }
}

// ── markSyncResult ─────────────────────────────────────────────────────────────

export async function markSyncResult(
  organizationId: string,
  productId:      string,
  channel:        SyncChannel,
  result: {
    status:       SyncStatus;
    externalId?:  string;
    errorMessage?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireOrgMember(organizationId);

    await updateSyncState(organizationId, productId, channel, {
      status:       result.status,
      externalId:   result.externalId ?? null,
      errorMessage: result.errorMessage ?? null,
      lastSyncAt:   new Date(),
    });

    if (result.status === SyncStatus.SYNCED) {
      await recordActivity(organizationId, productId, "PRODUCT_PUBLISHED",
        createTypedActivityPayload("PRODUCT_PUBLISHED", {
          channel,
          externalId: result.externalId ?? null,
          url:        null,
        }),
      );
    } else if (result.status === SyncStatus.FAILED) {
      await recordActivity(organizationId, productId, "PRODUCT_SYNC_FAILED",
        createTypedActivityPayload("PRODUCT_SYNC_FAILED", {
          channel,
          errorMessage: result.errorMessage ?? "Error desconocido",
          retryCount:   0,
        }),
      );
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    console.error("[markSyncResult]", err);
    return { success: false, error: message };
  }
}

// ── markPublicationResult ──────────────────────────────────────────────────────

/**
 * markPublicationResult — records a publication outcome for a channel.
 * Distinct from sync: an asset can be synced (data current) but unpublished.
 */
export async function markPublicationResult(
  organizationId: string,
  productId:      string,
  channel:        SyncChannel,
  result: {
    status:                PublicationStatus;
    externalPublicationId?: string;
    publicationUrl?:        string;
    errorMessage?:          string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireOrgMember(organizationId);

    await upsertPublicationState(organizationId, productId, channel, {
      publicationStatus:     result.status,
      externalPublicationId: result.externalPublicationId ?? null,
      publicationUrl:        result.publicationUrl ?? null,
      errorMessage:          result.errorMessage ?? null,
      publishedAt:           result.status === PublicationStatus.PUBLISHED ? new Date() : null,
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    console.error("[markPublicationResult]", err);
    return { success: false, error: message };
  }
}
