/**
 * lib/comercial/pedidos/order-timeline.ts
 *
 * Timeline event builder for the hybrid order model.
 * Pure domain logic — no Prisma, no server-only.
 *
 * Every order carries a `timeline: OrderTimelineEvent[]` array.
 * Events are appended, never removed.
 *
 * Sprint: COMERCIAL-PEDIDOS-HIBRIDO-SAG-AGENTIK
 * Sprint: COMERCIAL-PEDIDOS-ENTERPRISE-05
 */

import type { OrderTimelineEvent, OrderTimelineEventType } from "./order-core-types";

// ── Build a timeline event ──────────────────────────────────────────────────

export function buildTimelineEvent(
  eventType: OrderTimelineEventType,
  message:   string,
  actor?:    string,
  data?:     Record<string, unknown>,
): OrderTimelineEvent {
  return {
    eventType,
    timestamp: new Date().toISOString(),
    actor:     actor ?? "system",
    message,
    data:      data ?? {},
  };
}

// ── Pre-built event factories ───────────────────────────────────────────────

export function createdInAgentikEvent(
  consecutivo: number,
  createdBy:   string,
): OrderTimelineEvent {
  return buildTimelineEvent(
    "created_in_agentik",
    `Pedido #${consecutivo} creado en Agentik.`,
    createdBy,
    { consecutivo },
  );
}

export function importedFromSagEvent(
  sagOrderId:   string,
  customerCode: string,
): OrderTimelineEvent {
  return buildTimelineEvent(
    "imported_from_sag",
    `Pedido importado desde SAG (ID: ${sagOrderId}).`,
    "sag_sync",
    { sagOrderId, customerCode },
  );
}

export function migratedEvent(
  source: string,
): OrderTimelineEvent {
  return buildTimelineEvent(
    "migrated",
    `Pedido migrado desde ${source}.`,
    "system",
    { source },
  );
}

export function editedEvent(
  actor:   string,
  details: string,
): OrderTimelineEvent {
  return buildTimelineEvent("edited", details, actor);
}

export function submittedEvent(actor: string): OrderTimelineEvent {
  return buildTimelineEvent(
    "submitted",
    "Pedido marcado como listo para enviar.",
    actor,
  );
}

export function sentToSagEvent(): OrderTimelineEvent {
  return buildTimelineEvent(
    "sent_to_sag",
    "Pedido enviado a SAG para procesamiento.",
    "system",
  );
}

export function sagResponseEvent(
  success:    boolean,
  sagOrderId: string | null,
  message:    string,
): OrderTimelineEvent {
  return buildTimelineEvent(
    "sag_response_received",
    message,
    "sag_sync",
    { success, sagOrderId },
  );
}

export function syncedWithSagEvent(sagOrderId: string): OrderTimelineEvent {
  return buildTimelineEvent(
    "synced_with_sag",
    `Sincronizado con SAG (ID: ${sagOrderId}).`,
    "sag_sync",
    { sagOrderId },
  );
}

export function syncConflictEvent(error: string): OrderTimelineEvent {
  return buildTimelineEvent(
    "sync_conflict",
    `Conflicto de sincronizacion: ${error}`,
    "sag_sync",
    { error },
  );
}

export function invoiceLinkedEvent(
  invoiceId:     string,
  invoiceNumber: string,
): OrderTimelineEvent {
  return buildTimelineEvent(
    "invoice_linked",
    `Factura ${invoiceNumber} vinculada al pedido.`,
    "sag_sync",
    { invoiceId, invoiceNumber },
  );
}

export function fulfillmentUpdatedEvent(
  status:  string,
  percent: number,
): OrderTimelineEvent {
  return buildTimelineEvent(
    "fulfillment_updated",
    `Cumplimiento actualizado: ${status} (${percent}%).`,
    "system",
    { status, percent },
  );
}

export function pdfGeneratedEvent(actor: string): OrderTimelineEvent {
  return buildTimelineEvent(
    "pdf_generated",
    "Documento PDF generado.",
    actor,
  );
}

export function sharedWhatsappEvent(actor: string): OrderTimelineEvent {
  return buildTimelineEvent(
    "shared_whatsapp",
    "Pedido compartido por WhatsApp.",
    actor,
  );
}

export function cancelledEvent(actor: string): OrderTimelineEvent {
  return buildTimelineEvent(
    "cancelled",
    "Pedido cancelado.",
    actor,
  );
}

export function dedupMatchedEvent(
  existingOrderId: string,
  method:          string,
  confidence:      string,
  score:           number,
): OrderTimelineEvent {
  return buildTimelineEvent(
    "dedup_matched",
    `Emparejado con pedido existente (${method}, confianza: ${confidence}, score: ${score}).`,
    "sag_sync",
    { existingOrderId, method, confidence, score },
  );
}

export function dedupMergedEvent(
  existingOrderId: string,
): OrderTimelineEvent {
  return buildTimelineEvent(
    "dedup_merged",
    `Datos fusionados con pedido existente ${existingOrderId}.`,
    "sag_sync",
    { existingOrderId },
  );
}

export function versionCreatedEvent(
  versionNumber: number,
  reason:        string,
  actor:         string,
): OrderTimelineEvent {
  return buildTimelineEvent(
    "version_created",
    `Version ${versionNumber} creada: ${reason}`,
    actor,
    { versionNumber, reason },
  );
}

export function documentLinkedEvent(
  documentType:   string,
  documentNumber: string,
): OrderTimelineEvent {
  return buildTimelineEvent(
    "document_linked",
    `Documento ${documentType} ${documentNumber} vinculado.`,
    "sag_sync",
    { documentType, documentNumber },
  );
}

// ── Append event to timeline ────────────────────────────────────────────────

export function appendTimelineEvent(
  timeline: OrderTimelineEvent[],
  event:    OrderTimelineEvent,
): OrderTimelineEvent[] {
  return [...timeline, event];
}
