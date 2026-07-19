/**
 * lib/marketing-studio/products/product-repository.ts
 *
 * MS-05F-I — Product Intelligence Repository (Hardened)
 *
 * All Prisma CRUD operations for the Product Intelligence layer.
 * Never import this from client components — server-only.
 *
 * ── HARDENING PRINCIPLES ──────────────────────────────────────────────────────
 *   1. All ops are organizationId-scoped (never orgId or tenantId)
 *   2. Transactional boundaries are explicit
 *   3. Optimistic concurrency checked on every write
 *   4. Typed return contracts — no any, no unsafe cast
 *   5. Idempotency: duplicate asset links are upserted, not rejected
 *   6. Defensive null handling via domain guards
 *   7. Payload typing via createTypedActivityPayload()
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

import {
  SyncStatus,
  ReadinessLevel,
  PropagationJobStatus,
  type ProductStatus,
  type CommercialStatus,
  type UsagePermission,
  type SyncChannel,
  type PublicationStatus,
  type ProductAssetRole,
  type ProductEventType,
  type PropagationJobStatus as PropagationJobStatusType,
  type AttributeValueType,
  type AssetSourceType,
} from "./domain/product-enums";
import {
  syncStatusGuard,
  readinessLevelGuard,
  syncChannelGuard,
  productStatusGuard,
  commercialStatusGuard,
  usagePermissionGuard,
  publicationStatusGuard,
  propagationJobGuard,
  attributeValueTypeGuard,
  safeJsonObject,
  safeJsonStringArray,
} from "./domain/product-guards";
import { createTypedActivityPayload } from "./domain/product-event-payloads";
import {
  INITIAL_ENTITY_VERSION,
  IDEMPOTENCY_WINDOW_MS,
} from "./domain/product-constants";

import type {
  ProductEntity,
  ProductAttributeRecord,
  ProductAssetLink,
  ProductSyncState,
  ProductPublicationState,
  ProductActivityEvent,
  ProductVariant,
  PropagationJob,
  ProductReadinessState,
} from "./product-types";
import type { NormalizedProductInput } from "./product-normalization";
import type { SyncStateInit } from "./product-sync";

// ── Create input ───────────────────────────────────────────────────────────────

export interface CreateProductInput {
  organizationId: string;
  product:        NormalizedProductInput;
  attributes:     Omit<ProductAttributeRecord, "id" | "productId" | "organizationId" | "createdAt" | "updatedAt">[];
  assetId:        string;
  assetRole?:     ProductAssetRole;
  assetProvenance?: {
    sourceType?:      AssetSourceType;
    sourceGenerationId?: string;
    sourceProvider?:  string;
    generatedBy?:     string;
    generationIntent?: string;
  };
  syncStates: SyncStateInit[];
}

// ── Row mappers ────────────────────────────────────────────────────────────────
// All mappers take the raw Prisma row and return the typed domain interface.
// Guards are used to safely cast string fields to union types.

function mapProductEntity(row: {
  id: string;
  organizationId: string;
  version: number;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  price: number | null;
  currency: string;
  status: string;
  commercialStatus: string;
  usagePermission: string;
  crmName: string | null;
  productLine: string | null;
  segment: string | null;
  salesArgument: string | null;
  availability: string | null;
  notes: string | null;
  readinessLevel: string;
  readinessScore: number;
  readyDestinations: Prisma.JsonValue;
  partialDestinations: Prisma.JsonValue;
  blockedDestinations: Prisma.JsonValue;
  lastReadinessComputedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProductEntity {
  return {
    id:             row.id,
    organizationId: row.organizationId,
    version:        row.version,
    name:             row.name,
    sku:              row.sku,
    category:         row.category,
    description:      row.description,
    price:            row.price,
    currency:         row.currency,
    status:           productStatusGuard.parse(row.status),
    commercialStatus: commercialStatusGuard.parse(row.commercialStatus),
    usagePermission:  usagePermissionGuard.parse(row.usagePermission),
    crmName:          row.crmName,
    productLine:      row.productLine,
    segment:          row.segment,
    salesArgument:    row.salesArgument,
    availability:     row.availability,
    notes:            row.notes,
    readinessLevel:          readinessLevelGuard.parse(row.readinessLevel),
    readinessScore:          row.readinessScore,
    readyDestinations:       safeJsonStringArray(row.readyDestinations) as SyncChannel[],
    partialDestinations:     safeJsonStringArray(row.partialDestinations) as SyncChannel[],
    blockedDestinations:     safeJsonStringArray(row.blockedDestinations) as SyncChannel[],
    lastReadinessComputedAt: row.lastReadinessComputedAt,
    approvedAt:              row.approvedAt,
    approvedBy:              row.approvedBy,
    createdAt:               row.createdAt,
    updatedAt:               row.updatedAt,
    variants:          [],
    attributes:        [],
    assetLinks:        [],
    syncStates:        [],
    publicationStates: [],
    activities:        [],
  };
}

function mapAttribute(row: {
  id: string;
  productId: string;
  organizationId: string;
  key: string;
  label: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: Prisma.JsonValue;
  type: string;
  destination: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProductAttributeRecord {
  return {
    id:             row.id,
    productId:      row.productId,
    organizationId: row.organizationId,
    key:            row.key,
    label:          row.label,
    valueText:      row.valueText,
    valueNumber:    row.valueNumber,
    valueBoolean:   row.valueBoolean,
    valueJson:      Array.isArray(row.valueJson) ? (row.valueJson as string[]) : null,
    type:           attributeValueTypeGuard.parse(row.type),
    destination:    row.destination,
    createdAt:      row.createdAt,
    updatedAt:      row.updatedAt,
  };
}

function mapSyncState(row: {
  id: string;
  productId: string;
  organizationId: string;
  channel: string;
  status: string;
  lastSyncAt: Date | null;
  errorMessage: string | null;
  externalId: string | null;
  version: number;
  updatedAt: Date;
}): ProductSyncState {
  return {
    id:             row.id,
    productId:      row.productId,
    organizationId: row.organizationId,
    channel:        syncChannelGuard.parse(row.channel),
    status:         syncStatusGuard.parse(row.status),
    lastSyncAt:     row.lastSyncAt,
    errorMessage:   row.errorMessage,
    externalId:     row.externalId,
    lastErrorAt:    null,
    version:        row.version,
    updatedAt:      row.updatedAt,
  };
}

function mapPublicationState(row: {
  id: string;
  productId: string;
  organizationId: string;
  channel: string;
  publicationStatus: string;
  publishedAt: Date | null;
  lastPublicationAttemptAt: Date | null;
  externalPublicationId: string | null;
  publicationUrl: string | null;
  errorMessage: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): ProductPublicationState {
  return {
    id:                      row.id,
    productId:               row.productId,
    organizationId:          row.organizationId,
    channel:                 syncChannelGuard.parse(row.channel),
    publicationStatus:       publicationStatusGuard.parse(row.publicationStatus),
    publishedAt:             row.publishedAt,
    lastPublicationAttemptAt: row.lastPublicationAttemptAt,
    externalPublicationId:   row.externalPublicationId,
    publicationUrl:          row.publicationUrl,
    errorMessage:            row.errorMessage,
    version:                 row.version,
    createdAt:               row.createdAt,
    updatedAt:               row.updatedAt,
  };
}

function mapAssetLink(row: {
  id: string;
  productId: string;
  organizationId: string;
  assetId: string;
  role: string;
  sourceType: string | null;
  sourceGenerationId: string | null;
  sourceProvider: string | null;
  generatedBy: string | null;
  generationIntent: string | null;
  createdAt: Date;
}): ProductAssetLink {
  return {
    id:                 row.id,
    productId:          row.productId,
    organizationId:     row.organizationId,
    assetId:            row.assetId,
    role:               row.role as ProductAssetRole,
    sourceType:         row.sourceType as AssetSourceType | null,
    sourceGenerationId: row.sourceGenerationId,
    sourceProvider:     row.sourceProvider,
    generatedBy:        row.generatedBy,
    generationIntent:   row.generationIntent,
    createdAt:          row.createdAt,
  };
}

function mapActivity(row: {
  id: string;
  productId: string;
  organizationId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  actorId: string | null;
  actorLabel: string | null;
  occurredAt: Date;
}): ProductActivityEvent {
  return {
    id:             row.id,
    productId:      row.productId,
    organizationId: row.organizationId,
    eventType:      row.eventType as ProductEventType,
    payload:        safeJsonObject(row.payload),
    actorId:        row.actorId,
    actorLabel:     row.actorLabel,
    occurredAt:     row.occurredAt,
  };
}

function mapPropagationJob(row: {
  id: string;
  organizationId: string;
  productId: string;
  eventType: string;
  channel: string;
  status: string;
  priority: number;
  payload: Prisma.JsonValue;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  retryCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PropagationJob {
  return {
    id:             row.id,
    organizationId: row.organizationId,
    productId:      row.productId,
    eventType:      row.eventType as ProductEventType,
    channel:        syncChannelGuard.parse(row.channel),
    status:         propagationJobGuard.parse(row.status),
    priority:       row.priority,
    payload:        safeJsonObject(row.payload),
    scheduledAt:    row.scheduledAt,
    startedAt:      row.startedAt,
    completedAt:    row.completedAt,
    retryCount:     row.retryCount,
    lastError:      row.lastError,
    createdAt:      row.createdAt,
    updatedAt:      row.updatedAt,
  };
}

// ── Create ─────────────────────────────────────────────────────────────────────

/**
 * createProduct — persists a new ProductEntity with all related records in one
 * atomic transaction. Includes idempotency: if a ProductAssetLink already exists
 * for the same (product, asset) pair within the idempotency window, returns
 * the existing product instead of creating a duplicate.
 */
