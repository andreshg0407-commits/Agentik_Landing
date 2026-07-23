/**
 * lib/comercial/pedidos/order-service.ts
 *
 * Persistence layer for the Pedidos module.
 * Uses AgentExecution with operation COMERCIAL_ORDER_DRAFT.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-CREATOR-01
 * Sprint: COMERCIAL-PEDIDOS-HIBRIDO-SAG-AGENTIK
 * Sprint: COMERCIAL-PEDIDOS-ENTERPRISE-05
 * Sprint: COMERCIAL-PEDIDOS-SAG-DATA-07
 * Sprint: SAG-ORDER-LINES-SYNC-01
 * Sprint: COMERCIAL-PEDIDOS-LINE-INVENTORY-LINK-04
 * Sprint: PEDIDOS-VARIANT-ENRICHMENT-01
 * Sprint: PEDIDOS-VENDEDOR-RESOLUTION-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { enrichOrderLinesWithInventory } from "./inventory-link-service";
import { enrichOrderLinesWithVariants } from "./variant-enrichment-service";
import { resolveSellerForSagOrder } from "./seller-resolution-service";
import type {
  OrderDraft,
  OrderHeader,
  OrderLine,
  OrderStatus,
  OrderOrigin,
  OrderSyncState,
  OrderCard,
  OrderSummary,
  OrderDuplicateCheck,
} from "./order-types";
import { computeOrderSummary } from "./order-validation";
import type { OrderTimelineEvent, OrderVersion, SagDocumentReference } from "./order-core-types";
import { createdInAgentikEvent } from "./order-timeline";
import {
  searchCustomers as canonicalSearchCustomers,
  getCustomerBySagCode,
} from "@/lib/comercial/clientes/canonical-customer-service";
import { validateCustomerForSagOrder } from "@/lib/comercial/clientes/customer-sag-validation";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_ORDER_DRAFT";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── Row → OrderDraft mapping ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToOrder(row: any): OrderDraft {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  const lines = (meta.lines ?? []) as OrderLine[];
  const summary = (meta.summary ?? computeOrderSummary(lines)) as OrderSummary;

  return {
    id:             row.id,
    organizationId: (meta.organizationId as string) ?? row.tenantId ?? "",
    consecutivo:    (meta.consecutivo as number) ?? 0,
    header:         (meta.header as OrderHeader) ?? {
      customerId:   "",
      customerName: "",
      customerCode: "",
      sellerId:     "",
      sellerName:   "",
      channel:      "",
      notes:        "",
    },
    lines,
    status:         (meta.status as OrderStatus)       ?? "borrador",
    origin:         (meta.origin as OrderOrigin)       ?? "agentik",
    syncState:      (meta.syncState as OrderSyncState) ?? "nunca_sincronizado",
    summary,
    createdBy:      (meta.createdBy as string) ?? row.createdBy ?? "usuario",
    createdAt:      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt:      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? row.createdAt),
    lastSyncAt:          (meta.lastSyncAt as string | null) ?? null,
    sagOrderId:          (meta.sagOrderId as string | null) ?? null,
    sagError:            (meta.sagError as string | null)   ?? null,
    externalSyncKey:     (meta.externalSyncKey as string)   ?? row.id ?? "",
    sagInvoiceIds:       (meta.sagInvoiceIds as string[])   ?? [],
    sourceWarehouseCode: (meta.sourceWarehouseCode as string | null) ?? null,
    fulfillmentStatus:   (meta.fulfillmentStatus as OrderDraft["fulfillmentStatus"]) ?? "sin_factura",
    fulfillmentPercent:  (meta.fulfillmentPercent as number) ?? 0,
    timeline:            (meta.timeline as OrderTimelineEvent[]) ?? [],
    commercialJourneyId: (meta.commercialJourneyId as string) ?? row.id ?? "",
    versions:            (meta.versions as OrderVersion[]) ?? [],
    linkedDocuments:     (meta.linkedDocuments as SagDocumentReference[]) ?? [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCard(row: any): OrderCard {
  const meta    = (row.metadataJson ?? {}) as Record<string, unknown>;
  const header  = (meta.header as OrderHeader | undefined);
  const summary = (meta.summary ?? {}) as Partial<OrderSummary>;

  return {
    id:              row.id,
    consecutivo:     (meta.consecutivo as number) ?? 0,
    customerName:    header?.customerName ?? "",
    sellerName:      header?.sellerName   ?? "",
    totalReferences: summary.uniqueReferences ?? 0,
    totalUnits:      summary.totalUnits       ?? 0,
    totalValue:      summary.totalValue       ?? 0,
    status:          (meta.status    as OrderStatus)    ?? "borrador",
    origin:          (meta.origin    as OrderOrigin)    ?? "agentik",
    syncState:       (meta.syncState as OrderSyncState) ?? "nunca_sincronizado",
    createdAt:       row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    lastSyncAt:      (meta.lastSyncAt as string | null) ?? null,
  };
}

// ── Internal update helper ─────────────────────────────────────────────────────

async function patchOrderMeta(
  orgId:   string,
  orderId: string,
  patch:   (current: OrderDraft) => Record<string, unknown> | null,
): Promise<OrderDraft | null> {
  const order = await getOrder(orgId, orderId);
  if (!order) return null;

  const metaPatch = patch(order);
  if (metaPatch === null) return order; // guard rejected — return current state

  const row = await execDb().update({
    where: { id: orderId },
    data:  { metadataJson: metaPatch },
  });

  return rowToOrder(row);
}

// ── Create order draft ────────────────────────────────────────────────────────

export async function createOrderDraft(
  orgId: string,
  data: {
    header:    OrderHeader;
    lines:     OrderLine[];
    createdBy: string;
  },
): Promise<OrderDraft> {
  // Generate consecutive number: count existing + 1
  let consecutivo = 1;
  try {
    const count = await execDb().count({
      where: {
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
    });
    consecutivo = (count as number) + 1;
  } catch {
    // If count fails, fall back to 1
  }

  const status:    OrderStatus    = "borrador";
  const origin:    OrderOrigin    = "agentik";
  const syncState: OrderSyncState = "nunca_sincronizado";
  const summary   = computeOrderSummary(data.lines, {
    type:  data.header.discountType,
    value: data.header.discountValue,
  });
  const now       = new Date().toISOString();

  // Idempotent sync key: orgId + consecutivo + timestamp
  const externalSyncKey = `AGK-${orgId.slice(0, 8)}-PED-${consecutivo}-${Date.now()}`;

  // Permanent journey ID — never changes, never reused
  const commercialJourneyId = `CJ-${orgId.slice(0, 8)}-${consecutivo}-${Date.now()}`;

  const timeline = [createdInAgentikEvent(consecutivo, data.createdBy)];

  const metadataJson = {
    organizationId: orgId,
    consecutivo,
    header:         data.header,
    lines:          data.lines,
    summary,
    status,
    origin,
    syncState,
    createdBy:      data.createdBy,
    createdAt:      now,
    updatedAt:      now,
    lastSyncAt:     null,
    sagOrderId:     null,
    sagError:       null,
    externalSyncKey,
    sagInvoiceIds:       [],
    sourceWarehouseCode: null,
    fulfillmentStatus:   "sin_factura",
    fulfillmentPercent:  0,
    timeline,
    commercialJourneyId,
    versions:            [],
    linkedDocuments:     [],
  };

  const row = await execDb().create({
    data: {
      tenantId:     orgId,
      module:       MODULE,
      operation:    OPERATION,
      status:       "pending",
      createdBy:    data.createdBy,
      intent:       `Pedido #${consecutivo} — ${data.header.customerName}`,
      metadataJson,
    },
  });

  return rowToOrder(row);
}

// ── Get single order ──────────────────────────────────────────────────────────

export async function getOrder(
  orgId:   string,
  orderId: string,
): Promise<OrderDraft | null> {
  let draft: OrderDraft | null = null;

  // Try AgentExecution first (Agentik-created orders)
  try {
    const row = await execDb().findFirst({
      where: {
        id:        orderId,
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
    });
    if (row) draft = rowToOrder(row);
  } catch {
    // AgentExecution not available
  }

  // Fallback: CRMQuote (CRM quotes) — include synced quote lines
  if (!draft) {
    try {
      const q = await prisma.cRMQuote.findFirst({
        where: { id: orderId, organizationId: orgId },
        include: { quoteLines: true },
      });
      if (q) draft = crmQuoteToOrderDraft(q);
    } catch {
      // CRMQuote not available
    }
  }

  // Fallback: CustomerOrderRecord (real SAG orders) — include lines
  if (!draft) {
    try {
      const cor = await prisma.customerOrderRecord.findFirst({
        where: { id: orderId, organizationId: orgId },
        include: { lines: true },
      });
      if (cor) draft = customerOrderRecordToOrderDraft(cor);
    } catch {
      // CustomerOrderRecord not available
    }
  }

  // Resolve seller for SAG orders via ka_nl_tercero_vend (VENDEDOR-RESOLUTION-01)
  if (draft && draft.origin === "sag_customer_order" && !draft.header.sellerName) {
    const resolved = await resolveSellerForSagOrder(orgId, draft.sagOrderId, draft.header.customerCode);
    if (resolved.sellerName && (resolved.confidence === "high" || resolved.confidence === "medium")) {
      draft.header.sellerName = resolved.sellerName;
      draft.header.sellerId = resolved.sellerCode ?? "";
      draft.sellerSource = resolved.source;
      draft.sellerConfidence = resolved.confidence;
    }
  }

  // Enrich lines with real inventory data (LINE-INVENTORY-LINK-04)
  if (draft && draft.lines.length > 0) {
    draft = await enrichDraftWithInventory(orgId, draft);
  }

  // Enrich lines with variant data: color names, subgrupo, productLine (VARIANT-ENRICHMENT-01)
  if (draft && draft.lines.length > 0) {
    await enrichOrderLinesWithVariants(orgId, draft.lines);
  }

  return draft;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function crmQuoteToOrderDraft(q: any): OrderDraft {
  const raw   = ((q.rawCrmJson as any)?.raw ?? {}) as Record<string, unknown>;
  const stage = raw.stage as string | undefined;
  const status = crmStageToOrderStatus(stage);
  const sagOrderId = (raw.id_sag_c as string | undefined) || null;
  const customerName = (raw.billing_account as string) ?? "";
  const sellerName   = (raw.created_by_name as string) ?? q.sellerName ?? "";
  const totalValue   = raw.total_amount != null ? Number(raw.total_amount) : Number(q.amount ?? 0);
  const issuedAt     = q.issuedAt instanceof Date ? q.issuedAt.toISOString() : String(q.issuedAt);
  const consecutivo  = q.quoteNumber ? parseInt(q.quoteNumber, 10) || 0 : 0;

  // ── Convert CRMQuoteLines → OrderLines (SAG-ORDER-LINES-SYNC-01) ──────────
  const quoteLines: any[] = q.quoteLines ?? [];
  const lines: OrderLine[] = quoteLines.map((ql: any) => {
    const qty   = ql.qty != null ? Number(ql.qty) : 0;
    const price = ql.unitPrice != null ? Number(ql.unitPrice) : 0;
    const total = ql.totalPrice != null ? Number(ql.totalPrice) : qty * price;

    return {
      id:             ql.id,
      referenceCode:  ql.reference ?? "",
      productName:    ql.productName ?? ql.reference ?? "",
      size:           ql.size ?? "",
      color:          ql.color ?? "",
      quantity:       qty,
      availableUnits: null, // inventory not linked here — Pedidos search handles that
      unitPrice:      price,
      lineTotal:      total,
      removed:        false,
      comment:        "",
    };
  });

  const totalUnits       = lines.reduce((s, l) => s + l.quantity, 0);
  const uniqueRefs       = new Set(lines.map(l => l.referenceCode)).size;
  const computedTotal    = lines.length > 0
    ? lines.reduce((s, l) => s + l.lineTotal, 0)
    : totalValue;

  return {
    id:             q.id,
    organizationId: q.organizationId,
    consecutivo,
    header: {
      customerId:   "",
      customerName,
      customerCode: (raw.billing_account_id as string) ?? "",
      sellerId:     "",
      sellerName,
      channel:      (raw.lista_precios_c as string) ?? "",
      notes:        (raw.description as string) ?? "",
    },
    lines,
    status,
    origin:     "sag",
    syncState:  sagOrderId ? "sincronizado" : "nunca_sincronizado",
    summary: {
      totalValue:       lines.length > 0 ? computedTotal : totalValue,
      totalUnits,
      uniqueReferences: uniqueRefs,
      totalLines:       lines.length,
      activeLines:      lines.length,
    },
    createdBy:  sellerName,
    createdAt:  issuedAt,
    updatedAt:  q.updatedAt instanceof Date ? q.updatedAt.toISOString() : issuedAt,
    lastSyncAt:          sagOrderId ? issuedAt : null,
    sagOrderId,
    sagError:            (raw.respuesta_sag_c as string) || null,
    externalSyncKey:     q.crmId ?? q.id,
    sagInvoiceIds:       [],
    sourceWarehouseCode: (raw.bodega_c as string) || null,
    fulfillmentStatus:   "sin_factura",
    fulfillmentPercent:  0,
    timeline:            [],
    commercialJourneyId: q.crmId ?? q.id,
    versions:            [],
    linkedDocuments:     [],
  };
}

// ── Inventory enrichment (LINE-INVENTORY-LINK-04) ────────────────────────────

async function enrichDraftWithInventory(
  orgId: string,
  draft: OrderDraft,
): Promise<OrderDraft> {
  try {
    const enriched = await enrichOrderLinesWithInventory(
      orgId,
      draft.lines.map((l) => ({
        id: l.id,
        reference: l.referenceCode,
        size: l.size,
        color: l.color,
        qty: l.quantity,
      })),
    );

    // Merge availableUnits back into draft lines
    const enrichedMap = new Map(enriched.map((e) => [e.lineId, e]));
    const newLines = draft.lines.map((line) => {
      const e = enrichedMap.get(line.id);
      if (!e) return line;
      return { ...line, availableUnits: e.availableUnits };
    });

    return { ...draft, lines: newLines };
  } catch {
    // Inventory enrichment failed — return draft as-is (all null)
    return draft;
  }
}

// ── CRM stage → OrderStatus mapping ──────────────────────────────────────────

function crmStageToOrderStatus(stage: string | undefined): OrderStatus {
  if (!stage) return "borrador";
  switch (stage) {
    case "Confirmado":              return "sincronizado";
    case "Pendiente":
    case "Esperando_validacion":    return "pendiente_sag";
    case "No_Gestionado":           return "listo_para_enviar";
    case "Anulado":                 return "cancelado";
    default:                        return "borrador";
  }
}

// ── CustomerOrderRecord → OrderStatus mapping ────────────────────────────────

function customerOrderStatusToOrderStatus(status: string): OrderStatus {
  switch (status) {
    case "FACTURADO":   return "sincronizado";
    case "CONFIRMADO":  return "sincronizado";
    case "DESPACHADO":  return "sincronizado";
    case "PENDIENTE":   return "pendiente_sag";
    case "CANCELADO":   return "cancelado";
    default:            return "pendiente_sag";
  }
}

// ── List CustomerOrderRecords (real SAG orders) ──────────────────────────────

export async function listCustomerOrderRecords(
  orgId: string,
  opts?: { since?: Date; take?: number },
): Promise<OrderCard[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { organizationId: orgId };
    if (opts?.since) {
      where.orderDate = { gte: opts.since };
    }
    const records = await prisma.customerOrderRecord.findMany({
      where,
      orderBy: { orderDate: "desc" },
      take:    opts?.take ?? 500,
      include: { _count: { select: { lines: true } } },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return records.map((r: any): OrderCard => {
      const status = customerOrderStatusToOrderStatus(r.status);
      const orderDate = r.orderDate instanceof Date
        ? r.orderDate.toISOString()
        : String(r.orderDate);

      return {
        id:              r.id,
        consecutivo:     r.orderNumber ? parseInt(r.orderNumber, 10) || 0 : 0,
        customerName:    r.customerName ?? "",
        sellerName:      "",
        totalReferences: r._count?.lines ?? 0,
        totalUnits:      0,
        totalValue:      r.amount != null ? Number(r.amount) : 0,
        status,
        origin:          "sag_customer_order",
        syncState:       "sincronizado",
        createdAt:       orderDate,
        lastSyncAt:      r.syncedAt instanceof Date ? r.syncedAt.toISOString() : String(r.syncedAt),
      };
    });
  } catch {
    return [];
  }
}

// ── CustomerOrderRecord → OrderDraft (for detail view) ──────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customerOrderRecordToOrderDraft(r: any): OrderDraft {
  const status = customerOrderStatusToOrderStatus(r.status);
  const orderDate = r.orderDate instanceof Date ? r.orderDate.toISOString() : String(r.orderDate);
  const syncedAt  = r.syncedAt instanceof Date ? r.syncedAt.toISOString() : String(r.syncedAt);

  // Map lines if included
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawLines: any[] = r.lines ?? [];
  const lines: OrderLine[] = rawLines.map((l: any) => ({
    id:             l.id,
    referenceCode:  l.referenceCode ?? "",
    productName:    l.articleName ?? l.referenceCode ?? "",
    size:           l.size ?? "",
    color:          l.color ?? "",
    quantity:       l.quantity != null ? Number(l.quantity) : 0,
    availableUnits: null,
    unitPrice:      l.unitValue != null ? Number(l.unitValue) : 0,
    lineTotal:      l.quantity != null && l.unitValue != null
      ? Number(l.quantity) * Number(l.unitValue)
      : 0,
    removed:        false,
    comment:        "",
  }));

  const totalUnits  = lines.reduce((s, l) => s + l.quantity, 0);
  const totalValue  = lines.length > 0
    ? lines.reduce((s, l) => s + l.lineTotal, 0)
    : Number(r.amount ?? 0);
  const uniqueRefs  = new Set(lines.map(l => l.referenceCode)).size;

  return {
    id:             r.id,
    organizationId: r.organizationId,
    consecutivo:    r.orderNumber ? parseInt(r.orderNumber, 10) || 0 : 0,
    header: {
      customerId:   r.customerNit ?? "",
      customerName: r.customerName ?? "",
      customerCode: r.customerNit ?? "",
      sellerId:     "",
      sellerName:   "",
      channel:      "",
      notes:        "",
    },
    lines,
    status,
    origin:     "sag_customer_order",
    syncState:  "sincronizado",
    summary: {
      totalValue,
      totalUnits,
      uniqueReferences: uniqueRefs,
      totalLines:       lines.length,
      activeLines:      lines.length,
    },
    createdBy:           "",
    createdAt:           orderDate,
    updatedAt:           syncedAt,
    lastSyncAt:          syncedAt,
    sagOrderId:          String(r.erpMovId),
    sagError:            null,
    externalSyncKey:     `COR-${r.erpMovId}`,
    sagInvoiceIds:       [],
    sourceWarehouseCode: null,
    fulfillmentStatus:   status === "sincronizado" ? "facturado_completo" : "sin_factura",
    fulfillmentPercent:  status === "sincronizado" ? 100 : 0,
    timeline:            [],
    commercialJourneyId: `COR-${r.erpMovId}`,
    versions:            [],
    linkedDocuments:     [],
  };
}

// ── Seller resolution for CustomerOrderRecord ──────────────────────────────
// CustomerOrderRecord has no seller field (SAG MOVIMIENTOS doesn't include it).
// Attempt to resolve seller from SaleRecord by customerNit (most recent sale).

async function resolveSellerForCustomerOrder(
  orgId: string,
  customerNit: string | null,
): Promise<{ sellerName: string; sellerCode: string } | null> {
  if (!customerNit) return null;
  try {
    const sale = await (prisma as any).saleRecord.findFirst({
      where: {
        organizationId: orgId,
        customerNit,
        sellerName: { not: null },
      },
      orderBy: { saleDate: "desc" },
      select: { sellerName: true, sellerCode: true },
    });
    if (!sale?.sellerName || sale.sellerName === "Sin Vendedor") return null;
    return { sellerName: sale.sellerName, sellerCode: sale.sellerCode ?? "" };
  } catch {
    return null;
  }
}

// ── Max order date from CustomerOrderRecord (freshness metric) ──────────────

export async function getMaxCustomerOrderDate(
  orgId: string,
): Promise<string | null> {
  try {
    const result = await prisma.customerOrderRecord.findFirst({
      where:   { organizationId: orgId },
      orderBy: { orderDate: "desc" },
      select:  { orderDate: true },
    });
    if (!result) return null;
    return result.orderDate instanceof Date
      ? result.orderDate.toISOString()
      : String(result.orderDate);
  } catch {
    return null;
  }
}

// ── List SAG orders (CRMQuote) ────────────────────────────────────────────────

export async function listSagOrders(
  orgId: string,
  opts?: { since?: Date },
): Promise<OrderCard[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { organizationId: orgId };
    if (opts?.since) {
      where.issuedAt = { gte: opts.since };
    }
    const quotes = await prisma.cRMQuote.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      take:    500,
      include: { _count: { select: { quoteLines: true } } },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return quotes.map((q: any): OrderCard => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw  = ((q.rawCrmJson as any)?.raw ?? {}) as Record<string, unknown>;
      const stage = raw.stage as string | undefined;
      const status = crmStageToOrderStatus(stage);

      const totalValue = raw.total_amount != null
        ? Number(raw.total_amount)
        : Number(q.amount ?? 0);

      const customerName = (raw.billing_account as string | undefined)
        ?? q.sellerName
        ?? "";

      const sellerName = (raw.created_by_name as string | undefined)
        ?? q.sellerName
        ?? "";

      const sagOrderId = (raw.id_sag_c as string | undefined) ?? null;

      const syncState: OrderSyncState = sagOrderId
        ? "sincronizado"
        : "nunca_sincronizado";

      const issuedAt = q.issuedAt instanceof Date
        ? q.issuedAt.toISOString()
        : String(q.issuedAt ?? q.createdAt);

      return {
        id:              q.id,
        consecutivo:     q.quoteNumber ? parseInt(q.quoteNumber, 10) || 0 : 0,
        customerName,
        sellerName,
        totalReferences: q._count?.quoteLines ?? 0,
        totalUnits:      0, // unit sum requires full line load — kept light
        totalValue,
        status,
        origin:          "sag",
        syncState,
        createdAt:       issuedAt,
        lastSyncAt:      sagOrderId ? issuedAt : null,
      };
    });
  } catch {
    return [];
  }
}

// ── List orders ───────────────────────────────────────────────────────────────

export async function listOrders(
  orgId:   string,
  filter?: {
    status?: OrderStatus;
    today?:  boolean;
  },
): Promise<OrderCard[]> {
  let result: OrderCard[] = [];

  // ── AgentExecution rows (may not be available) ───────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      tenantId:  orgId,
      module:    MODULE,
      operation: OPERATION,
    };

    if (filter?.today) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      where.createdAt = { gte: startOfDay };
    }

    const rows = await execDb().findMany({
      where,
      orderBy: { createdAt: "desc" },
      take:    200,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = rows.map((r: any) => rowToCard(r));
  } catch {
    // AgentExecution not available — continue with SAG only
  }

  // ── CRMQuote rows (CRM quotes) — always attempted ─────────────────────
  try {
    const sagSince = filter?.today
      ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })()
      : undefined;
    const sagCards = await listSagOrders(orgId, sagSince ? { since: sagSince } : undefined);
    result = [...result, ...sagCards];
  } catch {
    // CRMQuote not available — degrade silently
  }

  // ── CustomerOrderRecord rows (real SAG orders) — primary source ───────
  try {
    const corSince = filter?.today
      ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })()
      : undefined;
    const corCards = await listCustomerOrderRecords(orgId, corSince ? { since: corSince } : undefined);
    result = [...result, ...corCards];
  } catch {
    // CustomerOrderRecord not available — degrade silently
  }

  // Status filter applied in-memory (metadataJson field + SAG cards)
  if (filter?.status) {
    const targetStatus = filter.status;
    result = result.filter(c => c.status === targetStatus);
  }

  // Sort merged list by createdAt descending
  result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return result;
}

// ── Update order draft (header and/or lines) ──────────────────────────────────

export async function updateOrderDraft(
  orgId:   string,
  orderId: string,
  data: {
    header?: OrderHeader;
    lines?:  OrderLine[];
  },
): Promise<OrderDraft | null> {
  return await patchOrderMeta(orgId, orderId, (order) => {
    // Allow editing borrador and listo_para_enviar (pre-SAG states)
    if (order.status !== "borrador" && order.status !== "listo_para_enviar") return null;

    const newHeader = data.header ?? order.header;
    const newLines  = data.lines  ?? order.lines;
    const summary   = computeOrderSummary(newLines, {
      type:  newHeader.discountType,
      value: newHeader.discountValue,
    });
    const now       = new Date().toISOString();

    return {
      organizationId: order.organizationId,
      consecutivo:    order.consecutivo,
      header:         newHeader,
      lines:          newLines,
      summary,
      status:         order.status,
      origin:         order.origin,
      syncState:      order.syncState,
      createdBy:      order.createdBy,
      createdAt:      order.createdAt,
      updatedAt:      now,
      lastSyncAt:     order.lastSyncAt,
      sagOrderId:     order.sagOrderId,
      sagError:       order.sagError,
      externalSyncKey:     order.externalSyncKey,
      sagInvoiceIds:       order.sagInvoiceIds,
      sourceWarehouseCode: order.sourceWarehouseCode,
      fulfillmentStatus:   order.fulfillmentStatus,
      fulfillmentPercent:  order.fulfillmentPercent,
      timeline:            order.timeline ?? [],
      commercialJourneyId: order.commercialJourneyId,
      versions:            order.versions ?? [],
      linkedDocuments:     order.linkedDocuments ?? [],
    };
  });
}

// ── Update a single order line ────────────────────────────────────────────────

export async function updateOrderLine(
  orgId:   string,
  orderId: string,
  lineId:  string,
  updates: {
    quantity?: number;
    removed?:  boolean;
    comment?:  string;
  },
): Promise<OrderDraft | null> {
  return await patchOrderMeta(orgId, orderId, (order) => {
    if (order.status !== "borrador") return null;

    const newLines = order.lines.map((l) => {
      if (l.id !== lineId) return l;
      const quantity  = updates.quantity  ?? l.quantity;
      const lineTotal = quantity * l.unitPrice;
      return {
        ...l,
        quantity,
        lineTotal,
        removed: updates.removed ?? l.removed,
        comment: updates.comment ?? l.comment,
      };
    });

    const summary = computeOrderSummary(newLines, {
      type:  order.header.discountType,
      value: order.header.discountValue,
    });
    const now     = new Date().toISOString();

    return {
      organizationId: order.organizationId,
      consecutivo:    order.consecutivo,
      header:         order.header,
      lines:          newLines,
      summary,
      status:         order.status,
      origin:         order.origin,
      syncState:      order.syncState,
      createdBy:      order.createdBy,
      createdAt:      order.createdAt,
      updatedAt:      now,
      lastSyncAt:     order.lastSyncAt,
      sagOrderId:     order.sagOrderId,
      sagError:       order.sagError,
      externalSyncKey:     order.externalSyncKey,
      sagInvoiceIds:       order.sagInvoiceIds,
      sourceWarehouseCode: order.sourceWarehouseCode,
      fulfillmentStatus:   order.fulfillmentStatus,
      fulfillmentPercent:  order.fulfillmentPercent,
      timeline:            order.timeline ?? [],
      commercialJourneyId: order.commercialJourneyId,
      versions:            order.versions ?? [],
      linkedDocuments:     order.linkedDocuments ?? [],
    };
  });
}

// ── Submit order ──────────────────────────────────────────────────────────────

/**
 * Submit order for SAG sync. Validates SAG readiness before allowing the
 * order to leave draft status. FAIL-CLOSED: if the canonical service is
 * unavailable, the order stays in borrador.
 *
 * Sprint: AGENTIK-ORDERS-CUSTOMER-DATA-FOUNDATION-01
 */
