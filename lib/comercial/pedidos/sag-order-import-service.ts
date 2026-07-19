/**
 * lib/comercial/pedidos/sag-order-import-service.ts
 *
 * SAG → Agentik order import service.
 * Detects new orders in SAG, deduplicates, and imports them.
 *
 * V1: Import logic ready. Actual SAG queries require integration connection.
 *     When SAG is not connected, returns explicit "not_connected" state.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-HIBRIDO-SAG-AGENTIK
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { OrderDraft, OrderLine, OrderHeader } from "./order-types";
import type { SagOrderImportResult } from "./order-core-types";
import { findDedupMatch, type SagOrderCandidate } from "./order-dedup-engine";
import { computeOrderSummary } from "./order-validation";
import {
  importedFromSagEvent,
  dedupMatchedEvent,
  dedupMergedEvent,
  appendTimelineEvent,
} from "./order-timeline";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_ORDER_DRAFT";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── Import a single SAG order ────────────────────────────────────────────────

export async function importSagOrder(
  orgId:     string,
  candidate: SagOrderCandidate,
): Promise<SagOrderImportResult> {
  const now = new Date().toISOString();

  // 1. Load existing orders for dedup
  const existingOrders = await loadExistingOrders(orgId);

  // 2. Run dedup engine
  const dedupResult = findDedupMatch(candidate, existingOrders);

  // 3a. If matched → merge/update
  if (dedupResult.matched && dedupResult.existingOrderId) {
    const merged = await mergeWithExisting(
      orgId,
      dedupResult.existingOrderId,
      candidate,
      dedupResult,
    );

    return {
      sagOrderId:  candidate.sagOrderId,
      action:      merged ? "merged" : "skipped",
      orderId:     dedupResult.existingOrderId,
      dedupResult,
      importedAt:  now,
      message:     merged
        ? `Pedido SAG ${candidate.sagOrderId} fusionado con pedido existente.`
        : `Pedido SAG ${candidate.sagOrderId} ya vinculado — sin cambios.`,
    };
  }

  // 3b. Not matched → create new order with origin = "sag"
  const newOrder = await createImportedOrder(orgId, candidate);

  return {
    sagOrderId:  candidate.sagOrderId,
    action:      "created",
    orderId:     newOrder?.id ?? null,
    dedupResult,
    importedAt:  now,
    message:     newOrder
      ? `Pedido SAG ${candidate.sagOrderId} importado como pedido #${newOrder.consecutivo}.`
      : `Error al importar pedido SAG ${candidate.sagOrderId}.`,
  };
}

// ── Batch import ────────────────────────────────────────────────────────────

export async function importSagOrderBatch(
  orgId:      string,
  candidates: SagOrderCandidate[],
): Promise<SagOrderImportResult[]> {
  const results: SagOrderImportResult[] = [];

  for (const candidate of candidates) {
    const result = await importSagOrder(orgId, candidate);
    results.push(result);
  }

  return results;
}

// ── Fetch pending SAG orders ────────────────────────────────────────────────
// V1: Returns empty — no SAG connection.
// V2: Will query SAG API for orders not yet in Agentik.

export async function fetchPendingSagOrders(
  _orgId: string,
): Promise<SagOrderCandidate[]> {
  // V1: SAG not connected
  return [];
}

// ── Normalize raw SAG order data ────────────────────────────────────────────

export function normalizeSagOrderCandidate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
): SagOrderCandidate | null {
  if (!raw) return null;

  return {
    sagOrderId:       String(raw.sagOrderId ?? raw.id ?? ""),
    externalSyncKey:  raw.externalSyncKey ?? null,
    crossReferenceId: raw.crossReferenceId ?? raw.externalRef ?? null,
    customerCode:     String(raw.customerCode ?? raw.clientCode ?? ""),
    customerName:     String(raw.customerName ?? raw.clientName ?? ""),
    sellerCode:       String(raw.sellerCode ?? raw.vendorCode ?? ""),
    sellerName:       String(raw.sellerName ?? raw.vendorName ?? ""),
    orderDate:        String(raw.orderDate ?? raw.date ?? ""),
    totalValue:       Number(raw.totalValue ?? raw.total ?? 0),
    lines:            (raw.lines ?? raw.items ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (l: any) => ({
        referenceCode: String(l.referenceCode ?? l.reference ?? l.ref ?? ""),
        productName:   String(l.productName ?? l.description ?? ""),
        size:          String(l.size ?? l.talla ?? ""),
        color:         String(l.color ?? ""),
        quantity:      Number(l.quantity ?? l.qty ?? 0),
        unitPrice:     Number(l.unitPrice ?? l.price ?? 0),
        lineTotal:     Number(l.lineTotal ?? l.total ?? 0),
      }),
    ),
  };
}

// ── Internal: load existing orders for dedup ────────────────────────────────

async function loadExistingOrders(orgId: string): Promise<OrderDraft[]> {
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
    return (rows as any[]).map((r: any) => rowToOrderMinimal(r));
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToOrderMinimal(row: any): OrderDraft {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  const lines = (meta.lines ?? []) as OrderLine[];

  return {
    id:                  row.id,
    organizationId:      (meta.organizationId as string) ?? row.tenantId ?? "",
    consecutivo:         (meta.consecutivo as number) ?? 0,
    header:              (meta.header as OrderHeader) ?? { customerId: "", customerName: "", customerCode: "", sellerId: "", sellerName: "", channel: "", notes: "" },
    lines,
    status:              (meta.status as OrderDraft["status"]) ?? "borrador",
    origin:              (meta.origin as OrderDraft["origin"]) ?? "agentik",
    syncState:           (meta.syncState as OrderDraft["syncState"]) ?? "nunca_sincronizado",
    summary:             (meta.summary as OrderDraft["summary"]) ?? computeOrderSummary(lines),
    createdBy:           (meta.createdBy as string) ?? "system",
    createdAt:           row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt:           row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? row.createdAt),
    lastSyncAt:          (meta.lastSyncAt as string | null) ?? null,
    sagOrderId:          (meta.sagOrderId as string | null) ?? null,
    sagError:            (meta.sagError as string | null) ?? null,
    externalSyncKey:     (meta.externalSyncKey as string) ?? "",
    sagInvoiceIds:       (meta.sagInvoiceIds as string[]) ?? [],
    sourceWarehouseCode: (meta.sourceWarehouseCode as string | null) ?? null,
    fulfillmentStatus:   (meta.fulfillmentStatus as OrderDraft["fulfillmentStatus"]) ?? "sin_factura",
    fulfillmentPercent:  (meta.fulfillmentPercent as number) ?? 0,
    timeline:            (meta.timeline as OrderDraft["timeline"]) ?? [],
    commercialJourneyId: (meta.commercialJourneyId as string) ?? row.id ?? "",
    versions:            (meta.versions as OrderDraft["versions"]) ?? [],
    linkedDocuments:     (meta.linkedDocuments as OrderDraft["linkedDocuments"]) ?? [],
  };
}

// ── Internal: create imported order ─────────────────────────────────────────

async function createImportedOrder(
  orgId:     string,
  candidate: SagOrderCandidate,
): Promise<OrderDraft | null> {
  try {
    let consecutivo = 1;
    try {
      const count = await execDb().count({
        where: { tenantId: orgId, module: MODULE, operation: OPERATION },
      });
      consecutivo = (count as number) + 1;
    } catch { /* fallback to 1 */ }

    const lines: OrderLine[] = candidate.lines.map((l, i) => ({
      id:             `imp-${candidate.sagOrderId}-${i}`,
      referenceCode:  l.referenceCode,
      productName:    l.productName,
      size:           l.size,
      color:          l.color,
      quantity:       l.quantity,
      availableUnits: null,
      unitPrice:      l.unitPrice,
      lineTotal:      l.lineTotal,
      removed:        false,
      comment:        "",
    }));

    const summary = computeOrderSummary(lines);
    const now     = new Date().toISOString();

    const timeline = [
      importedFromSagEvent(candidate.sagOrderId, candidate.customerCode),
    ];

    const metadataJson = {
      organizationId:      orgId,
      consecutivo,
      header: {
        customerId:   candidate.customerCode,
        customerName: candidate.customerName,
        customerCode: candidate.customerCode,
        sellerId:     candidate.sellerCode,
        sellerName:   candidate.sellerName,
        channel:      "",
        notes:        "",
      },
      lines,
      summary,
      status:              "sincronizado",
      origin:              "sag",
      syncState:           "sincronizado",
      createdBy:           "sag_sync",
      createdAt:           now,
      updatedAt:           now,
      lastSyncAt:          now,
      sagOrderId:          candidate.sagOrderId,
      sagError:            null,
      externalSyncKey:     candidate.externalSyncKey ?? `SAG-${candidate.sagOrderId}`,
      sagInvoiceIds:       [],
      sourceWarehouseCode: null,
      fulfillmentStatus:   "sin_factura",
      fulfillmentPercent:  0,
      timeline,
      commercialJourneyId: `CJ-${orgId.slice(0, 8)}-${consecutivo}-${Date.now()}`,
      versions:            [],
      linkedDocuments:     [],
    };

    const row = await execDb().create({
      data: {
        tenantId:     orgId,
        module:       MODULE,
        operation:    OPERATION,
        status:       "completed",
        createdBy:    "sag_sync",
        intent:       `Pedido #${consecutivo} — importado desde SAG (${candidate.sagOrderId})`,
        metadataJson,
      },
    });

    return rowToOrderMinimal(row);
  } catch {
    return null;
  }
}

