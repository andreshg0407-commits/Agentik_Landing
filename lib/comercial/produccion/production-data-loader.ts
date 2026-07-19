/**
 * lib/comercial/produccion/production-data-loader.ts
 *
 * Data loader that constructs SubgroupInput[] from Prisma data
 * for the Production Decision Engine.
 *
 * Data sources:
 *   - ProductEntity (textile products, LINEA != "5")
 *   - ProductInventoryLevel (textile warehouses, excluding import 24/42-46)
 *   - ProductionEvent (OP = active production orders)
 *   - CustomerOrderRecord (pending orders by product)
 *   - VendorBagItem (count of maletas referencing textile products)
 *   - CustomerOrderLine (sales velocity for production products)
 *
 * Sprint: COMMERCIAL-DATA-CONNECTIVITY-01
 */

import { prisma } from "@/lib/prisma";
import type {
  SubgroupInput,
  ActiveOPInfo,
  ProductionPlanningContext,
} from "./production-planning-types";

const db = prisma as any;

// Import warehouses to EXCLUDE from textile inventory
const IMPORT_WAREHOUSE_CODES = new Set(["24", "42", "43", "44", "45", "46"]);

/**
 * Load SubgroupInput[] from real Prisma data.
 *
 * Groups products by subgrupoSag (SAG subgroup code) to match the
 * Production Planning engine's aggregation level.
 */
export async function loadProductionSubgroupInputs(
  orgId: string,
): Promise<SubgroupInput[]> {
  // 1. Get all textile products (non-import = LINEA != "5")
  const products = await db.productEntity.findMany({
    where: {
      organizationId: orgId,
      productLine: { not: "5" },
      status: { not: "archived" },
      subgrupoSag: { not: null },
    },
    select: {
      id: true,
      externalId: true,
      subgrupoSag: true,
      referenceCode: true,
      productLine: true,
    },
  });

  if (products.length === 0) return [];

  const productIds = products.map((p: any) => p.id);
  const productCodes = products.map((p: any) => p.externalId).filter(Boolean) as string[];

  // 2. Inventory levels — textile warehouses only
  const allInventory = await db.productInventoryLevel.findMany({
    where: {
      organizationId: orgId,
      productId: { in: productIds },
    },
    select: { productId: true, warehouseId: true, quantity: true },
  });

  const inventoryByProduct = new Map<string, number>();
  for (const lvl of allInventory) {
    if (IMPORT_WAREHOUSE_CODES.has(lvl.warehouseId)) continue;
    const qty = Number(lvl.quantity ?? 0);
    if (qty > 0) {
      inventoryByProduct.set(lvl.productId, (inventoryByProduct.get(lvl.productId) ?? 0) + qty);
    }
  }

  // 3. Active production orders (OP type events)
  const activeOPs = await loadActiveOPs(orgId);

  // 4. Sales data (last 6 months) from CustomerOrderLine
  const salesByProduct = await loadSalesByProduct(orgId, productCodes);

  // 5. Pending orders by product
  const pendingByProduct = await loadPendingOrders(orgId, productCodes);

  // 6. Maletas count by product
  const maletasByProduct = await loadMaletasCounts(orgId, productIds);

  // 7. Tiendas count — approximate from warehouse count
  const tiendasByProduct = await loadTiendasCounts(orgId, productIds);

  // 8. Group by subgroup
  const subgroupMap = new Map<string, {
    products: string[];
    productIds: string[];
    inventory: number;
    sales6m: number;
    sales6mMonthly: number[];
    pendingOrders: number;
    maletasCount: number;
    tiendasCount: number;
  }>();

  for (const p of products) {
    const sg = p.subgrupoSag as string;
    if (!sg) continue;

    const entry = subgroupMap.get(sg) ?? {
      products: [],
      productIds: [],
      inventory: 0,
      sales6m: 0,
      sales6mMonthly: [0, 0, 0, 0, 0, 0],
      pendingOrders: 0,
      maletasCount: 0,
      tiendasCount: 0,
    };

    entry.products.push(p.externalId ?? p.id);
    entry.productIds.push(p.id);
    entry.inventory += inventoryByProduct.get(p.id) ?? 0;

    const sales = salesByProduct.get(p.externalId ?? "");
    if (sales) {
      entry.sales6m += sales.total;
      for (let i = 0; i < 6; i++) {
        entry.sales6mMonthly[i] += sales.monthly[i] ?? 0;
      }
    }

    entry.pendingOrders += pendingByProduct.get(p.externalId ?? "") ?? 0;
    entry.maletasCount += maletasByProduct.get(p.id) ?? 0;
    entry.tiendasCount = Math.max(entry.tiendasCount, tiendasByProduct.get(p.id) ?? 0);

    subgroupMap.set(sg, entry);
  }

  // 9. Build SubgroupInput[]
  const results: SubgroupInput[] = [];

  for (const [sg, data] of subgroupMap) {
    // Find active OPs for this subgroup
    const sgOPs = activeOPs.filter(op =>
      data.products.some(code => op.products.includes(code))
    );

    const coverageDays = data.sales6m > 0
      ? Math.round((data.inventory / (data.sales6m / 180)) * 1)
      : null;

    results.push({
      subgroup: sg,
      brand: "CASTILLITOS", // Single-brand tenant
      availableInventory: data.inventory,
      sales6m: data.sales6m,
      sales6mMonthly: data.sales6mMonthly,
      pendingOrders: data.pendingOrders,
      maletasCount: data.maletasCount,
      tiendasCount: data.tiendasCount,
      coverageDays,
      activeOPs: sgOPs.map(op => ({
        documentNumber: op.documentNumber,
        status: op.status,
        quantity: op.quantity,
        documentDate: op.documentDate,
        warehouseCode: op.warehouseCode,
      })),
    });
  }

  return results;
}

