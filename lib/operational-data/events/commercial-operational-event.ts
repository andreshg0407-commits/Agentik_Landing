/**
 * lib/operational-data/events/commercial-operational-event.ts
 *
 * CommercialOperationalEvent timeline — unified operational event feed.
 *
 * ─── WHAT THIS REPLACES / EXTENDS ───────────────────────────────────────────
 * lib/comercial/maletas/maletas-events.ts handles SAG-specific events
 * (ruptura_inminente, vendedor_en_presion, etc.) from the coverage snapshot.
 *
 * This module defines the MULTI-SOURCE operational event layer that unifies:
 *   - SAG coverage/production events (bridged from maletas-events.ts)
 *   - CRM events (customer, opportunity, activity)
 *   - Agentik reservation events
 *   - Demand signal events (from commercial-demand-signals.ts)
 *   - Order lifecycle events
 *
 * The result is a SINGLE timeline that Copilot, agents, and the executive view
 * consume — regardless of which source fired the event.
 *
 * ─── MIGRATION PATH ─────────────────────────────────────────────────────────
 * Phase 1 (this sprint): Define the unified type + bridge from maletas-events.
 * Phase 2: Copilot reads from OperationalCommercialEvent[] not CommercialEventRecord[].
 * Phase 3: All event generators produce OperationalCommercialEvent.
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

import type {
  OperationalCommercialEvent,
  OperationalCommercialEventType,
} from "../operational-entities";
import type { CommercialEventRecord } from "@/lib/comercial/maletas/maletas-events";

// ─── Bridge: legacy SAG events → OperationalCommercialEvent ──────────────────

const LEGACY_TO_OPERATIONAL: Record<string, OperationalCommercialEventType> = {
  ruptura_inminente:       "coverage.critical",
  cobertura_recuperada:    "coverage.recovered",
  vendedor_en_presion:     "coverage.drop",
  linea_caliente:          "demand.surge_detected",
  stock_muerto:            "dead_stock.detected",
  produccion_urgente:      "production.urgente",
  degradacion_recurrente:  "coverage.critical",
  recuperacion_operacional: "coverage.recovered",
};

/**
 * Converts a legacy CommercialEventRecord (SAG/maletas) to OperationalCommercialEvent.
 * Called when loading events for Copilot / executive timeline.
 */
export function bridgeLegacyEventToOperational(
  record:         CommercialEventRecord,
  organizationId: string,
): OperationalCommercialEvent {
  const eventType = LEGACY_TO_OPERATIONAL[record.type] ?? "coverage.drop";
  const urgency =
    record.severity === "critical" ? "critica" :
    record.severity === "warning"  ? "alta"    : "info";

  return {
    id:             record.id,
    organizationId,
    eventType,
    urgency,
    entityType:     record.refCode ? "reference" : record.salesRepId ? "sales_rep" : undefined,
    entityId:       record.refCode ?? record.salesRepId,
    title:          record.title,
    body:           record.body,
    source:         "sag",
    payload:        {
      legacyType:        record.type,
      legacySeverity:    record.severity,
      evidence:          record.evidence,
      operationalImpact: record.operationalImpact,
    },
    timestamp:      record.createdAt,
  };
}

export function bridgeLegacyEventsToOperational(
  records:        CommercialEventRecord[],
  organizationId: string,
): OperationalCommercialEvent[] {
  return records.map(r => bridgeLegacyEventToOperational(r, organizationId));
}

// ─── Builder helpers ──────────────────────────────────────────────────────────

/**
 * Build an OperationalCommercialEvent for a demand signal fire.
 */
export function buildDemandSignalEvent(opts: {
  organizationId: string;
  reference:      string;
  description:    string;
  urgency:        "critica" | "alta" | "media" | "info";
  qtyNeeded:      number;
  signalType:     string;
  source:         "sag" | "crm" | "agentik";
}): OperationalCommercialEvent {
  return {
    id:             `ds_${opts.reference}_${Date.now()}`,
    organizationId: opts.organizationId,
    eventType:      "demand.signal_fired",
    urgency:        opts.urgency,
    entityType:     "reference",
    entityId:       opts.reference,
    title:          `Señal de demanda: ${opts.reference}`,
    body:           `${opts.description} requiere ${opts.qtyNeeded} unidades. Tipo: ${opts.signalType}.`,
    source:         opts.source,
    payload: {
      reference:   opts.reference,
      qtyNeeded:   opts.qtyNeeded,
      signalType:  opts.signalType,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build an OperationalCommercialEvent for an order lifecycle transition.
 */
export function buildOrderLifecycleEvent(opts: {
  organizationId: string;
  orderId:        string;
  reference:      string;
  eventType:      "order.created" | "order.confirmed" | "order.sent_to_erp" | "order.fulfilled" | "order.cancelled";
  salesRepId?:    string;
  source:         "crm" | "agentik" | "sag";
}): OperationalCommercialEvent {
  const URGENCY_MAP: Record<typeof opts.eventType, OperationalCommercialEvent["urgency"]> = {
    "order.created":    "info",
    "order.confirmed":  "info",
    "order.sent_to_erp": "info",
    "order.fulfilled":  "info",
    "order.cancelled":  "media",
  };

  return {
    id:             `ord_${opts.orderId}_${opts.eventType}`,
    organizationId: opts.organizationId,
    eventType:      opts.eventType,
    urgency:        URGENCY_MAP[opts.eventType],
    entityType:     "order",
    entityId:       opts.orderId,
    title:          `Pedido ${opts.eventType.replace("order.", "")}: ${opts.reference}`,
    body:           `Pedido ${opts.reference} → ${opts.eventType.replace("order.", "")}.`,
    source:         opts.source,
    payload: {
      orderId:    opts.orderId,
      salesRepId: opts.salesRepId,
    },
    timestamp: new Date().toISOString(),
  };
}

// ─── Timeline merger ──────────────────────────────────────────────────────────

/**
 * Merges events from multiple sources into a unified, time-sorted timeline.
 * Deduplicates by id. Sorts: critica first, then by timestamp descending.
 */
export function buildOperationalTimeline(
  eventSets: OperationalCommercialEvent[][],
): OperationalCommercialEvent[] {
  const seen = new Set<string>();
  const merged: OperationalCommercialEvent[] = [];

  for (const set of eventSets) {
    for (const event of set) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      merged.push(event);
    }
  }

  const URGENCY_SORT: Record<OperationalCommercialEvent["urgency"], number> = {
    critica: 0, alta: 1, media: 2, info: 3,
  };

  return merged.sort((a, b) => {
    const urgDiff = URGENCY_SORT[a.urgency] - URGENCY_SORT[b.urgency];
    if (urgDiff !== 0) return urgDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}