// ── Internal: merge SAG data into existing order ────────────────────────────

async function mergeWithExisting(
  orgId:           string,
  existingOrderId: string,
  candidate:       SagOrderCandidate,
  dedupResult:     { method: string | null; confidence: string | null; score: number },
): Promise<boolean> {
  try {
    const row = await execDb().findFirst({
      where: { id: existingOrderId, tenantId: orgId, module: MODULE, operation: OPERATION },
    });

    if (!row) return false;

    const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
    const existingTimeline = (meta.timeline as OrderDraft["timeline"]) ?? [];
    const now = new Date().toISOString();

    // Append dedup + merge events
    let timeline = appendTimelineEvent(
      existingTimeline,
      dedupMatchedEvent(
        existingOrderId,
        dedupResult.method ?? "unknown",
        dedupResult.confidence ?? "unknown",
        dedupResult.score,
      ),
    );
    timeline = appendTimelineEvent(timeline, dedupMergedEvent(existingOrderId));

    // Enrich: set sagOrderId if not already set
    const updatedMeta: Record<string, unknown> = {
      ...meta,
      updatedAt: now,
      lastSyncAt: now,
      timeline,
    };

    if (!meta.sagOrderId && candidate.sagOrderId) {
      updatedMeta.sagOrderId = candidate.sagOrderId;
      updatedMeta.syncState  = "sincronizado";
    }

    await execDb().update({
      where: { id: existingOrderId },
      data:  { metadataJson: updatedMeta },
    });

    return true;
  } catch {
    return false;
  }
}
