/**
 * commercial-operational-entities.ts
 *
 * COMERCIAL-OPERATIONAL-INTEGRATION-01
 * Queries real Castillitos data and returns lightweight entity snapshots.
 *
 * These functions query Prisma directly and return typed domain objects.
 * They do NOT import from other module's services — they query the shared
 * Prisma models that those modules also use.
 *
 * SERVER ONLY.
 */

import "server-only";
import { prisma } from "@/lib/prisma";

import type {
  AffectedOrder,
  AffectedCustomer,
  AffectedVendor,
  AffectedPortfolio,
  RelatedProduction,
  AlternativeInventory,
} from "./commercial-operational-types";

const db = prisma as any;

// -- Inventory for a reference -----------------------------------------------

export interface ReferenceInventorySnapshot {
  reference: string;
  productName: string | null;
  productId: string | null;
  totalAvailable: number;
  warehouses: Array<{ warehouseCode: string; warehouseName: string; available: number }>;
}

/** Get inventory snapshot for a reference across all warehouses. */
export async function getInventoryForReference(
  orgId: string,
  reference: string,
): Promise<ReferenceInventorySnapshot> {
  const product = await db.productEntity.findFirst({
    where: { organizationId: orgId, externalSource: "sag", externalId: reference.toUpperCase() },
    select: { id: true, name: true, externalId: true },
  }).catch(() => null);

  if (!product) {
    return { reference, productName: null, productId: null, totalAvailable: 0, warehouses: [] };
  }

  const levels = await db.productInventoryLevel.findMany({
    where: { organizationId: orgId, productId: product.id, quantity: { gt: 0 } },
    select: { warehouseId: true, externalRef: true, quantity: true },
  }).catch(() => []);

  const warehouses = (levels as any[]).map(l => ({
    warehouseCode: l.externalRef ?? l.warehouseId,
    warehouseName: l.externalRef ?? `Bodega ${l.warehouseId}`,
    available: l.quantity ?? 0,
  }));

  return {
    reference,
    productName: product.name ?? null,
    productId: product.id,
    totalAvailable: warehouses.reduce((s, w) => s + w.available, 0),
    warehouses,
  };
}

// -- Orders containing a reference -------------------------------------------

/** Find orders that include a specific reference. */
export async function getOrdersForReference(
  orgId: string,
  reference: string,
): Promise<AffectedOrder[]> {
  // CustomerOrderRecord stores reference in metadata or line items
  // First try ProductionOrderLine which has referenceCode
  const orderLines = await db.productionOrderLine.findMany({
    where: {
      organizationId: orgId,
      referenceCode: reference.toUpperCase(),
      productionOrder: { status: "open" },
    },
    include: {
      productionOrder: {
        select: { id: true, documentDate: true, status: true, documentNumber: true },
      },
    },
    take: 20,
  }).catch(() => []);

  // Also check CustomerOrderRecord for reference matches
  const customerOrders = await db.customerOrderRecord.findMany({
    where: {
      organizationId: orgId,
      referenceCode: reference.toUpperCase(),
    },
    select: {
      id: true,
      orderDate: true,
      customerName: true,
      amount: true,
      status: true,
    },
    take: 20,
  }).catch(() => []);

  return (customerOrders as any[]).map(o => ({
    orderId: o.id,
    orderDate: o.orderDate?.toISOString?.() ?? "",
    customerName: o.customerName ?? null,
    amount: Number(o.amount ?? 0),
    status: o.status ?? "unknown",
  }));
}

// -- Customers affected by reference ----------------------------------------

/** Find customers with orders for a reference. */
export async function getCustomersForReference(
  orgId: string,
  reference: string,
): Promise<AffectedCustomer[]> {
  const orders = await db.customerOrderRecord.groupBy({
    by: ["customerName"],
    where: {
      organizationId: orgId,
      referenceCode: reference.toUpperCase(),
    },
    _count: { _all: true },
    _sum: { amount: true },
  }).catch(() => []);

  return (orders as any[])
    .filter(o => o.customerName)
    .map(o => ({
      customerId: o.customerName,
      customerName: o.customerName,
      orderCount: o._count?._all ?? 0,
      totalAmount: Number(o._sum?.amount ?? 0),
    }));
}

// -- Vendors with reference in portfolio ------------------------------------

/** Find vendors who have this reference in their portfolio/maleta. */
export async function getVendorsForReference(
  orgId: string,
  reference: string,
): Promise<AffectedVendor[]> {
  const items = await db.vendorBagItem.findMany({
    where: {
      organizationId: orgId,
      reference: reference.toUpperCase(),
      bag: { status: "activa" },
    },
    include: {
      bag: {
        select: { id: true, salesRepId: true, salesRepName: true, status: true },
      },
    },
    take: 20,
  }).catch(() => []);

  return (items as any[]).map(i => ({
    vendorId: i.bag?.salesRepId ?? "unknown",
    vendorName: i.bag?.salesRepName ?? i.bag?.salesRepId ?? "unknown",
    portfolioId: i.bag?.id ?? null,
    assignedQty: i.assignedQty ?? 0,
    availableQty: i.availableToSellQty ?? 0,
    status: i.status ?? "unknown",
  }));
}