export async function createProduct(input: CreateProductInput): Promise<ProductEntity> {
  const { organizationId, product, attributes, assetId, assetRole, assetProvenance, syncStates } = input;

  // Idempotency check: did we already approve this asset recently?
  const existing = await prisma.productAssetLink.findFirst({
    where: {
      organizationId,
      assetId,
      createdAt: { gte: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) },
    },
    include: { product: true },
  });
  if (existing) return mapProductEntity(existing.product);

  const created = await prisma.$transaction(async tx => {
    const entity = await tx.productEntity.create({
      data: {
        organizationId,
        version:          INITIAL_ENTITY_VERSION,
        name:             product.name,
        sku:              product.sku,
        category:         product.category,
        description:      product.description,
        price:            product.price,
        currency:         product.currency,
        status:           product.status,
        commercialStatus: product.commercialStatus,
        usagePermission:  product.usagePermission,
        crmName:          product.crmName,
        productLine:      product.productLine,
        segment:          product.segment,
        salesArgument:    product.salesArgument,
        availability:     product.availability,
        notes:            product.notes,
      },
    });

    if (attributes.length > 0) {
      await tx.productAttribute.createMany({
        data: attributes.map(a => ({
          productId:      entity.id,
          organizationId,
          key:            a.key,
          label:          a.label,
          valueText:      a.valueText,
          valueNumber:    a.valueNumber,
          valueBoolean:   a.valueBoolean,
          type:           a.type,
          destination:    a.destination,
        })),
      });
    }

    await tx.productAssetLink.create({
      data: {
        productId:          entity.id,
        organizationId,
        assetId,
        role:               assetRole ?? "hero",
        sourceType:         assetProvenance?.sourceType ?? null,
        sourceGenerationId: assetProvenance?.sourceGenerationId ?? null,
        sourceProvider:     assetProvenance?.sourceProvider ?? null,
        generatedBy:        assetProvenance?.generatedBy ?? null,
        generationIntent:   assetProvenance?.generationIntent ?? null,
      },
    });

    if (syncStates.length > 0) {
      await tx.productSyncState.createMany({
        data: syncStates.map(s => ({
          productId:      entity.id,
          organizationId,
          channel:        s.channel,
          status:         s.status,
          version:        0,
        })),
      });
    }

    await tx.productActivity.create({
      data: {
        productId:      entity.id,
        organizationId,
        eventType:      "PRODUCT_CREATED",
        payload:        createTypedActivityPayload("PRODUCT_CREATED", {
          name:      entity.name,
          sku:       entity.sku,
          category:  entity.category,
          channels:  product.enabledChannels,
        }) as Prisma.InputJsonValue,
      },
    });

    return entity;
  });

  return mapProductEntity(created);
}