/**
 * Build the ProductionPlanningContext from an orgId.
 */
export function buildProductionContext(orgId: string): ProductionPlanningContext {
  return { tenantId: orgId };
}

// ── Active OP loader ────────────────────────────────────────────────────────

interface LoadedOP {
  documentNumber: string;
  status: "open" | "closed" | "unknown";
  quantity: number;
  documentDate: string | null;
  warehouseCode: string | null;
  products: string[];
}

async function loadActiveOPs(orgId: string): Promise<LoadedOP[]> {
  try {
    const events = await db.productionEvent.findMany({
      where: {
        organizationId: orgId,
        eventType: "OP",
        status: { in: ["ABIERTA", "EN_PROCESO", "PENDIENTE"] },
      },
      select: {
        eventNumber: true,
        status: true,
        eventDate: true,
        rawJson: true,
      },
      take: 500,
    });

    return events.map((e: any) => {
      const raw = e.rawJson as any;
      // Extract product codes from OP raw data
      const products: string[] = [];
      if (raw?.items) {
        for (const item of raw.items) {
          if (item.k_sc_codigo_articulo) products.push(item.k_sc_codigo_articulo);
        }
      }
      if (raw?.k_sc_codigo_articulo) products.push(raw.k_sc_codigo_articulo);

      return {
        documentNumber: e.eventNumber ?? "—",
        status: "open" as const,
        quantity: Number(raw?.n_cantidad ?? raw?.total_cantidad ?? 0),
        documentDate: e.eventDate?.toISOString() ?? null,
        warehouseCode: raw?.ka_nl_bodega ? String(raw.ka_nl_bodega) : null,
        products,
      };
    });
  } catch {
    return [];
  }
}

// ── Sales by product (last 6 months) ────────────────────────────────────────

async function loadSalesByProduct(
  orgId: string,
  productCodes: string[],
): Promise<Map<string, { total: number; monthly: number[] }>> {
  const result = new Map<string, { total: number; monthly: number[] }>();
  if (productCodes.length === 0) return result;

  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);

    const lines = await db.customerOrderLine.findMany({
      where: {
        organizationId: orgId,
        referenceCode: { in: productCodes },
        order: { status: "FACTURADO", orderDate: { gte: sixMonthsAgo } },
      },
      select: {
        referenceCode: true,
        quantity: true,
        order: { select: { orderDate: true } },
      },
    });

    for (const line of lines) {
      const code = line.referenceCode as string;
      const qty = Math.max(0, Number(line.quantity ?? 0));
      if (qty <= 0) continue;

      if (!result.has(code)) {
        result.set(code, { total: 0, monthly: [0, 0, 0, 0, 0, 0] });
      }
      const entry = result.get(code)!;
      entry.total += qty;

      // Map to month index (0 = oldest, 5 = most recent)
      const orderDate = new Date(line.order.orderDate);
      const monthDiff = (new Date().getFullYear() - orderDate.getFullYear()) * 12
        + (new Date().getMonth() - orderDate.getMonth());
      const idx = 5 - Math.min(5, Math.max(0, monthDiff));
      entry.monthly[idx] += qty;
    }
  } catch {
    // CustomerOrderLine may not exist yet
  }

  return result;
}

// ── Pending orders by product ───────────────────────────────────────────────

async function loadPendingOrders(
  orgId: string,
  productCodes: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (productCodes.length === 0) return result;

  try {
    const lines = await db.customerOrderLine.findMany({
      where: {
        organizationId: orgId,
        referenceCode: { in: productCodes },
        order: { status: { in: ["PENDIENTE", "APROBADO", "EN_PROCESO"] } },
      },
      select: { referenceCode: true, quantity: true },
    });

    for (const line of lines) {
      const code = line.referenceCode as string;
      const qty = Math.max(0, Number(line.quantity ?? 0));
      result.set(code, (result.get(code) ?? 0) + qty);
    }
  } catch {
    // Graceful
  }

  return result;
}

// ── Maletas count by product ────────────────────────────────────────────────

async function loadMaletasCounts(
  orgId: string,
  productIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (productIds.length === 0) return result;

  try {
    const bagItems = await db.vendorBagItem.findMany({
      where: {
        productId: { in: productIds },
        bag: { organizationId: orgId },
      },
      select: { productId: true },
    });

    for (const item of bagItems) {
      result.set(item.productId, (result.get(item.productId) ?? 0) + 1);
    }
  } catch {
    // VendorBagItem may not exist
  }

  return result;
}

// ── Tiendas count by product (warehouse distribution) ───────────────────────

async function loadTiendasCounts(
  orgId: string,
  productIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (productIds.length === 0) return result;

  // Store warehouses (not import, not production)
  const PRODUCTION_WAREHOUSES = new Set(["14", "15"]);

  try {
    const levels = await db.productInventoryLevel.findMany({
      where: {
        organizationId: orgId,
        productId: { in: productIds },
        quantity: { gt: 0 },
      },
      select: { productId: true, warehouseId: true },
    });

    for (const lvl of levels) {
      if (IMPORT_WAREHOUSE_CODES.has(lvl.warehouseId)) continue;
      if (PRODUCTION_WAREHOUSES.has(lvl.warehouseId)) continue;
      // Count unique store warehouses per product
      const key = `${lvl.productId}:${lvl.warehouseId}`;
      if (!result.has(key)) {
        result.set(lvl.productId, (result.get(lvl.productId) ?? 0) + 1);
      }
    }
  } catch {
    // Graceful
  }

  return result;
}