export async function submitOrder(
  orgId:   string,
  orderId: string,
): Promise<OrderDraft | null> {
  // Pre-validate: load order to check SAG readiness before patching
  const current = await getOrder(orgId, orderId);
  if (!current || current.status !== "borrador") return current ?? null;

  const sagCode = current.header?.customerCode;

  // Gate: validate customer SAG readiness (fail-closed)
  let validationResult: { ok: boolean; error?: string };
  try {
    validationResult = await validateOrderCustomerForSag(orgId, sagCode);
  } catch {
    // Canonical service unavailable — BLOCK submission (fail-closed)
    validationResult = {
      ok: false,
      error: "No fue posible validar los datos SAG del cliente. Intente nuevamente.",
    };
  }

  if (!validationResult.ok) {
    return await patchOrderMeta(orgId, orderId, (order) => {
      const now = new Date().toISOString();
      return buildMetaSnapshot(order, {
        status: "borrador",
        sagError: validationResult.error ?? "Validacion SAG fallida",
        updatedAt: now,
      });
    });
  }

  return await patchOrderMeta(orgId, orderId, (order) => {
    if (order.status !== "borrador") return null;
    const now = new Date().toISOString();
    return buildMetaSnapshot(order, { status: "listo_para_enviar", updatedAt: now });
  });
}