// -- Portfolios containing reference ----------------------------------------

/** Find portfolios (maletas) containing this reference. */
export async function getPortfoliosForReference(
  orgId: string,
  reference: string,
): Promise<AffectedPortfolio[]> {
  const items = await db.vendorBagItem.findMany({
    where: {
      organizationId: orgId,
      reference: reference.toUpperCase(),
    },
    include: {
      bag: {
        select: { id: true, salesRepId: true, salesRepName: true, season: true, status: true },
      },
    },
    take: 20,
  }).catch(() => []);

  return (items as any[]).map(i => ({
    portfolioId: i.bag?.id ?? "unknown",
    vendorId: i.bag?.salesRepId ?? "unknown",
    vendorName: i.bag?.salesRepName ?? i.bag?.salesRepId ?? "unknown",
    season: i.bag?.season ?? null,
    status: i.bag?.status ?? "unknown",
    assignedQty: i.assignedQty ?? 0,
    availableToSellQty: i.availableToSellQty ?? 0,
  }));
}

// -- Production orders for reference ----------------------------------------

/** Find production orders that include this reference. */
export async function getProductionForReference(
  orgId: string,
  reference: string,
): Promise<RelatedProduction[]> {
  const lines = await db.productionOrderLine.findMany({
    where: {
      organizationId: orgId,
      referenceCode: reference.toUpperCase(),
    },
    include: {
      productionOrder: {
        select: { id: true, documentNumber: true, status: true, isClosed: true, documentDate: true },
      },
    },
    take: 20,
  }).catch(() => []);

  // Deduplicate by production order
  const seen = new Set<string>();
  const results: RelatedProduction[] = [];

  for (const l of lines as any[]) {
    const op = l.productionOrder;
    if (!op || seen.has(op.id)) continue;
    seen.add(op.id);

    results.push({
      opId: op.id,
      documentNumber: op.documentNumber ?? null,
      status: op.status ?? "unknown",
      isClosed: op.isClosed ?? false,
      quantityOrdered: l.quantityOrdered ?? 0,
      documentDate: op.documentDate?.toISOString?.() ?? null,
    });
  }

  return results;
}

// -- Alternative inventory (other warehouses) --------------------------------

/** Get inventory in warehouses other than the primary one. */
export async function getAlternativeInventory(
  orgId: string,
  reference: string,
  excludeWarehouse?: string,
): Promise<AlternativeInventory[]> {
  const product = await db.productEntity.findFirst({
    where: { organizationId: orgId, externalSource: "sag", externalId: reference.toUpperCase() },
    select: { id: true },
  }).catch(() => null);

  if (!product) return [];

  const where: any = {
    organizationId: orgId,
    productId: product.id,
    quantity: { gt: 0 },
  };
  if (excludeWarehouse) {
    where.warehouseId = { not: excludeWarehouse };
  }

  const levels = await db.productInventoryLevel.findMany({
    where,
    select: { warehouseId: true, externalRef: true, quantity: true },
  }).catch(() => []);

  return (levels as any[]).map(l => ({
    warehouseCode: l.externalRef ?? l.warehouseId,
    warehouseName: l.externalRef ?? `Bodega ${l.warehouseId}`,
    available: l.quantity ?? 0,
  }));
}

// -- Discover critical/out-of-stock references ------------------------------

/**
 * Find all product references that are out of stock or critically low.
 * Returns reference codes and their total available inventory.
 */
export async function discoverCriticalReferences(
  orgId: string,
  opts: { criticalThreshold?: number; limit?: number } = {},
): Promise<Array<{ reference: string; productName: string | null; totalAvailable: number }>> {
  const { criticalThreshold = 10, limit = 50 } = opts;

  // Products with zero or low total inventory
  const products = await db.productEntity.findMany({
    where: {
      organizationId: orgId,
      externalSource: "sag",
      commercialStatus: "active",
    },
    select: { id: true, externalId: true, name: true },
    take: 500,
  }).catch(() => []);

  const results: Array<{ reference: string; productName: string | null; totalAvailable: number }> = [];

  for (const p of products as any[]) {
    if (!p.externalId) continue;

    const levels = await db.productInventoryLevel.aggregate({
      where: { organizationId: orgId, productId: p.id },
      _sum: { quantity: true },
    }).catch(() => ({ _sum: { quantity: null } }));

    const total = Number(levels._sum?.quantity ?? 0);
    if (total <= criticalThreshold) {
      results.push({
        reference: p.externalId,
        productName: p.name ?? null,
        totalAvailable: total,
      });
    }

    if (results.length >= limit) break;
  }

  // Sort: out of stock first, then by total available
  results.sort((a, b) => a.totalAvailable - b.totalAvailable);

  return results;
}
