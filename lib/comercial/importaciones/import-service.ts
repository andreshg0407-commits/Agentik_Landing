/**
 * lib/comercial/importaciones/import-service.ts
 *
 * Read service for the Importaciones intelligence module.
 *
 * Data sources:
 *   Products:  ProductEntity (SAG LINEA "5" = imported accessories, category 148)
 *   Inventory: ProductInventoryLevel (import warehouses via warehouse-master)
 *   Sales:     CustomerOrderLine + CustomerOrderRecord (product-level sales)
 *   Prices:    CommercialProductDataSource (SAG v_articulos PV3/PV4)
 *   Receipts:  CommercialProductDataSource (SAG MOVIMIENTOS C1/C2)
 *
 * Why CustomerOrderLine and not SaleRecord?
 *   SaleRecord.productCode is null on all 129,045 rows in Castillitos.
 *   SaleRecord is at document-header level, not product level.
 *   CustomerOrderLine has referenceCode (= ProductEntity.externalId) with quantity.
 *
 * Returns handling:
 *   Negative quantities in CustomerOrderLine represent returns/credit notes.
 *   We track soldGross, returns, and soldNet separately.
 *   No Math.abs — devoluciones are never counted as ventas.
 *
 * Channel classification:
 *   Uses CommercialSalesClassificationEngine per line.
 *   Actual units are summed per classification (not proportional estimates).
 *
 * Sprint: GO-LIVE-IMPORTACIONES-DATA-TRUST-AND-NAVIGATION-01
 */

import { prisma } from "@/lib/prisma";
import type {
  ImportedReference,
  ImportSummary,
  ImportReferenceDetail,
  ImportReceiptSummary,
  MonthlySale,
  RepurchaseStatus,
  RepurchaseMotivo,
  DataQuality,
  StockDataQuality,
  EntryDateSource,
  SalesDataQuality,
} from "./import-types";
import type { CommercialProductDataSource, ProductEnrichment } from "@/lib/comercial/data-sources/commercial-product-data-source";
import { createSagDirectDataSource } from "@/lib/comercial/data-sources/sag-direct-commercial-product-data-source";
import { classifySale } from "@/lib/comercial/intelligence/sales-classification-engine";

// ── Product identification ──────────────────────────────────────────────────

const IMPORT_PRODUCT_LINES = new Set(["5"]);

function isImportedProduct(product: { productLine: string | null }): boolean {
  return product.productLine !== null && IMPORT_PRODUCT_LINES.has(product.productLine);
}

// ── Import warehouse identification ─────────────────────────────────────────
// Uses warehouse-master canonical resolution.
// Compared against ProductInventoryLevel.warehouseId (= ka_nl_bodega).
// Only COMMERCIAL_IMPORT participates in commercial import inventory.
// IMPORT_STAGING and IMPORT_CONTAINER are "no tener en cuenta" per admin.

import { getCommercialAvailableImportPks } from "@/lib/inventory/warehouse-master";

const IMPORT_WAREHOUSE_PKS = getCommercialAvailableImportPks();

// ── Data source resolution ──────────────────────────────────────────────────

let _dataSource: CommercialProductDataSource | null = null;

function getDataSource(): CommercialProductDataSource {
  if (!_dataSource) {
    _dataSource = createSagDirectDataSource();
  }
  return _dataSource;
}

export function setCommercialProductDataSource(ds: CommercialProductDataSource): void {
  _dataSource = ds;
}

// ── List imported references ────────────────────────────────────────────────