/**
 * Internal: validate customer data for SAG submission.
 * Returns { ok: true } if SAG_SUBMISSION_READY, { ok: false, error } otherwise.
 * Throws if the canonical service is unavailable (caller must handle).
 */
async function validateOrderCustomerForSag(
  orgId: string,
  sagCode: string | undefined,
): Promise<{ ok: boolean; error?: string }> {
  if (!sagCode) {
    return { ok: false, error: "Cliente sin codigo SAG — no puede enviarse a SAG" };
  }

  const customer = await getCustomerBySagCode(orgId, sagCode);
  if (!customer) {
    return { ok: false, error: `Cliente SAG ${sagCode} no encontrado en el sistema` };
  }

  const readiness = validateCustomerForSagOrder(customer);
  if (readiness.status !== "READY") {
    const reasons = readiness.blockers.map(b => b.reason).join("; ");
    return { ok: false, error: `Validacion SAG: ${reasons}` };
  }

  return { ok: true };
}

// ── Mark pending SAG ──────────────────────────────────────────────────────────

export async function markPendingSag(
  orgId:   string,
  orderId: string,
): Promise<OrderDraft | null> {
  return await patchOrderMeta(orgId, orderId, (order) => {
    if (order.status !== "listo_para_enviar") return null;
    const now = new Date().toISOString();
    return buildMetaSnapshot(order, { status: "pendiente_sag", updatedAt: now });
  });
}