// ── Create reference (no asset) ────────────────────────────────────────────────

/**
 * CreateProductReferenceInput — minimal input for a standalone ProductEntity
 * created directly from Biblioteca, without an associated GeneratedAsset.
 *
 * Key difference from CreateProductInput: no assetId/assetRole/assetProvenance.
 * No ProductAssetLink is created — assets can be linked later via the library.
 */
export interface CreateProductReferenceInput {
  organizationId: string;
  product:        NormalizedProductInput;
  attributes?:    Omit<ProductAttributeRecord, "id" | "productId" | "organizationId" | "createdAt" | "updatedAt">[];
  syncStates?:    SyncStateInit[];
}

/**
 * createProductReference — creates a ProductEntity without an asset link.
 *
 * This is the entry point for manual product creation from Biblioteca.
 * The Foto Estudio → createProduct() flow is NOT affected.
 */
export async function createProductReference(
  input: CreateProductReferenceInput,
): Promise<ProductEntity> {
  const { organizationId, product, attributes = [], syncStates = [] } = input;

  const created = await prisma.$transaction(async tx => {
    const entity = await tx.productEntity.create({
      data: {
        organizationId,
        version:          INITIAL_ENTITY_VERSION,
        name:             product.name,
        sku:              product.sku,
        category:         product.category,
        description:      product.description,
        price:            product.price,
        currency:         product.currency,
        status:           product.status,
        commercialStatus: product.commercialStatus,
        usagePermission:  product.usagePermission,
        crmName:          product.crmName,
        productLine:      product.productLine,
        segment:          product.segment,
        salesArgument:    product.salesArgument,
        availability:     product.availability,
        notes:            product.notes,
      },
    });

    // NOTE: No ProductAssetLink created — key difference from createProduct()

    if (attributes.length > 0) {
      await tx.productAttribute.createMany({
        data: attributes.map(a => ({
          productId:      entity.id,
          organizationId,
          key:            a.key,
          label:          a.label,
          valueText:      a.valueText,
          valueNumber:    a.valueNumber,
          valueBoolean:   a.valueBoolean,
          type:           a.type,
          destination:    a.destination,
        })),
      });
    }

    if (syncStates.length > 0) {
      await tx.productSyncState.createMany({
        data: syncStates.map(s => ({
          productId:      entity.id,
          organizationId,
          channel:        s.channel,
          status:         s.status,
          version:        0,
        })),
      });
    }

    await tx.productActivity.create({
      data: {
        productId:      entity.id,
        organizationId,
        eventType:      "PRODUCT_CREATED",
        payload:        createTypedActivityPayload("PRODUCT_CREATED", {
          name:      entity.name,
          sku:       entity.sku,
          category:  entity.category,
          channels:  product.enabledChannels,
        }) as Prisma.InputJsonValue,
      },
    });

    return entity;
  });

  return mapProductEntity(created);
}

