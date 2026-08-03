/**
 * lib/comercial/tiendas/store-sale-line-service.ts
 *
 * AGENTIK-STORES-PRODUCT-SALES-SYNC-01 — Reader service for store product sales.
 *
 * Reads StoreSaleLineRecord from Prisma and aggregates by reference code.
 * Produces StoreProductSalesAggregate for each reference sold in a store.
 *
 * SERVER ONLY — never import from client components.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  StoreProductSaleFact,
  StoreProductSalesAggregate,
  StoreProductSalesSummary,
} from "./store-sale-line-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (prisma as any).storeSaleLineRecord;

// ── Load raw facts ───────────────────────────────────────────────────────────

export async function loadStoreProductSaleFacts(
  orgId: string,
  storeId: string,
  dateFrom: string,
  dateTo: string,
): Promise<StoreProductSaleFact[]> {
  const rows = await db().findMany({
    where: {
      organizationId: orgId,
      storeId,
      documentDate: {
        gte: new Date(dateFrom),
        lte: new Date(dateTo),
      },
    },
    orderBy: { documentDate: "desc" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    erpItemId:       r.erpItemId,
    erpMovId:        r.erpMovId,
    referenceCode:   r.referenceCode,
    articleName:     r.articleName,
    quantity:        Number(r.quantity),
    lineTotal:       Number(r.lineTotal),
    discountPercent: Number(r.discountPercent),
    ivaRate:         Number(r.ivaRate),
    size:            r.size,
    color:           r.color,
    documentDate:    r.documentDate instanceof Date
      ? r.documentDate.toISOString().slice(0, 10)
      : String(r.documentDate).slice(0, 10),
    comprobanteCode: r.comprobanteCode,
    comprobante:     r.comprobante,
    storeId:         r.storeId,
    storeName:       r.storeName,
    documentFamily:  r.documentFamily,
  }));
}

// ── Aggregate by reference ───────────────────────────────────────────────────

export async function loadStoreProductSales(
  orgId: string,
  storeId: string,
  dateFrom: string,
  dateTo: string,
): Promise<StoreProductSalesSummary> {
  const facts = await loadStoreProductSaleFacts(orgId, storeId, dateFrom, dateTo);

  // Group by referenceCode
  const refMap = new Map<string, {
    articleName: string;
    invoiceUnits: number;
    invoiceTotal: number;
    creditNoteUnits: number;
    creditNoteTotal: number;
    sizes: Set<string>;
    colors: Set<string>;
    firstDate: string | null;
    lastDate: string | null;
    lineCount: number;
  }>();

  let totalInvoiceAmount = 0;
  let totalCreditAmount = 0;

  for (const fact of facts) {
    let entry = refMap.get(fact.referenceCode);
    if (!entry) {
      entry = {
        articleName: fact.articleName,
        invoiceUnits: 0,
        invoiceTotal: 0,
        creditNoteUnits: 0,
        creditNoteTotal: 0,
        sizes: new Set<string>(),
        colors: new Set<string>(),
        firstDate: null,
        lastDate: null,
        lineCount: 0,
      };
      refMap.set(fact.referenceCode, entry);
    }

    if (fact.documentFamily === "FACTURA") {
      entry.invoiceUnits += fact.quantity;
      entry.invoiceTotal += fact.lineTotal;
      totalInvoiceAmount += fact.lineTotal;
    } else {
      // NOTA_CREDITO: quantity positive, lineTotal negative
      entry.creditNoteUnits += fact.quantity;
      entry.creditNoteTotal += Math.abs(fact.lineTotal);
      totalCreditAmount += Math.abs(fact.lineTotal);
    }

    if (fact.size) entry.sizes.add(fact.size);
    if (fact.color) entry.colors.add(fact.color);

    if (!entry.firstDate || fact.documentDate < entry.firstDate) {
      entry.firstDate = fact.documentDate;
    }
    if (!entry.lastDate || fact.documentDate > entry.lastDate) {
      entry.lastDate = fact.documentDate;
    }

    entry.lineCount++;
  }

  const aggregates: StoreProductSalesAggregate[] = [];
  for (const [referenceCode, entry] of refMap) {
    aggregates.push({
      referenceCode,
      articleName: entry.articleName,
      invoiceUnits: entry.invoiceUnits,
      invoiceTotal: entry.invoiceTotal,
      creditNoteUnits: entry.creditNoteUnits,
      creditNoteTotal: entry.creditNoteTotal,
      netUnits: entry.invoiceUnits - entry.creditNoteUnits,
      netTotal: entry.invoiceTotal - entry.creditNoteTotal, // NC total is absolute, so subtract
      sizeCount: entry.sizes.size,
      colorCount: entry.colors.size,
      firstSaleDate: entry.firstDate,
      lastSaleDate: entry.lastDate,
      lineCount: entry.lineCount,
    });
  }

  // Sort by netTotal descending (top sellers first)
  aggregates.sort((a, b) => b.netTotal - a.netTotal);

  // Resolve store name from first fact or storeId
  const storeName = facts.length > 0 ? facts[0].storeName : storeId;

  return {
    storeId,
    storeName,
    dateFrom,
    dateTo,
    totalReferences: aggregates.length,
    totalLines: facts.length,
    totalInvoiceAmount,
    totalCreditAmount,
    totalNetAmount: totalInvoiceAmount - totalCreditAmount,
    aggregates,
  };
}
