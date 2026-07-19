/**
 * lib/operational-data/operational-entities.ts
 *
 * Abstract operational entities — the Agentik model of commercial operations.
 *
 * ─── NAMING PHILOSOPHY ───────────────────────────────────────────────────────
 * These entities represent WHAT THE OPERATION IS, not what the source calls it.
 *
 *   OperationalCustomer   ← NOT "CrmContacto", NOT "SagCliente"
 *   OperationalOrder      ← NOT "CrmPedido", NOT "SagPD"
 *   OperationalSalesRep   ← NOT "CrmVendedor", NOT "SagRepresentante"
 *
 * All intelligence engines, agents, and UI consume these entities.
 * Source-specific names never leave their mapper files.
 *
 * ─── RE-EXPORTS ──────────────────────────────────────────────────────────────
 * OperationalInventoryItem is defined in lib/operational-inventory/ (it was
 * the first entity to be formalized). We re-export it here for consistency.
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

import type { OperationalEntityBase, OperationalSource } from "./operational-source";

// Re-export OperationalInventoryItem — it belongs to this layer conceptually
export type {
  OperationalInventoryItem,
  OperationalInventorySource,
  OperationalAvailability,
  OperationalPressure,
  OperationalInventorySnapshot,
} from "@/lib/operational-inventory/operational-inventory-types";

// ─── OperationalCustomer ─────────────────────────────────────────────────────

/**
 * A customer in Agentik's operational model.
 *
 * May come from: CRM, SAG cartera, Shopify, WhatsApp contact, manual entry.
 * Agentik merges duplicates from multiple sources using sourceId matching.
 */
export interface OperationalCustomer extends OperationalEntityBase {
  /** Agentik-normalized display name */
  name:              string;
  email?:            string;
  phone?:            string;
  /** City/municipality */
  city?:             string;
  country?:          string;
  /** Assigned primary sales rep */
  salesRepId?:       string;
  /** 0–100: commercial engagement score */
  engagementScore:   number;
  /** Total value of confirmed orders (Agentik-tracked, not fiscal) */
  totalOrderValue:   number;
  totalOrders:       number;
  lastOrderAt?:      string;
  /** Customer segment */
  segment?:          "a" | "b" | "c" | "nuevo" | "inactivo";
}

// ─── OperationalOrder ────────────────────────────────────────────────────────

/**
 * An order in Agentik's operational model.
 *
 * May originate from: CRM, WhatsApp capture, Shopify, Agentik's own order builder.
 * NOT a fiscal document — SAG owns F1/F2. This is the operational order.
 */
export interface OperationalOrder extends OperationalEntityBase {
  /** Human-readable order reference */
  reference:         string;
  customerId?:       string;
  salesRepId?:       string;
  /**
   * Operational lifecycle state.
   * Maps to OperationalOrderStatus in the orders module.
   */
  status:
    | "draft"
    | "reserved"
    | "confirmed"
    | "sent_to_erp"
    | "processing"
    | "fulfilled"
    | "cancelled"
    | "returned";
  lines:             OperationalOrderLine[];
  totalValue?:       number;
  currency:          string;
  createdAt:         string;
  confirmedAt?:      string;
  shippedAt?:        string;
  cancelledAt?:      string;
  /** SAG PD reference — populated when order reaches ERP */
  erpDocumentRef?:   string;
}

export interface OperationalOrderLine {
  reference:     string;
  description:   string;
  qtyOrdered:    number;
  qtyDelivered:  number;
  qtyCancelled:  number;
  unitPrice?:    number;
  line?:         string;   // product line
  /**
   * Source-specific metadata — never used in engine logic.
   * CRM lines carry: crmLineId, productCrmId, talla, color, bodega, warehouseId, vat, estadoPedido
   */
  metadata?:     Record<string, unknown>;
}

// ─── OperationalSalesRep ─────────────────────────────────────────────────────