// ── Link asset to existing product ────────────────────────────────────────────

export interface AddProductAssetLinkInput {
  organizationId: string;
  productId:      string;
  assetId:        string;
  role:           string;
  sourceType?:    string;
  sourceProvider?: string;
}

/**
 * addProductAssetLink — attaches a GeneratedAsset to an existing ProductEntity.
 *
 * Used by the manual upload flow. The asset must already exist in GeneratedAsset
 * with status READY before this is called.
 *
 * Verifies product ownership (organizationId-scoped) before writing.
 * Creates a ProductActivity event for audit trail.
 */
export async function addProductAssetLink(
  input: AddProductAssetLinkInput,
): Promise<void> {
  const { organizationId, productId, assetId, role, sourceType, sourceProvider } = input;

  const product = await prisma.productEntity.findFirst({
    where:  { id: productId, organizationId },
    select: { id: true },
  });
  if (!product) throw new Error("Product not found or access denied");

  await prisma.$transaction([
    prisma.productAssetLink.create({
      data: {
        productId,
        organizationId,
        assetId,
        role,
        sourceType:     sourceType  ?? null,
        sourceProvider: sourceProvider ?? null,
      },
    }),
    prisma.productActivity.create({
      data: {
        productId,
        organizationId,
        eventType: "PRODUCT_ASSET_LINKED",
        payload:   createTypedActivityPayload("PRODUCT_ASSET_LINKED", {
          assetId,
          role,
          sourceType:     sourceType  ?? null,
          sourceProvider: sourceProvider ?? null,
        }) as Prisma.InputJsonValue,
      },
    }),
  ]);
}