export async function listImportedReferences(orgId: string): Promise<ImportedReference[]> {
  // 1. Get all imported products (LINEA "5" for Castillitos)
  const products = await (prisma as any).productEntity.findMany({
    where: {
      organizationId: orgId,
      productLine: { in: Array.from(IMPORT_PRODUCT_LINES) },
      status: { not: "archived" },
    },
    select: {
      id: true,
      externalId: true,
      name: true,
      price: true,
      category: true,
      productLine: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  if (products.length === 0) return [];

  const productIds = products.map((p: any) => p.id);
  const productCodes = products.map((p: any) => p.externalId).filter(Boolean) as string[];

  // 2. Inventory levels — import warehouses + total across all warehouses
  const allInventoryLevels = await (prisma as any).productInventoryLevel.findMany({
    where: {
      organizationId: orgId,
      productId: { in: productIds },
    },
    select: { productId: true, quantity: true, warehouseId: true },
  });

  const remainingMap = new Map<string, number>();
  const totalStockMap = new Map<string, number>();
  for (const lvl of allInventoryLevels) {
    const qty = Number(lvl.quantity ?? 0);
    // Total stock across ALL warehouses (absolute positive sum)
    if (qty > 0) {
      totalStockMap.set(lvl.productId, (totalStockMap.get(lvl.productId) ?? 0) + qty);
    }
    // Import warehouse stock only
    if (IMPORT_WAREHOUSE_PKS.has(lvl.warehouseId)) {
      remainingMap.set(lvl.productId, (remainingMap.get(lvl.productId) ?? 0) + qty);
    }
  }

  // 3. Product-level sales from CustomerOrderLine + CustomerOrderRecord
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  type SalesAgg = {
    grossAll: number;
    returnsAll: number;
    gross6m: number;
    returns6m: number;
    // Per-line classification: actual unit sums
    detalAll: number;
    mayoristaAll: number;
    noDetAll: number;
    detal6m: number;
    mayorista6m: number;
    noDet6m: number;
    classifiedUnits: number;
    confidenceSum: number;
    // Monetary values
    revenueAll: number;
    revenue6m: number;
    revenueDetal6m: number;
    revenueMayorista6m: number;
  };

  const salesMap = new Map<string, SalesAgg>();
  let salesQuerySucceeded = false;

  if (productCodes.length > 0) {
    try {
      const orderLines = await (prisma as any).customerOrderLine.findMany({
        where: {
          organizationId: orgId,
          referenceCode: { in: productCodes },
          order: { status: "FACTURADO" },
        },
        select: {
          referenceCode: true,
          quantity: true,
          unitValue: true,
          order: {
            select: { orderDate: true, sourceCode: true, rawJson: true },
          },
        },
      });

      // We need prices for classification — fetch SAG enrichment first
      let enrichmentForClassification = new Map<string, ProductEnrichment>();
      try {
        const ds = getDataSource();
        enrichmentForClassification = await ds.fetchEnrichment(productCodes);
      } catch {
        // SAG unavailable — classification will have limited accuracy
      }

      for (const line of orderLines) {
        const code = line.referenceCode as string;
        if (!salesMap.has(code)) {
          salesMap.set(code, {
            grossAll: 0, returnsAll: 0,
            gross6m: 0, returns6m: 0,
            detalAll: 0, mayoristaAll: 0, noDetAll: 0,
            detal6m: 0, mayorista6m: 0, noDet6m: 0,
            classifiedUnits: 0, confidenceSum: 0,
            revenueAll: 0, revenue6m: 0,
            revenueDetal6m: 0, revenueMayorista6m: 0,
          });
        }
        const agg = salesMap.get(code)!;
        const qty = Number(line.quantity ?? 0);
        const unitValue = Number(line.unitValue ?? 0);
        const lineRevenue = Math.abs(qty) * unitValue;
        const orderDate = new Date(line.order.orderDate);
        const is6m = orderDate >= sixMonthsAgo;

        // Separate gross sales from returns (negative quantities)
        if (qty > 0) {
          agg.grossAll += qty;
          agg.revenueAll += lineRevenue;
          if (is6m) {
            agg.gross6m += qty;
            agg.revenue6m += lineRevenue;
          }
        } else if (qty < 0) {
          agg.returnsAll += Math.abs(qty);
          if (is6m) agg.returns6m += Math.abs(qty);
        }

        // Classify this line by channel using actual unit value
        const absQty = Math.abs(qty);
        if (unitValue > 0 && absQty > 0) {
          const enrichment = enrichmentForClassification.get(code.toUpperCase());
          const pricePV3 = enrichment?.prices.pricePV3 ?? null;
          const pricePV4 = enrichment?.prices.pricePV4 ?? null;

          if (pricePV3 !== null || pricePV4 !== null) {
            const result = classifySale(
              { price: { unitValue, pricePV3, pricePV4 } },
              "castillitos",
            );

            // Sum actual units per classification (not proportional)
            if (result.channel === "DETAL") {
              agg.detalAll += absQty;
              if (is6m) {
                agg.detal6m += absQty;
                agg.revenueDetal6m += lineRevenue;
              }
            } else if (result.channel === "MAYORISTA") {
              agg.mayoristaAll += absQty;
              if (is6m) {
                agg.mayorista6m += absQty;
                agg.revenueMayorista6m += lineRevenue;
              }
            } else {
              agg.noDetAll += absQty;
              if (is6m) agg.noDet6m += absQty;
            }

            agg.classifiedUnits += absQty;
            agg.confidenceSum += result.confidence * absQty;
          } else {
            agg.noDetAll += absQty;
            if (is6m) agg.noDet6m += absQty;
          }
        }
      }

      // Store enrichment for reuse in reference building
      _cachedEnrichment = enrichmentForClassification;
      salesQuerySucceeded = true;
    } catch (err) {
      console.error("[IMPORTACIONES] CustomerOrderLine query failed:", err);
    }
  }

  // 4. SAG enrichment — reuse from classification if available
  let enrichmentMap = _cachedEnrichment ?? new Map<string, ProductEnrichment>();
  if (enrichmentMap.size === 0) {
    try {
      const ds = getDataSource();
      enrichmentMap = await ds.fetchEnrichment(productCodes);
    } catch {
      // SAG unavailable
    }
  }

  // 5. Build set of products that have at least one PIL record in B24
  const productsWithB24Record = new Set<string>();
  for (const lvl of allInventoryLevels) {
    if (IMPORT_WAREHOUSE_PKS.has(lvl.warehouseId)) {
      productsWithB24Record.add(lvl.productId);
    }
  }

  // 6. Build references
  const references: ImportedReference[] = products.map((p: any) => {
    const hasB24Record = productsWithB24Record.has(p.id);
    const rawRemaining = remainingMap.get(p.id) ?? 0;
    const remaining = Math.max(0, rawRemaining);
    const stockDataQuality: StockDataQuality = hasB24Record ? "CONFIRMED" : "NO_PIL_RECORD";
    const totalStock = totalStockMap.get(p.id) ?? 0;
    const agg = salesMap.get(p.externalId ?? "");

    const soldGross = agg?.grossAll ?? 0;
    const returns = agg?.returnsAll ?? 0;
    const soldNet = soldGross - returns;
    const sold = soldNet;

    const sales6mGross = agg?.gross6m ?? 0;
    const returns6m = agg?.returns6m ?? 0;
    const sales6mNet = sales6mGross - returns6m;
    const salesTotal6m = sales6mNet;

    // Revenue
    const revenueAll = agg?.revenueAll ?? 0;
    const revenue6m = agg?.revenue6m ?? 0;
    const revenueDetal6m = agg?.revenueDetal6m ?? 0;
    const revenueMayorista6m = agg?.revenueMayorista6m ?? 0;

    // SAG enrichment for this product
    const enrichment = enrichmentMap.get((p.externalId ?? "").toUpperCase());

    // Entry dates: prefer SAG receipt dates
    const sagFirstEntry = enrichment?.firstEntryDate ?? null;
    const sagLastEntry = enrichment?.lastEntryDate ?? null;
    const entryDateQuality: DataQuality = sagFirstEntry ? "CONFIRMED" : "UNAVAILABLE";
    const entryDate = sagFirstEntry ?? null;
    const lastEntryDate = sagLastEntry;

    // "Days since last restock" — only from CONFIRMED last receipt date
    const entryDateSource: EntryDateSource = sagLastEntry ? "SAG_RECEIPT" : "NONE";
    const daysSinceLastEntry = sagLastEntry
      ? Math.floor((Date.now() - new Date(sagLastEntry).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Total imported: only CONFIRMED from SAG receipts
    const sagTotalImported = enrichment?.totalImported ?? null;
    const totalImportedQuality: DataQuality = sagTotalImported !== null ? "CONFIRMED" : "UNAVAILABLE";
    const totalImported = sagTotalImported ?? null;

    // percentSold: only calculate when totalImported is CONFIRMED
    const percentSold = totalImportedQuality === "CONFIRMED" && totalImported !== null && totalImported > 0
      ? Math.round((soldNet / totalImported) * 100)
      : null;

    // Batch count: from SAG receipts
    const batchCount = enrichment?.batchCount ?? 0;
    const receiptCount = enrichment?.receipts.length ?? 0;

    // Receipt summaries for UI
    const receipts: ImportReceiptSummary[] = (enrichment?.receipts ?? []).map(r => ({
      documentNumber: r.documentNumber,
      date: r.date,
      quantity: r.quantity,
      providerName: r.providerName,
      fuenteCode: r.fuenteCode,
    }));

    // Prices: prefer SAG PV3/PV4, fallback to Prisma price for PV3
    const pricePV3 = enrichment?.prices.pricePV3 ?? p.price ?? null;
    const pricePV4 = enrichment?.prices.pricePV4 ?? null;

    // Channel classification from per-line classification
    const salesDetal6m = agg?.detal6m ?? 0;
    const salesMayorista6m = agg?.mayorista6m ?? 0;
    const salesNoDet6m = agg?.noDet6m ?? 0;
    const soldDetal = agg?.detalAll ?? 0;
    const soldMayorista = agg?.mayoristaAll ?? 0;
    const soldNoDet = agg?.noDetAll ?? 0;

    const classifiedUnits = agg?.classifiedUnits ?? 0;
    const channelConfidence = classifiedUnits > 0
      ? Math.round(((agg?.confidenceSum ?? 0) / classifiedUnits) * 100) / 100
      : 0;

    const hasClassification = soldDetal > 0 || soldMayorista > 0;
    const channelQuality: DataQuality = hasClassification ? "ESTIMATED" : "UNAVAILABLE";
    const channelPending = !hasClassification;

    let dominantChannel: "detal" | "mayorista" | "equilibrado" | "sin_datos" = "sin_datos";
    if (hasClassification) {
      const totalClassified = soldDetal + soldMayorista;
      if (totalClassified > 0) {
        const detalRatio = soldDetal / totalClassified;
        if (detalRatio > 0.6) dominantChannel = "detal";
        else if (detalRatio < 0.4) dominantChannel = "mayorista";
        else dominantChannel = "equilibrado";
      }
    }

    const { status, motivo } = computeRepurchaseDecision({
      percentSold, remaining, totalStock, sold: soldNet, salesTotal6m: sales6mNet, batchCount,
      stockDataQuality,
    });

    return {
      productId: p.id,
      reference: p.externalId ?? "\u2014",
      description: p.name ?? "\u2014",
      entryDate,
      entryDateQuality,
      lastEntryDate,
      container: null,
      pricePV4,
      pricePV3,
      totalImported,
      totalImportedQuality,
      soldGross,
      returns,
      soldNet,
      sold,
      remaining,
      stockDataQuality,
      totalStock,
      percentSold,
      daysSinceLastEntry,
      entryDateSource,
      daysInWarehouse: daysSinceLastEntry,
      repurchaseStatus: status,
      repurchaseMotivo: motivo,
      salesDataQuality: (salesQuerySucceeded ? "SYNCED" : "UNAVAILABLE") as SalesDataQuality,
      sales6mGross,
      returns6m,
      sales6mNet,
      salesTotal6m,
      salesDetal6m,
      salesMayorista6m,
      salesNoDet6m,
      soldDetal,
      soldMayorista,
      soldNoDet,
      channelQuality,
      channelPending,
      channelConfidence,
      batchCount,
      dominantChannel,
      receiptCount,
      receipts,
      revenueAll,
      revenue6m,
      revenueDetal6m,
      revenueMayorista6m,
    };
  });

  // Clear cached enrichment
  _cachedEnrichment = null;

  return references;
}

// Cache to avoid double SAG call
let _cachedEnrichment: Map<string, ProductEnrichment> | null = null;

// ── Summary ─────────────────────────────────────────────────────────────────

export async function getImportSummary(orgId: string): Promise<ImportSummary> {
  const refs = await listImportedReferences(orgId);
  const totalRemaining = refs.reduce((s, r) => s + r.remaining, 0);
  const totalImported = refs.every(r => r.totalImportedQuality === "CONFIRMED")
    ? refs.reduce((s, r) => s + (r.totalImported ?? 0), 0)
    : null;
  const repurchaseSuggested = refs.filter(r => r.repurchaseStatus === "RECOMPRAR").length;
  const topVentasActuales = refs.filter(r => r.salesTotal6m > 0).length;
  const refsCriticas = refs.filter(r => r.remaining > 0 && r.remaining <= 20 && r.salesTotal6m > 0).length;

  return {
    totalReferences: refs.length,
    totalUnitsImported: totalImported,
    totalRemaining,
    repurchaseSuggested,
    topVentasActuales,
    refsCriticas,
    sagValidated: refs.length > 0,
  };
}

// ── Reference detail (for drawer) ───────────────────────────────────────────

export async function getImportReferenceDetail(
  orgId: string,
  productId: string,
): Promise<ImportReferenceDetail | null> {
  const refs = await listImportedReferences(orgId);
  const ref = refs.find(r => r.productId === productId);
  if (!ref) return null;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const monthlyMap = new Map<string, MonthlySale>();
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, { month: key, detal: 0, mayorista: 0, noDet: 0, total: 0 });
  }

  if (ref.reference !== "\u2014") {
    try {
      const lines = await (prisma as any).customerOrderLine.findMany({
        where: {
          organizationId: orgId,
          referenceCode: ref.reference,
          order: { status: "FACTURADO", orderDate: { gte: sixMonthsAgo } },
        },
        select: {
          quantity: true,
          unitValue: true,
          order: { select: { orderDate: true } },
        },
      });

      for (const line of lines) {
        const d = new Date(line.order.orderDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const entry = monthlyMap.get(key);
        if (!entry) continue;
        const qty = Number(line.quantity ?? 0);

        // Only count positive quantities as sales in monthly view
        if (qty <= 0) continue;

        entry.total += qty;

        // Per-line classification
        const uv = Number(line.unitValue ?? 0);
        if (uv > 0 && (ref.pricePV3 || ref.pricePV4)) {
          const result = classifySale(
            { price: { unitValue: uv, pricePV3: ref.pricePV3, pricePV4: ref.pricePV4 } },
            "castillitos",
          );
          if (result.channel === "DETAL") entry.detal += qty;
          else if (result.channel === "MAYORISTA") entry.mayorista += qty;
          else entry.noDet += qty;
        } else {
          entry.noDet += qty;
        }
      }
    } catch {
      // Query failed — show empty monthly data
    }
  }

  const monthlySales = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  return { ...ref, monthlySales };
}

// ── Repurchase logic ────────────────────────────────────────────────────────

function computeRepurchaseDecision(input: {
  percentSold: number | null;
  remaining: number;
  totalStock: number;
  sold: number;
  salesTotal6m: number;
  batchCount: number;
  stockDataQuality: StockDataQuality;
}): { status: RepurchaseStatus; motivo: RepurchaseMotivo } {
  const { percentSold, remaining, totalStock, sold, salesTotal6m, batchCount, stockDataQuality } = input;

  if (sold === 0) {
    return { status: "SIN_DATOS", motivo: "sin_datos" };
  }

  // Import warehouse depleted + active demand — ONLY with confirmed stock data
  if (stockDataQuality === "CONFIRMED" && remaining <= 20 && salesTotal6m > 0) {
    return { status: "RECOMPRAR", motivo: "desabastecimiento" };
  }

  // High rotation: requires confirmed stock + current active demand
  if (stockDataQuality === "CONFIRMED" && percentSold !== null && percentSold >= 70 && salesTotal6m > 10 && remaining <= 50) {
    return { status: "RECOMPRAR", motivo: "alta_rotacion" };
  }

  // Historical success: RECOMPRAR only with current supply risk, otherwise VIGILAR
  if (percentSold !== null && sold >= 200 && percentSold >= 80) {
    if (stockDataQuality === "CONFIRMED" && remaining <= 50 && salesTotal6m > 0) {
      return { status: "RECOMPRAR", motivo: "exito_historico" };
    }
    return { status: "VIGILAR", motivo: "exito_historico" };
  }

  // Recurring repurchase: RECOMPRAR only with current supply risk, otherwise VIGILAR
  if (batchCount > 1 && percentSold !== null && percentSold >= 60) {
    if (stockDataQuality === "CONFIRMED" && remaining <= 50 && salesTotal6m > 0) {
      return { status: "RECOMPRAR", motivo: "recompra_recurrente" };
    }
    return { status: "VIGILAR", motivo: "recompra_recurrente" };
  }

  // Active demand but sufficient stock
  if (salesTotal6m > 0 && (remaining > 50 || totalStock > 50)) {
    return { status: "VIGILAR", motivo: "stock_suficiente" };
  }

  if (percentSold !== null && percentSold >= 40) {
    return { status: "VIGILAR", motivo: "stock_suficiente" };
  }

  return { status: "NO_RECOMPRAR", motivo: "baja_rotacion" };
}