/**
 * A sales representative in Agentik's operational model.
 * May come from: CRM, SAG, manual entry.
 */
export interface OperationalSalesRep extends OperationalEntityBase {
  name:              string;
  email?:            string;
  phone?:            string;
  /** Geographic or commercial territory */
  territory?:        string;
  /** Number of active Sales Portfolios this rep holds */
  activePortfolios:  number;
  /** ISO timestamp of last recorded commercial activity */
  lastActivityAt?:   string;
  /** 0–100: operational engagement/activity score */
  activityScore:     number;
  /** True if rep has been inactive for >configurable threshold */
  isInactive:        boolean;
}

// ─── OperationalOpportunity ──────────────────────────────────────────────────

/**
 * A commercial opportunity in Agentik's operational model.
 * Primarily sourced from CRM. Used by demand signal engine.
 */
export interface OperationalOpportunity extends OperationalEntityBase {
  title:             string;
  customerId?:       string;
  salesRepId?:       string;
  /**
   * Pipeline stage.
   * CRM stages are normalized to these operational stages.
   */
  stage:
    | "prospecto"
    | "calificado"
    | "propuesta"
    | "negociacion"
    | "ganado"
    | "perdido";
  /** Estimated value in local currency */
  expectedValue:     number;
  /** 0–100: probability of closing */
  probability:       number;
  expectedCloseAt?:  string;
  /** Product references involved — used for demand signal computation */
  referenceLines?:   Array<{ reference: string; qty: number }>;
}

// ─── OperationalSalesActivity ────────────────────────────────────────────────

/**
 * A recorded commercial activity (visit, call, WhatsApp, demo).
 * Used for sales rep activity scoring and customer engagement tracking.
 */
export interface OperationalSalesActivity extends OperationalEntityBase {
  salesRepId:        string;
  customerId?:       string;
  opportunityId?:    string;
  type:
    | "llamada"
    | "visita"
    | "whatsapp"
    | "email"
    | "demo"
    | "propuesta"
    | "otro";
  subject?:          string;
  description?:      string;
  outcome?:          "exitoso" | "pendiente" | "sin_respuesta" | "perdido";
  activityAt:        string;
}

// ─── OperationalTask ─────────────────────────────────────────────────────────

/**
 * An operational task assigned to a sales rep or coordinator.
 * May come from: CRM, Agentik's own task engine, manual entry.
 */
export interface OperationalTask extends OperationalEntityBase {
  salesRepId?:       string;
  customerId?:       string;
  opportunityId?:    string;
  type:
    | "seguimiento"
    | "llamada"
    | "envio"
    | "cobranza"
    | "visita"
    | "propuesta"
    | "otro";
  title:             string;
  description?:      string;
  status:            "pendiente" | "en_progreso" | "completada" | "vencida" | "cancelada";
  dueAt?:            string;
  completedAt?:      string;
  /** True if task is overdue and has not been completed */
  isOverdue:         boolean;
}

// ─── OperationalDemandSignal ─────────────────────────────────────────────────

/**
 * A computed demand signal for a product reference.
 *
 * Synthesizes: SAG inventory pressure + CRM orders + opportunities + velocity.
 * This is Agentik's intelligence output — not a raw data record.
 *
 * Used by: David (comercial), Diego (producción), Finanzas, Copilot.
 */