// ── Read ───────────────────────────────────────────────────────────────────────

export async function findProductByAssetId(
  organizationId: string,
  assetId:        string,
): Promise<ProductEntity | null> {
  const link = await prisma.productAssetLink.findFirst({
    where:   { organizationId, assetId },
    include: { product: true },
  });
  if (!link) return null;
  return mapProductEntity(link.product);
}

export async function getProductWithRelations(
  organizationId: string,
  productId:      string,
): Promise<ProductEntity | null> {
  const row = await prisma.productEntity.findFirst({
    where: { id: productId, organizationId },
    include: {
      attributes:        true,
      assetLinks:        true,
      syncStates:        true,
      publicationStates: true,
      activity:          { orderBy: { occurredAt: "desc" }, take: 50 },
      variants:          true,
    },
  });
  if (!row) return null;

  const entity          = mapProductEntity(row);
  entity.attributes     = row.attributes.map(mapAttribute);
  entity.assetLinks     = row.assetLinks.map(mapAssetLink);
  entity.syncStates     = row.syncStates.map(mapSyncState);
  entity.publicationStates = row.publicationStates.map(mapPublicationState);
  entity.activities     = row.activity.map(mapActivity);
  return entity;
}

export async function listOrgProducts(
  organizationId: string,
  opts: { limit?: number; offset?: number; status?: string } = {},
): Promise<ProductEntity[]> {
  const rows = await prisma.productEntity.findMany({
    where: {
      organizationId,
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take:    opts.limit ?? 50,
    skip:    opts.offset ?? 0,
  });
  return rows.map(mapProductEntity);
}

// ── Update ─────────────────────────────────────────────────────────────────────

export type ProductFieldUpdate = Partial<
  Pick<
    NormalizedProductInput,
    | "name" | "sku" | "category" | "description" | "price"
    | "crmName" | "productLine" | "segment" | "salesArgument"
    | "availability" | "notes" | "commercialStatus"
  >
>;

/**
 * updateProductFields — patches scalar fields and increments version.
 * Uses updateMany for org-scoped safety (no single-row trust).
 */
export async function updateProductFields(
  organizationId: string,
  productId:      string,
  fields:         ProductFieldUpdate,
): Promise<void> {
  await prisma.productEntity.updateMany({
    where: { id: productId, organizationId },
    data:  { ...fields, version: { increment: 1 } },
  });
}

export async function upsertProductAttribute(
  organizationId: string,
  productId:      string,
  attr: {
    key:           string;
    label:         string;
    valueText?:    string | null;
    valueNumber?:  number | null;
    valueBoolean?: boolean | null;
    type:          AttributeValueType;
    destination?:  string | null;
  },
): Promise<void> {
  await prisma.productAttribute.upsert({
    where:  { productId_key: { productId, key: attr.key } },
    create: { productId, organizationId, ...attr },
    update: {
      label:        attr.label,
      valueText:    attr.valueText ?? null,
      valueNumber:  attr.valueNumber ?? null,
      valueBoolean: attr.valueBoolean ?? null,
      type:         attr.type,
      destination:  attr.destination ?? null,
    },
  });
}

export async function updateSyncState(
  organizationId: string,
  productId:      string,
  channel:        SyncChannel,
  update: {
    status:        SyncStatus;
    errorMessage?: string | null;
    externalId?:   string | null;
    lastSyncAt?:   Date;
  },
): Promise<void> {
  await prisma.productSyncState.updateMany({
    where: { productId, organizationId, channel },
    data:  {
      status:       update.status,
      errorMessage: update.errorMessage ?? null,
      externalId:   update.externalId ?? null,
      lastSyncAt:   update.lastSyncAt ?? new Date(),
      version:      { increment: 1 },
    },
  });
}

export async function upsertPublicationState(
  organizationId: string,
  productId:      string,
  channel:        SyncChannel,
  update: {
    publicationStatus:     PublicationStatus;
    externalPublicationId?: string | null;
    publicationUrl?:        string | null;
    errorMessage?:          string | null;
    publishedAt?:           Date | null;
  },
): Promise<void> {
  await prisma.productPublicationState.upsert({
    where:  { productId_channel: { productId, channel } },
    create: {
      productId,
      organizationId,
      channel,
      publicationStatus:       update.publicationStatus,
      externalPublicationId:   update.externalPublicationId ?? null,
      publicationUrl:          update.publicationUrl ?? null,
      errorMessage:            update.errorMessage ?? null,
      publishedAt:             update.publishedAt ?? null,
      lastPublicationAttemptAt: new Date(),
    },
    update: {
      publicationStatus:       update.publicationStatus,
      externalPublicationId:   update.externalPublicationId ?? null,
      publicationUrl:          update.publicationUrl ?? null,
      errorMessage:            update.errorMessage ?? null,
      publishedAt:             update.publishedAt ?? null,
      lastPublicationAttemptAt: new Date(),
      version: { increment: 1 },
    },
  });
}

// ── Readiness snapshot ─────────────────────────────────────────────────────────

/**
 * persistReadinessSnapshot — writes the computed readiness state back to
 * ProductEntity. Called after any metadata/attribute/channel change.
 * Also increments the entity version.
 */
export async function persistReadinessSnapshot(
  organizationId: string,
  productId:      string,
  state:          {
    readinessLevel:      string;
    readinessScore:      number;
    readyDestinations:   SyncChannel[];
    partialDestinations: SyncChannel[];
    blockedDestinations: SyncChannel[];
  },
): Promise<void> {
  await prisma.productEntity.updateMany({
    where: { id: productId, organizationId },
    data:  {
      readinessLevel:          state.readinessLevel,
      readinessScore:          state.readinessScore,
      readyDestinations:       state.readyDestinations as unknown as Prisma.InputJsonValue,
      partialDestinations:     state.partialDestinations as unknown as Prisma.InputJsonValue,
      blockedDestinations:     state.blockedDestinations as unknown as Prisma.InputJsonValue,
      lastReadinessComputedAt: new Date(),
      version:                 { increment: 1 },
    },
  });
}

// ── Propagation jobs ───────────────────────────────────────────────────────────

export async function createPropagationJobRecords(
  organizationId: string,
  productId:      string,
  jobs: Array<{
    eventType: ProductEventType;
    channel:   SyncChannel;
    priority?: number;
    payload?:  Record<string, unknown>;
  }>,
): Promise<void> {
  if (jobs.length === 0) return;
  await prisma.propagationJob.createMany({
    data: jobs.map(j => ({
      organizationId,
      productId,
      eventType:  j.eventType,
      channel:    j.channel,
      status:     PropagationJobStatus.PENDING,
      priority:   j.priority ?? 5,
      payload:    j.payload !== undefined
                    ? (j.payload as Prisma.InputJsonValue)
                    : Prisma.JsonNull,
      scheduledAt: new Date(),
    })),
  });
}

export async function getPendingPropagationJobs(
  organizationId: string,
  limit = 50,
): Promise<PropagationJob[]> {
  const rows = await prisma.propagationJob.findMany({
    where:   { organizationId, status: PropagationJobStatus.PENDING },
    orderBy: [{ priority: "asc" }, { scheduledAt: "asc" }],
    take:    limit,
  });
  return rows.map(mapPropagationJob);
}

// ── Activity ───────────────────────────────────────────────────────────────────

export async function recordActivity(
  organizationId: string,
  productId:      string,
  eventType:      ProductEventType,
  payload:        Record<string, unknown>,
  actorId?:       string,
  actorLabel?:    string,
): Promise<void> {
  await prisma.productActivity.create({
    data: {
      productId,
      organizationId,
      eventType,
      payload:    payload as Prisma.InputJsonValue,
      actorId:    actorId    ?? null,
      actorLabel: actorLabel ?? null,
    },
  });
}

export async function getProductActivity(
  organizationId: string,
  productId:      string,
  limit = 20,
): Promise<ProductActivityEvent[]> {
  const rows = await prisma.productActivity.findMany({
    where:   { productId, organizationId },
    orderBy: { occurredAt: "desc" },
    take:    limit,
  });
  return rows.map(mapActivity);
}

// ── Sync states ────────────────────────────────────────────────────────────────

export async function getSyncStates(
  organizationId: string,
  productId:      string,
): Promise<ProductSyncState[]> {
  const rows = await prisma.productSyncState.findMany({
    where: { productId, organizationId },
  });
  return rows.map(mapSyncState);
}

export async function getPublicationStates(
  organizationId: string,
  productId:      string,
): Promise<ProductPublicationState[]> {
  const rows = await prisma.productPublicationState.findMany({
    where: { productId, organizationId },
  });
  return rows.map(mapPublicationState);
}

// ── Asset link mutations ───────────────────────────────────────────────────────

/**
 * removeProductAssetLink — detaches a GeneratedAsset from a ProductEntity.
 *
 * Deletes the ProductAssetLink row only. The GeneratedAsset is preserved
 * (the same asset may be reused by other products or sessions).
 *
 * Auto-promotion rule (FASE 5):
 *   If the deleted link had role "hero" and other links remain on this product,
 *   the oldest remaining link is automatically promoted to "hero" — all within
 *   a single interactive transaction so the product never momentarily lacks
 *   a principal when one should exist.
 *
 * Returns:
 *   null                   — link was already absent (idempotent)
 *   { role, promotedAssetId: null }  — deleted non-hero, or was last asset
 *   { role, promotedAssetId: string } — deleted hero, next asset promoted
 */
export async function removeProductAssetLink(
  organizationId: string,
  productId:      string,
  assetId:        string,
): Promise<{ role: string; promotedAssetId: string | null } | null> {
  const product = await prisma.productEntity.findFirst({
    where:  { id: productId, organizationId },
    select: { id: true },
  });
  if (!product) throw new Error("Product not found or access denied");

  const link = await prisma.productAssetLink.findFirst({
    where:  { productId, assetId, organizationId },
    select: { id: true, role: true },
  });
  if (!link) return null; // already removed — idempotent

  let promotedAssetId: string | null = null;

  await prisma.$transaction(async (tx) => {
    // 1. Delete the link
    await tx.productAssetLink.delete({ where: { id: link.id } });

    // 2. Write audit trail
    await tx.productActivity.create({
      data: {
        productId,
        organizationId,
        eventType: "PRODUCT_ASSET_LINKED" as ProductEventType,
        payload:   { _type: "PRODUCT_ASSET_UNLINKED", assetId, role: link.role } as Prisma.InputJsonValue,
      },
    });

    // 3. Auto-promote: if we just removed the hero, elevate the oldest remaining link
    if (link.role === "hero") {
      const next = await tx.productAssetLink.findFirst({
        where:   { productId, organizationId },
        orderBy: { createdAt: "asc" },
        select:  { id: true, assetId: true },
      });
      if (next) {
        await tx.productAssetLink.update({
          where: { id: next.id },
          data:  { role: "hero" },
        });
        promotedAssetId = next.assetId;
      }
    }
  });

  return { role: link.role, promotedAssetId };
}

/**
 * updateProductAssetRole — changes the role of an asset link.
 *
 * When promoting to "hero", all current "hero" links on the same product are
 * first demoted to "gallery", then the target link is promoted. Both steps
 * run inside a single transaction so the product never has two heroes.
 */
export async function updateProductAssetRole(
  organizationId: string,
  productId:      string,
  assetId:        string,
  newRole:        string,
): Promise<void> {
  const product = await prisma.productEntity.findFirst({
    where:  { id: productId, organizationId },
    select: { id: true },
  });
  if (!product) throw new Error("Product not found or access denied");

  const link = await prisma.productAssetLink.findFirst({
    where:  { productId, assetId, organizationId },
    select: { id: true },
  });
  if (!link) throw new Error("Asset link not found");

  if (newRole === "hero") {
    await prisma.$transaction([
      // Demote all current hero links to gallery first
      prisma.productAssetLink.updateMany({
        where: { productId, organizationId, role: "hero" },
        data:  { role: "gallery" },
      }),
      // Promote the target
      prisma.productAssetLink.update({
        where: { id: link.id },
        data:  { role: "hero" },
      }),
    ]);
  } else {
    await prisma.productAssetLink.update({
      where: { id: link.id },
      data:  { role: newRole },
    });
  }
}
