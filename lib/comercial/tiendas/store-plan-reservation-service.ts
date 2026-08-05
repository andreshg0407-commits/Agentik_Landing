/**
 * lib/comercial/tiendas/store-plan-reservation-service.ts
 *
 * AGENTIK-STORES-SUPPLY-PLAN-RESERVATION-01 — Store Plan Reservation Service.
 *
 * Bridges StoreReplenishmentDocument → OperationalReservation.
 *
 * ─── DESIGN ──────────────────────────────────────────────────────────────────
 *   - sourceType = "store_plan"
 *   - sourceId   = replenishment document ID
 *   - One OperationalReservation per suggestion reference per document
 *   - Aggregates units across multiple suggestions for the same reference
 *   - Source warehouse PER ITEM: textile → B10, import → B33
 *   - Advisory locks per reference (sorted, prevents deadlocks)
 *   - Idempotent: re-reserving the same document = no-op if already RESERVADO
 *   - Atomic: reservation + document transition in one transaction
 *
 * ─── LIFECYCLE ───────────────────────────────────────────────────────────────
 *   BORRADOR → RESERVAR → RESERVADO (creates OperationalReservations)
 *   RESERVADO → LIBERAR_RESERVA → BORRADOR (releases all reservations)
 *   RESERVADO → CANCELAR → CANCELADO (cancels all reservations)
 *   RESERVADO → APROBAR → APROBADO (reservations stay active)
 *
 * SERVER ONLY.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveTransition } from "./store-replenishment-workflow-engine";
import type { ReplenishmentDocumentSnapshot } from "./store-replenishment-document-types";
import type { ReplenishmentSuggestion } from "./store-replenishment-allocation-engine";

const db = prisma as any;

// ── Constants ────────────────────────────────────────────────────────────────

/** TTL for store plan reservations: 72 hours (generous for dispatch workflow). */
const STORE_PLAN_RESERVATION_TTL_SEC = 72 * 3600;

// ── Result types ─────────────────────────────────────────────────────────────

export interface StorePlanReservationResult {
  documentId: string;
  documentNumber: string;
  storeId: string;
  reservationsCreated: number;
  totalUnitsReserved: number;
  /** References that could not be reserved (insufficient availability). */
  warnings: string[];
  /** If true, the document was already RESERVADO — idempotent no-op. */
  alreadyReserved: boolean;
}

export interface StorePlanReleaseResult {
  documentId: string;
  documentNumber: string;
  storeId: string;
  reservationsReleased: number;
  totalUnitsReleased: number;
}

// ── Reserve ──────────────────────────────────────────────────────────────────

/**
 * Reserves inventory for a store replenishment document.
 *
 * 1. Validates document exists, belongs to org, and is in BORRADOR status.
 * 2. Aggregates suggestion references with quantities.
 * 3. Acquires advisory locks per reference (sorted).
 * 4. Revalidates availability inside the transaction.
 * 5. Creates OperationalReservation records.
 * 6. Transitions document to RESERVADO.
 * 7. Records workflow event.
 *
 * Idempotent: if document is already RESERVADO, returns without changes.
 */
