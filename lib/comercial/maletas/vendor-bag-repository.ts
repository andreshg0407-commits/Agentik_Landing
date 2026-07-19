/**
 * lib/comercial/maletas/vendor-bag-repository.ts
 *
 * Prisma repository for VendorCommercialBag and VendorBagItem.
 * All database operations for the bag lifecycle live here.
 *
 * Rules:
 *   - availableToSellQty is always written as assignedQty - soldQty
 *   - item status is derived and written on every mutation
 *   - No SAG adapter changes
 *   - No engine logic — pure data access
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-BLOCK-01-PERSISTENCE-ORDERS-01
 */

import { prisma } from "@/lib/prisma";
import type { VendorBagItemStatus } from "./vendor-bag-types";

// ─── Status derivation ───────────────────────────────────────────────────────

function deriveItemStatus(
  assignedQty:        number,
  soldQty:            number,
  availableToSellQty: number,
  minQty:             number,
  inventoryAvailable: number,
  currentStatus:      string,
): string {
  if (currentStatus === "pausado") return "pausado";
  if (assignedQty > inventoryAvailable) return "excede_inventario";
  if (availableToSellQty <= 0) return "agotado";
  if (minQty > 0 && availableToSellQty <= minQty) return "bajo_minimo";
  return "ok";
}

// ─── Bag reads ───────────────────────────────────────────────────────────────