// ── Mark synced ───────────────────────────────────────────────────────────────

export async function markSynced(
  orgId:      string,
  orderId:    string,
  sagOrderId: string,
): Promise<OrderDraft | null> {
  return await patchOrderMeta(orgId, orderId, (order) => {
    const now = new Date().toISOString();
    return buildMetaSnapshot(order, {
      status:     "sincronizado",
      syncState:  "sincronizado",
      sagOrderId,
      lastSyncAt: now,
      sagError:   null,
      updatedAt:  now,
    });
  });
}

// ── Mark conflict ─────────────────────────────────────────────────────────────

export async function markConflict(
  orgId:    string,
  orderId:  string,
  sagError: string,
): Promise<OrderDraft | null> {
  return await patchOrderMeta(orgId, orderId, (order) => {
    const now = new Date().toISOString();
    return buildMetaSnapshot(order, {
      status:    "conflicto",
      syncState: "error_sincronizacion",
      sagError,
      updatedAt: now,
    });
  });
}

// ── Cancel order ──────────────────────────────────────────────────────────────

export async function cancelOrder(
  orgId:   string,
  orderId: string,
): Promise<OrderDraft | null> {
  return await patchOrderMeta(orgId, orderId, (order) => {
    const now = new Date().toISOString();
    return buildMetaSnapshot(order, { status: "cancelado", updatedAt: now });
  });
}