export async function reserveStorePlan(
  orgId: string,
  documentId: string,
  actorId: string,
  actorDisplayName?: string,
): Promise<StorePlanReservationResult> {
  // Pre-flight: load document outside transaction to validate
  const doc = await db.storeReplenishmentDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
  });

  if (!doc) {
    throw new Error(`[STORE-PLAN-RESERVATION] Documento ${documentId} no encontrado.`);
  }

  // Idempotent: if already RESERVADO, return no-op
  if (doc.status === "RESERVADO") {
    const existingCount = await db.operationalReservation.count({
      where: { organizationId: orgId, sourceType: "store_plan", sourceId: documentId, status: "active" },
    });
    return {
      documentId,
      documentNumber: doc.documentNumber,
      storeId: doc.storeId,
      reservationsCreated: 0,
      totalUnitsReserved: existingCount,
      warnings: [],
      alreadyReserved: true,
    };
  }

  // Validate transition is allowed (throws if not BORRADOR)
  resolveTransition(doc.status, "RESERVAR");

  // Extract suggestions from the persisted snapshot
  const snapshot = doc.planSnapshot as ReplenishmentDocumentSnapshot;
  const refQtyMap = aggregateSuggestionsByReference(snapshot.suggestions as ReplenishmentSuggestion[]);

  if (refQtyMap.size === 0) {
    throw new Error(`[STORE-PLAN-RESERVATION] Documento ${doc.documentNumber} sin sugerencias — no hay nada que reservar.`);
  }

  // Sort references for deterministic lock ordering
  const sortedRefs = [...refQtyMap.keys()].sort();
  const expiresAt = new Date(Date.now() + STORE_PLAN_RESERVATION_TTL_SEC * 1000);
  const warnings: string[] = [];
  let reservationsCreated = 0;
  let totalUnitsReserved = 0;

  // Atomic: advisory locks + availability check + reservation create + document transition
  await db.$transaction(async (tx: any) => {
    // 1. Acquire per-reference advisory locks (sorted, prevents deadlocks)
    for (const ref of sortedRefs) {
      const lockKey = `${orgId}:reservation:${ref}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    }

    // 2. Re-read document inside transaction (concurrent reserve race guard)
    const docInTx = await tx.storeReplenishmentDocument.findFirst({
      where: { id: documentId, organizationId: orgId },
    });
    if (!docInTx || docInTx.status !== "BORRADOR") {
      throw new Error(
        `[STORE-PLAN-RESERVATION] Documento ${documentId} ya no está en BORRADOR (status: ${docInTx?.status ?? "NOT_FOUND"}).`,
      );
    }

    // 3. Load current active reservations for these references to compute availability
    const existingReservations = await tx.operationalReservation.findMany({
      where: {
        organizationId: orgId,
        reference: { in: sortedRefs },
        status: "active",
      },
    });

    // Compute reserved qty per reference from ALL active reservations
    const reservedByRef = new Map<string, number>();
    for (const r of existingReservations) {
      const key = r.reference.toUpperCase();
      const active = r.qtyReserved - r.qtyReleased - r.qtyConsumed;
      if (active > 0) {
        reservedByRef.set(key, (reservedByRef.get(key) ?? 0) + active);
      }
    }

    // 4. Load physical inventory for these references
    // Uses CCS (CommercialCoverageSnapshot) as the canonical source
    const physicalByRef = await loadPhysicalInventoryByRef(orgId, sortedRefs, tx);

    // 5. Create reservations, checking availability per reference
    const now = new Date();
    for (const ref of sortedRefs) {
      const requestedQty = refQtyMap.get(ref)!;
      const physicalQty = physicalByRef.get(ref) ?? 0;
      const currentReserved = reservedByRef.get(ref) ?? 0;
      const availableQty = Math.max(0, physicalQty - currentReserved);

      if (availableQty <= 0) {
        warnings.push(`${ref}: sin disponibilidad (físico=${physicalQty}, reservado=${currentReserved})`);
        continue;
      }

      const qtyToReserve = Math.min(requestedQty, availableQty);
      if (qtyToReserve < requestedQty) {
        warnings.push(`${ref}: reserva parcial ${qtyToReserve}/${requestedQty} (disponible=${availableQty})`);
      }

      // Upsert reservation (idempotent key: org + store_plan + docId + ref)
      await tx.operationalReservation.upsert({
        where: {
          organizationId_sourceType_sourceId_reference: {
            organizationId: orgId,
            sourceType: "store_plan",
            sourceId: documentId,
            reference: ref,
          },
        },
        update: {
          qtyReserved: qtyToReserve,
          status: "active",
          reason: `Plan de surtido ${doc.documentNumber} → ${doc.storeName}`,
          expiresAt,
          updatedAt: now,
        },
        create: {
          organizationId: orgId,
          sourceType: "store_plan",
          sourceId: documentId,
          reference: ref,
          description: getRefDescription(snapshot.suggestions as ReplenishmentSuggestion[], ref),
          qtyReserved: qtyToReserve,
          qtyReleased: 0,
          qtyConsumed: 0,
          status: "active",
          reason: `Plan de surtido ${doc.documentNumber} → ${doc.storeName}`,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        },
      });

      // Track impact on reserved pool for subsequent refs
      reservedByRef.set(ref, currentReserved + qtyToReserve);
      reservationsCreated++;
      totalUnitsReserved += qtyToReserve;
    }

    // 6. Transition document to RESERVADO
    await tx.storeReplenishmentDocument.update({
      where: { id: documentId },
      data: { status: "RESERVADO", updatedAt: now },
    });

    // 7. Record workflow event
    await tx.storeReplenishmentDocumentEvent.create({
      data: {
        organizationId: orgId,
        documentId,
        batchId: doc.batchId,
        fromStatus: "BORRADOR",
        toStatus: "RESERVADO",
        transition: "RESERVAR",
        workflowVersion: 1,
        actorId,
        actorDisplayName: actorDisplayName ?? null,
        note: `Inventario reservado: ${reservationsCreated} referencias, ${totalUnitsReserved} unidades`,
        metadata: {
          reservationsCreated,
          totalUnitsReserved,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      },
    });
  }, { timeout: 20000 });

  return {
    documentId,
    documentNumber: doc.documentNumber,
    storeId: doc.storeId,
    reservationsCreated,
    totalUnitsReserved,
    warnings,
    alreadyReserved: false,
  };
}

// ── Release ──────────────────────────────────────────────────────────────────

/**
 * Releases all active reservations for a store replenishment document.
 * Transitions document from RESERVADO → BORRADOR.
 *
 * Also used internally when a RESERVADO document is CANCELADO.
 */
export async function releaseStorePlanReservations(
  orgId: string,
  documentId: string,
  actorId: string,
  actorDisplayName?: string,
  /** If true, the caller handles the document transition (e.g., CANCELAR). */
  skipDocumentTransition = false,
): Promise<StorePlanReleaseResult> {
  const doc = await db.storeReplenishmentDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
  });

  if (!doc) {
    throw new Error(`[STORE-PLAN-RESERVATION] Documento ${documentId} no encontrado.`);
  }

  if (!skipDocumentTransition) {
    // Validate RESERVADO → BORRADOR transition
    resolveTransition(doc.status, "LIBERAR_RESERVA");
  }

  const now = new Date();

  // Release all active reservations for this document
  const result = await db.operationalReservation.updateMany({
    where: {
      organizationId: orgId,
      sourceType: "store_plan",
      sourceId: documentId,
      status: "active",
    },
    data: {
      status: "released",
      updatedAt: now,
    },
  });

  const totalUnitsReleased = await _computeReleasedUnits(orgId, documentId);

  if (!skipDocumentTransition) {
    // Transition document back to BORRADOR
    await db.$transaction(async (tx: any) => {
      await tx.storeReplenishmentDocument.update({
        where: { id: documentId },
        data: { status: "BORRADOR", updatedAt: now },
      });

      await tx.storeReplenishmentDocumentEvent.create({
        data: {
          organizationId: orgId,
          documentId,
          batchId: doc.batchId,
          fromStatus: "RESERVADO",
          toStatus: "BORRADOR",
          transition: "LIBERAR_RESERVA",
          workflowVersion: 1,
          actorId,
          actorDisplayName: actorDisplayName ?? null,
          note: `Reserva liberada: ${result.count} referencias`,
          metadata: { reservationsReleased: result.count, totalUnitsReleased },
        },
      });
    });
  }

  return {
    documentId,
    documentNumber: doc.documentNumber,
    storeId: doc.storeId,
    reservationsReleased: result.count,
    totalUnitsReleased,
  };
}

// ── Cancel hook ──────────────────────────────────────────────────────────────

/**
 * Called when a RESERVADO document is being CANCELADO.
 * Releases all active reservations as part of the cancellation.
 * Does NOT transition the document (the caller handles CANCELAR).
 */
export async function releaseReservationsOnCancel(
  orgId: string,
  documentId: string,
  actorId: string,
): Promise<void> {
  await releaseStorePlanReservations(orgId, documentId, actorId, undefined, true);
}

// ── Query helpers ────────────────────────────────────────────────────────────

/**
 * Returns the count and total units of active reservations for a document.
 */
export async function getDocumentReservationSummary(
  orgId: string,
  documentId: string,
): Promise<{ count: number; totalUnits: number }> {
  const reservations = await db.operationalReservation.findMany({
    where: {
      organizationId: orgId,
      sourceType: "store_plan",
      sourceId: documentId,
      status: "active",
    },
    select: { qtyReserved: true, qtyReleased: true, qtyConsumed: true },
  });

  let totalUnits = 0;
  for (const r of reservations) {
    totalUnits += Math.max(0, r.qtyReserved - r.qtyReleased - r.qtyConsumed);
  }

  return { count: reservations.length, totalUnits };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Aggregates suggestion references: multiple suggestions for the same
 * referenceCode in one document are summed.
 */
function aggregateSuggestionsByReference(
  suggestions: readonly ReplenishmentSuggestion[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of suggestions) {
    const ref = s.referenceCode.toUpperCase();
    map.set(ref, (map.get(ref) ?? 0) + s.units);
  }
  return map;
}

/**
 * Gets the description for a reference from the suggestions list.
 */
function getRefDescription(
  suggestions: readonly ReplenishmentSuggestion[],
  ref: string,
): string {
  const s = suggestions.find(s => s.referenceCode.toUpperCase() === ref);
  return s?.productName ?? ref;
}

/**
 * Loads physical inventory (disponible) per reference from ProductInventoryLevel.
 *
 * Uses PIL rows from textile (ka_nl_bodega=10) and import (ka_nl_bodega=33)
 * warehouses. This is the source of truth for how many physical units exist
 * in the source warehouses.
 */
async function loadPhysicalInventoryByRef(
  orgId: string,
  references: string[],
  tx: any,
): Promise<Map<string, number>> {
  // Load products by externalId (= reference code)
  const products = await tx.productEntity.findMany({
    where: {
      organizationId: orgId,
      externalId: { in: references },
      status: { not: "archived" },
    },
    select: { id: true, externalId: true },
  });

  if (products.length === 0) return new Map();

  const productIdToRef = new Map<string, string>();
  for (const p of products) {
    productIdToRef.set(p.id, (p.externalId as string).toUpperCase());
  }

  // Source warehouses: B10 (textile) and B33 (import)
  const SOURCE_WAREHOUSE_PKS = ["10", "33"];

  const pils = await tx.productInventoryLevel.findMany({
    where: {
      organizationId: orgId,
      productId: { in: [...productIdToRef.keys()] },
      warehouseId: { in: SOURCE_WAREHOUSE_PKS },
    },
    select: { productId: true, quantity: true },
  });

  const physicalByRef = new Map<string, number>();
  for (const pil of pils) {
    const ref = productIdToRef.get(pil.productId);
    if (!ref) continue;
    const qty = Math.max(0, pil.quantity ?? 0);
    physicalByRef.set(ref, (physicalByRef.get(ref) ?? 0) + qty);
  }

  return physicalByRef;
}

/**
 * Computes total released units for a document's released reservations.
 */
async function _computeReleasedUnits(
  orgId: string,
  documentId: string,
): Promise<number> {
  const released = await db.operationalReservation.findMany({
    where: {
      organizationId: orgId,
      sourceType: "store_plan",
      sourceId: documentId,
      status: "released",
    },
    select: { qtyReserved: true },
  });
  return released.reduce((sum: number, r: { qtyReserved: number }) => sum + r.qtyReserved, 0);
}