export async function listBags(organizationId: string, salesRepId?: string) {
  return prisma.vendorCommercialBag.findMany({
    where: {
      organizationId,
      ...(salesRepId ? { salesRepId } : {}),
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBag(organizationId: string, bagId: string) {
  return prisma.vendorCommercialBag.findFirst({
    where: { id: bagId, organizationId },
    include: { items: { orderBy: { priority: "asc" } } },
  });
}

// ─── Bag writes ──────────────────────────────────────────────────────────────

export interface CreateBagInput {
  salesRepId:  string;
  season:      string;
  startDate:   Date | null;
  endDate:     Date | null;
  status:      "borrador" | "activa";
  notes?:      string;
  items: CreateItemInput[];
}

export interface CreateItemInput {
  reference:                 string;
  description:               string;
  line:                      string;
  category:                  string;
  productType:               string;
  assignedQty:               number;
  minQty:                    number;
  idealQty:                  number;
  inventoryAvailableAtAssign: number;
  priority:                  number;
}

export async function createBag(organizationId: string, input: CreateBagInput) {
  return prisma.vendorCommercialBag.create({
    data: {
      organizationId,
      salesRepId:  input.salesRepId,
      season:      input.season,
      startDate:   input.startDate,
      endDate:     input.endDate,
      status:      input.status,
      notes:       input.notes ?? null,
      items: {
        create: input.items.map(item => {
          const availableToSellQty = item.assignedQty; // soldQty = 0 at creation
          const status = deriveItemStatus(
            item.assignedQty, 0, availableToSellQty,
            item.minQty, item.inventoryAvailableAtAssign, "ok",
          );
          return {
            organizationId,
            reference:                 item.reference.toUpperCase(),
            description:               item.description,
            line:                      item.line,
            category:                  item.category,
            productType:               item.productType,
            assignedQty:               item.assignedQty,
            soldQty:                   0,
            availableToSellQty,
            minQty:                    item.minQty,
            idealQty:                  item.idealQty,
            inventoryAvailableAtAssign: item.inventoryAvailableAtAssign,
            status,
            priority:                  item.priority,
          };
        }),
      },
    },
    include: { items: true },
  });
}

export async function updateBagStatus(
  organizationId: string,
  bagId:          string,
  status:         "borrador" | "activa" | "pausada" | "archivada",
) {
  return prisma.vendorCommercialBag.updateMany({
    where: { id: bagId, organizationId },
    data:  { status },
  });
}

// ─── Item writes ─────────────────────────────────────────────────────────────

export async function addItemToBag(
  organizationId: string,
  bagId:          string,
  item:           CreateItemInput,
) {
  const availableToSellQty = item.assignedQty;
  const status = deriveItemStatus(
    item.assignedQty, 0, availableToSellQty,
    item.minQty, item.inventoryAvailableAtAssign, "ok",
  );
  return prisma.vendorBagItem.create({
    data: {
      organizationId,
      bagId,
      reference:                 item.reference.toUpperCase(),
      description:               item.description,
      line:                      item.line,
      category:                  item.category,
      productType:               item.productType,
      assignedQty:               item.assignedQty,
      soldQty:                   0,
      availableToSellQty,
      minQty:                    item.minQty,
      idealQty:                  item.idealQty,
      inventoryAvailableAtAssign: item.inventoryAvailableAtAssign,
      status,
      priority:                  item.priority,
    },
  });
}

export async function updateItemAssignedQty(
  organizationId: string,
  itemId:         string,
  assignedQty:    number,
) {
  const item = await prisma.vendorBagItem.findFirst({ where: { id: itemId, organizationId } });
  if (!item) return null;

  const availableToSellQty = Math.max(0, assignedQty - item.soldQty);
  const status = deriveItemStatus(
    assignedQty, item.soldQty, availableToSellQty,
    item.minQty, item.inventoryAvailableAtAssign, item.status,
  );
  return prisma.vendorBagItem.update({
    where: { id: itemId },
    data:  { assignedQty, availableToSellQty, status },
  });
}

export async function pauseItem(organizationId: string, itemId: string) {
  return prisma.vendorBagItem.updateMany({
    where: { id: itemId, organizationId },
    data:  { status: "pausado" },
  });
}

export async function removeItem(organizationId: string, itemId: string) {
  return prisma.vendorBagItem.deleteMany({
    where: { id: itemId, organizationId },
  });
}

// ─── Sold qty update (called by order-ingest-service) ────────────────────────

export interface SoldQtyUpdateResult {
  item:              Awaited<ReturnType<typeof prisma.vendorBagItem.update>>;
  triggeredPressure: boolean;
  pressureType:      "agotado" | "bajo_minimo" | null;
}

export async function applyOrderLine(
  organizationId:     string,
  itemId:             string,
  qtySold:            number,
  orderRef:           string | null,
  soldAt:             Date,
): Promise<SoldQtyUpdateResult | null> {
  const item = await prisma.vendorBagItem.findFirst({ where: { id: itemId, organizationId } });
  if (!item || item.status === "pausado") return null;

  const newSoldQty           = item.soldQty + qtySold;
  const newAvailableToSell   = Math.max(0, item.assignedQty - newSoldQty);
  const availableBefore      = item.availableToSellQty;

  const newStatus = deriveItemStatus(
    item.assignedQty, newSoldQty, newAvailableToSell,
    item.minQty, item.inventoryAvailableAtAssign, item.status,
  ) as VendorBagItemStatus;

  const triggeredPressure =
    (newStatus === "agotado" && item.status !== "agotado") ||
    (newStatus === "bajo_minimo" && item.status === "ok");

  const pressureType: "agotado" | "bajo_minimo" | null =
    newStatus === "agotado"    ? "agotado"
    : newStatus === "bajo_minimo" ? "bajo_minimo"
    : null;

  // Atomic: update item + create audit line in one transaction
  const [updatedItem] = await prisma.$transaction([
    prisma.vendorBagItem.update({
      where: { id: itemId },
      data: {
        soldQty:           newSoldQty,
        availableToSellQty: newAvailableToSell,
        status:            newStatus,
      },
    }),
    prisma.vendorBagOrderLine.create({
      data: {
        organizationId,
        bagId:              item.bagId,
        itemId,
        reference:          item.reference,
        salesRepId:         "", // filled by caller from bag.salesRepId
        orderRef,
        qtySold,
        availableBeforeQty: availableBefore,
        availableAfterQty:  newAvailableToSell,
        triggeredPressure,
        soldAt,
      },
    }),
  ]);

  return { item: updatedItem, triggeredPressure, pressureType };
}

// ─── Pressure context query ───────────────────────────────────────────────────

/** Returns all active items for a given reference across all active bags.
 *  Used by order-ingest-service to check multi-vendor pressure. */
export async function getActiveBagItemsByReference(
  organizationId: string,
  reference:      string,
) {
  return prisma.vendorBagItem.findMany({
    where: {
      organizationId,
      reference: reference.toUpperCase(),
      bag: { status: "activa" },
      status: { not: "pausado" },
    },
    include: { bag: { select: { salesRepId: true, season: true } } },
  });
}