// ── Return to draft ───────────────────────────────────────────────────────────

export async function returnToDraft(
  orgId:   string,
  orderId: string,
): Promise<OrderDraft | null> {
  return await patchOrderMeta(orgId, orderId, (order) => {
    if (!["listo_para_enviar", "conflicto"].includes(order.status)) return null;
    const now = new Date().toISOString();
    return buildMetaSnapshot(order, { status: "borrador", updatedAt: now });
  });
}

// ── Delete draft order ────────────────────────────────────────────────────────

export async function deleteDraftOrder(
  orgId:   string,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const row = await execDb().findFirst({
      where: { id: orderId, tenantId: orgId, module: MODULE, operation: OPERATION },
    });
    if (!row) return { ok: false, error: "Pedido no encontrado." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = ((row as any).metadataJson ?? {}) as Record<string, unknown>;
    const status = meta.status as string;
    const origin = meta.origin as string;
    const sagOrderId = meta.sagOrderId as string | null;

    // Only Agentik-created orders that have never touched SAG
    const originLower = (origin ?? "").toLowerCase().trim();
    if (originLower !== "agentik" && originLower !== "agk") {
      return { ok: false, error: "Solo se pueden eliminar pedidos creados en Agentik." };
    }
    if (sagOrderId) {
      return { ok: false, error: "No se puede eliminar un pedido sincronizado con SAG." };
    }
    if (status === "sincronizado") {
      return { ok: false, error: "No se puede eliminar un pedido sincronizado." };
    }

    // Check no active SagWriteOperation
    try {
      const sagOp = await prisma.sagWriteOperation.findFirst({
        where: {
          organizationId: orgId,
          sourceRef: meta.externalSyncKey as string,
          status: { in: ["PENDING", "APPROVED", "SENDING"] },
        },
      });
      if (sagOp) {
        return { ok: false, error: "No se puede eliminar: tiene una operacion SAG activa." };
      }
    } catch {
      // SagWriteOperation table may not exist — safe to proceed
    }

    await execDb().delete({ where: { id: orderId } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Create with wizard session dedup ──────────────────────────────────────────

export async function createOrderDraftDeduped(
  orgId: string,
  data: {
    header:    OrderHeader;
    lines:     OrderLine[];
    createdBy: string;
    wizardSessionKey?: string;
  },
): Promise<{ order: OrderDraft; alreadyExists: boolean }> {
  // If a wizard session key is provided, check if we already created an order for this session
  if (data.wizardSessionKey) {
    try {
      const existing = await execDb().findFirst({
        where: {
          tenantId: orgId,
          module: MODULE,
          operation: OPERATION,
          // Store session key in intent field suffix for dedup
          intent: { contains: `[${data.wizardSessionKey}]` },
        },
      });
      if (existing) {
        return { order: rowToOrder(existing), alreadyExists: true };
      }
    } catch {
      // Fallback: no dedup
    }
  }

  // Generate consecutive number
  let consecutivo = 1;
  try {
    const count = await execDb().count({
      where: { tenantId: orgId, module: MODULE, operation: OPERATION },
    });
    consecutivo = (count as number) + 1;
  } catch { /* fall back to 1 */ }

  const status:    OrderStatus    = "borrador";
  const origin:    OrderOrigin    = "agentik";
  const syncState: OrderSyncState = "nunca_sincronizado";
  const summary   = computeOrderSummary(data.lines, {
    type:  data.header.discountType,
    value: data.header.discountValue,
  });
  const now       = new Date().toISOString();
  const externalSyncKey = `AGK-${orgId.slice(0, 8)}-PED-${consecutivo}-${Date.now()}`;
  const commercialJourneyId = `CJ-${orgId.slice(0, 8)}-${consecutivo}-${Date.now()}`;
  const timeline = [createdInAgentikEvent(consecutivo, data.createdBy)];

  const metadataJson = {
    organizationId: orgId, consecutivo, header: data.header,
    lines: data.lines, summary, status, origin, syncState,
    createdBy: data.createdBy, createdAt: now, updatedAt: now,
    lastSyncAt: null, sagOrderId: null, sagError: null,
    externalSyncKey, sagInvoiceIds: [], sourceWarehouseCode: null,
    fulfillmentStatus: "sin_factura", fulfillmentPercent: 0,
    timeline, commercialJourneyId, versions: [], linkedDocuments: [],
  };

  const sessionTag = data.wizardSessionKey ? ` [${data.wizardSessionKey}]` : "";
  const row = await execDb().create({
    data: {
      tenantId:     orgId,
      module:       MODULE,
      operation:    OPERATION,
      status:       "pending",
      createdBy:    data.createdBy,
      intent:       `Pedido #${consecutivo} — ${data.header.customerName}${sessionTag}`,
      metadataJson,
    },
  });

  return { order: rowToOrder(row), alreadyExists: false };
}

// ── Duplicate check ───────────────────────────────────────────────────────────

export async function checkDuplicateOrder(
  orgId:  string,
  header: OrderHeader,
): Promise<OrderDuplicateCheck> {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const rows = await execDb().findMany({
      where: {
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
        createdAt: { gte: startOfDay },
      },
      orderBy: { createdAt: "desc" },
      take:    100,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = rows.find((r: any) => {
      const meta        = (r.metadataJson ?? {}) as Record<string, unknown>;
      const rowHeader   = (meta.header as OrderHeader | undefined);
      const rowStatus   = (meta.status as OrderStatus | undefined);
      if (!rowHeader || rowStatus === "cancelado") return false;
      return rowHeader.customerId === header.customerId ||
             rowHeader.customerCode === header.customerCode;
    });

    if (match) {
      const card = rowToCard(match);
      const meta = (match.metadataJson ?? {}) as Record<string, unknown>;
      const rowHeader = (meta.header as OrderHeader | undefined);
      const matchReason = rowHeader?.customerCode === header.customerCode
        ? `Ya existe un pedido para el cliente ${header.customerName} (código ${header.customerCode}) creado hoy.`
        : `Ya existe un pedido para el cliente ${header.customerName} creado hoy.`;
      return { hasDuplicate: true, existingOrder: card, matchReason };
    }
  } catch {
    // DB not available — no duplicate found
  }

  return { hasDuplicate: false, existingOrder: null, matchReason: null };
}

// ── Order stats ───────────────────────────────────────────────────────────────

export async function getOrderStats(
  orgId: string,
): Promise<{
  today: number;
  pendingSag: number;
  synced: number;
  conflicts: number;
  /** Origin breakdown */
  fromAgentik: number;
  fromSag: number;
  fromImport: number;
  fromMigration: number;
}> {
  let agentikCount   = 0;
  let pendingSag     = 0;
  let synced         = 0;
  let conflicts      = 0;
  let fromAgentik    = 0;
  let fromSag        = 0;
  let fromImport     = 0;
  let fromMigration  = 0;

  // ── AgentExecution rows (Agentik-created orders) — may not be available ──
  try {
    const rows = await execDb().findMany({
      where: {
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
      take: 500,
    });

    agentikCount = (rows as unknown[]).length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of rows as any[]) {
      const meta   = (r.metadataJson ?? {}) as Record<string, unknown>;
      const status = (meta.status as OrderStatus | undefined);
      const origin = (meta.origin as string | undefined) ?? "agentik";

      if (status === "pendiente_sag")  pendingSag++;
      if (status === "sincronizado")   synced++;
      if (status === "conflicto")      conflicts++;

      if (origin === "agentik")   fromAgentik++;
      if (origin === "sag")       fromSag++;
      if (origin === "importado") fromImport++;
      if (origin === "migrado")   fromMigration++;
    }
  } catch {
    // AgentExecution not available — continue with SAG only
  }

  // ── CRMQuote rows (real SAG orders) — always attempted ─────────────────
  let sagTotal = 0;
  try {
    const crmQuotes = await prisma.cRMQuote.findMany({
      where:   { organizationId: orgId },
      orderBy: { issuedAt: "desc" },
      take:    500,
      select:  { id: true, amount: true, rawCrmJson: true, sellerName: true, issuedAt: true },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const q of crmQuotes as any[]) {
      sagTotal++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw    = ((q.rawCrmJson as any)?.raw ?? {}) as Record<string, unknown>;
      const stage  = raw.stage as string | undefined;
      const status = crmStageToOrderStatus(stage);

      if (status === "pendiente_sag")  pendingSag++;
      if (status === "sincronizado")   synced++;
      // CRM quotes don't have "conflicto" status

      fromSag++;
    }
  } catch {
    // CRMQuote not available — degrade silently
  }

  // ── CustomerOrderRecord rows (real SAG orders) — primary source ──────
  let corTotal = 0;
  try {
    const corRecords = await prisma.customerOrderRecord.findMany({
      where:   { organizationId: orgId },
      orderBy: { orderDate: "desc" },
      take:    500,
      select:  { id: true, status: true },
    });

    for (const r of corRecords) {
      corTotal++;
      const orderStatus = customerOrderStatusToOrderStatus(r.status);
      if (orderStatus === "pendiente_sag")  pendingSag++;
      if (orderStatus === "sincronizado")   synced++;
      fromSag++;
    }
  } catch {
    // CustomerOrderRecord not available — degrade silently
  }

  return {
    today: agentikCount + sagTotal + corTotal,
    pendingSag, synced, conflicts,
    fromAgentik, fromSag, fromImport, fromMigration,
  };
}

// ── Customer search (for wizard client picker) ─────────────────────────────

export interface CustomerProfile {
  customerCode: string;
  customerName: string;
  customerId:   string;
  lastSellerName:  string;
  lastChannel:     string;
  totalOrders:     number;
  totalValue:      number;
  lastOrderDate:   string | null;
  city:            string;
  sagCode:         string;
  /** SAG readiness for order creation */
  sagReadiness?: "READY" | "DRAFT_ONLY" | "BLOCKED";
  /** Whether the customer has multiple branches (sucursales) */
  hasBranches?: boolean;
  /** Number of branches sharing same NIT */
  branchCount?: number;
  /** Seller resolution confidence */
  sellerConfidence?: string;
}

export async function searchCustomers(
  orgId: string,
  query: string,
): Promise<CustomerProfile[]> {
  const map = new Map<string, CustomerProfile>();

  // ── Source 1: Canonical customer service (SAG + CRM merged) ──────────
  try {
    const canonical = await canonicalSearchCustomers(orgId, query);
    for (const c of canonical) {
      const code = c.sagCode ?? c.nit ?? c.id;
      if (map.has(code)) continue;
      map.set(code, {
        customerCode:     code,
        customerName:     c.name,
        customerId:       c.nit ?? "",
        lastSellerName:   c.seller?.name ?? "",
        lastChannel:      "",
        totalOrders:      0,
        totalValue:       0,
        lastOrderDate:    c.lastPurchaseAt ?? null,
        city:             c.city ?? "",
        sagCode:          c.sagCode ?? "",
        sagReadiness:     c.sagReadiness,
        hasBranches:      c.hasBranches,
        branchCount:      c.branchCount,
        sellerConfidence: c.seller?.confidence,
      });
    }
  } catch {
    // Canonical service unavailable — degrade silently
  }

  // ── Source 2: Order history (existing orders in AgentExecution) ────────
  try {
    const rows = await execDb().findMany({
      where: {
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
      orderBy: { createdAt: "desc" },
      take:    500,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of rows as any[]) {
      const meta   = (r.metadataJson ?? {}) as Record<string, unknown>;
      const header = meta.header as OrderHeader | undefined;
      if (!header?.customerCode) continue;

      const code = header.customerCode;
      const summary = (meta.summary ?? {}) as Partial<OrderSummary>;
      const dateStr = r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt);

      if (map.has(code)) {
        const existing = map.get(code)!;
        existing.totalOrders += 1;
        existing.totalValue  += summary.totalValue ?? 0;
        if (!existing.lastOrderDate || dateStr > existing.lastOrderDate) {
          existing.lastOrderDate  = dateStr;
          existing.lastSellerName = header.sellerName ?? existing.lastSellerName;
          existing.lastChannel    = header.channel ?? "";
        }
        if (!existing.customerName && header.customerName) {
          existing.customerName = header.customerName;
        }
      } else {
        map.set(code, {
          customerCode:   code,
          customerName:   header.customerName ?? "",
          customerId:     header.customerId ?? "",
          lastSellerName: header.sellerName ?? "",
          lastChannel:    header.channel ?? "",
          totalOrders:    1,
          totalValue:     summary.totalValue ?? 0,
          lastOrderDate:  dateStr,
          city:           "",
          sagCode:        "",
        });
      }
    }
  } catch {
    // AgentExecution not available — continue with canonical only
  }

  // Filter by query (order-history entries need client-side filter)
  const q = query.toLowerCase().trim();
  if (!q) return [...map.values()].slice(0, 20);

  return [...map.values()]
    .filter(c =>
      c.customerCode.toLowerCase().includes(q) ||
      c.customerName.toLowerCase().includes(q) ||
      c.customerId.toLowerCase().includes(q)
    )
    .slice(0, 20);
}

// ── Internal: full metadataJson snapshot builder ──────────────────────────────

function buildMetaSnapshot(
  order: OrderDraft,
  overrides: Partial<{
    status:            OrderStatus;
    syncState:         OrderSyncState;
    sagOrderId:        string | null;
    sagError:          string | null;
    lastSyncAt:        string | null;
    updatedAt:         string;
    sagInvoiceIds:     string[];
    fulfillmentStatus: OrderDraft["fulfillmentStatus"];
    fulfillmentPercent: number;
  }>,
): Record<string, unknown> {
  return {
    organizationId:      order.organizationId,
    consecutivo:         order.consecutivo,
    header:              order.header,
    lines:               order.lines,
    summary:             order.summary,
    status:              overrides.status     ?? order.status,
    origin:              order.origin,
    syncState:           overrides.syncState  ?? order.syncState,
    createdBy:           order.createdBy,
    createdAt:           order.createdAt,
    updatedAt:           overrides.updatedAt  ?? new Date().toISOString(),
    lastSyncAt:          "lastSyncAt" in overrides ? overrides.lastSyncAt ?? null : order.lastSyncAt,
    sagOrderId:          "sagOrderId" in overrides ? overrides.sagOrderId ?? null : order.sagOrderId,
    sagError:            "sagError"   in overrides ? overrides.sagError   ?? null : order.sagError,
    externalSyncKey:     order.externalSyncKey,
    sagInvoiceIds:       overrides.sagInvoiceIds       ?? order.sagInvoiceIds,
    sourceWarehouseCode: order.sourceWarehouseCode,
    fulfillmentStatus:   overrides.fulfillmentStatus   ?? order.fulfillmentStatus,
    fulfillmentPercent:  overrides.fulfillmentPercent   ?? order.fulfillmentPercent,
    timeline:            order.timeline ?? [],
    commercialJourneyId: order.commercialJourneyId,
    versions:            order.versions ?? [],
    linkedDocuments:     order.linkedDocuments ?? [],
  };
}