export interface OperationalDemandSignal {
  organizationId:      string;
  reference:           string;
  description:         string;
  line:                string;
  /**
   * Signal type determines escalation path:
   *   inventory_pressure  — stock critically low, production/transfer needed
   *   order_surge         — unusual order velocity from CRM/channels
   *   opportunity_demand  — large opportunities about to close on this ref
   *   seasonal_risk       — velocity pattern suggests upcoming shortage
   *   dead_stock_risk     — low velocity + high stock = capital at risk
   */
  signalType:
    | "inventory_pressure"
    | "order_surge"
    | "opportunity_demand"
    | "seasonal_risk"
    | "dead_stock_risk"
    // Phase 2 — signals derived from real CRM order lines (AGENTIK-CRM-QUOTE-LINES-INGESTION-01)
    | "demand_from_crm_order"       // specific order line driving demand for a reference
    | "hot_reference"               // reference appearing in multiple active orders/opportunities
    | "multi_vendor_demand"         // same reference requested by multiple sales reps/vendors
    | "warehouse_pressure_candidate"; // demand concentrated in a specific warehouse
  urgency:             "alta" | "media" | "baja" | "ninguna";
  /** Units needed to resolve signal */
  qtyNeeded:           number;
  /** Estimated daily velocity (units sold per day) */
  velocityPerDay:      number | null;
  /** Estimated days of coverage at current velocity */
  coverageDaysEstimate: number | null;
  /** Sources that contributed to this signal */
  sourcePressures:     Array<{
    source:      OperationalSource;
    signalType:  string;
    weight:      number;  // contribution 0–1
  }>;
  /** Sales reps whose portfolios are affected */
  affectedSalesReps:   string[];
  /** Open opportunities referencing this product */
  openOpportunityCount: number;
  computedAt:          string;
  /** Whether this signal was escalated to the production queue */
  escalatedToProduction: boolean;
}

// ─── OperationalCommercialEvent ──────────────────────────────────────────────

/**
 * A discrete event in the commercial operational timeline.
 *
 * Unifies events from all sources into a single operational feed:
 *   - SAG document events (PD created, F1 issued)
 *   - CRM events (new customer, opportunity won)
 *   - Agentik engine outputs (pressure, coverage drop)
 *   - Reservation events (units held, released)
 *   - Task events (overdue, completed)
 *
 * This is the feed that powers:
 *   - Copilot activity rail
 *   - Executive timeline
 *   - Mobile briefing (future)
 *   - Agent context enrichment
 */
export interface OperationalCommercialEvent {
  id:             string;
  organizationId: string;
  /** Normalized event type — source-agnostic */
  eventType:      OperationalCommercialEventType;
  /** Urgency for UI prioritization */
  urgency:        "critica" | "alta" | "media" | "info";
  /** Affected entity type and ID */
  entityType?:    "order" | "customer" | "sales_rep" | "reference" | "opportunity" | "task" | "reservation";
  entityId?:      string;
  /** Human-readable title */
  title:          string;
  /** Full description */
  body:           string;
  /** Source system that generated this event */
  source:         OperationalSource;
  /** Serializable context payload */
  payload:        Record<string, unknown>;
  /** ISO timestamp of the event */
  timestamp:      string;
}

export type OperationalCommercialEventType =
  // Orders & fulfillment
  | "order.created"
  | "order.confirmed"
  | "order.sent_to_erp"
  | "order.fulfilled"
  | "order.cancelled"
  | "order.returned"
  // Inventory & coverage
  | "inventory.snapshot_updated"
  | "coverage.drop"
  | "coverage.critical"
  | "coverage.recovered"
  | "reference.depleted"
  | "reference.low_stock"
  | "dead_stock.detected"
  // Production
  | "production.signal_fired"
  | "production.urgente"
  | "production.completed"
  // Reservations (from AGENTIK-OPERATIONAL-RESERVATION-ENGINE-01)
  | "reservation.created"
  | "reservation.released"
  | "reservation.consumed"
  | "reservation.pressure_triggered"
  // CRM signals
  | "customer.new"
  | "customer.inactive_risk"
  | "opportunity.created"
  | "opportunity.won"
  | "opportunity.lost"
  | "sales_rep.inactive"
  | "task.overdue"
  | "sales_activity.logged"
  // Transfer
  | "transfer.suggested"
  | "transfer.confirmed"
  // Demand signals
  | "demand.signal_fired"
  | "demand.surge_detected";

// ─── Helper: OperationalSource type guard ─────────────────────────────────────

export type { OperationalEntityBase, OperationalSource } from "./operational-source";
