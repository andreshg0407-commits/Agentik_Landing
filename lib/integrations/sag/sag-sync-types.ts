/**
 * lib/integrations/sag/sag-sync-types.ts
 *
 * SAG Synchronization Types — defines the contract for data exchange
 * between Agentik's Operational Intelligence Layer and SAG/PYA ERP.
 *
 * ─── ARCHITECTURAL POSITION ────────────────────────────────────────────────
 * Agentik does NOT replace SAG. It builds operational intelligence on top of it.
 * This file defines the synchronization language — what flows in each direction
 * and what format it takes.
 *
 * Directions:
 *   Agentik → SAG: confirmed orders (PD), reservations (optional), notes
 *   SAG → Agentik: invoices (F1/F2), credit notes (NC), inventory updates,
 *                  production completions, document statuses
 *
 * Integration evolution:
 *   V1: Manual Excel/CSV export from SAG → Agentik import
 *   V2: ODBC/SQL read-only queries to SAG views
 *   V3: Event polling / webhooks (SAG pushes changes)
 *   V4: Full bidirectional: Agentik orders → SAG PD; SAG events → Agentik
 *
 * This file is the preparatory contract — no live integration yet.
 *
 * Sprint: AGENTIK-SAG-OPERATIONAL-CONTRACT-01
 * ───────────────────────────────────────────────────────────────────────────
 */

// ─── Sync direction ───────────────────────────────────────────────────────────

/**
 * Direction of a sync event.
 *   agentik_to_sag — Agentik initiates, SAG receives
 *   sag_to_agentik — SAG generates, Agentik processes
 *   bidirectional  — reconciliation events (both parties updated)
 */
export type SagSyncDirection =
  | "agentik_to_sag"
  | "sag_to_agentik"
  | "bidirectional";

// ─── Sync status ──────────────────────────────────────────────────────────────

/**
 * Lifecycle state of a sync event.
 *
 *   pending    — queued for sync, not yet attempted
 *   in_flight  — currently being processed
 *   succeeded  — sync completed successfully
 *   failed     — sync failed — retryable
 *   rejected   — SAG rejected the document — not retryable without correction
 *   superseded — a newer event replaced this one
 */
export type SagSyncStatus =
  | "pending"
  | "in_flight"
  | "succeeded"
  | "failed"
  | "rejected"
  | "superseded";

// ─── SAG document types ───────────────────────────────────────────────────────

/**
 * Types of SAG documents that Agentik may reference or receive.
 * NOT a complete list of SAG document types — only those relevant to
 * the Agentik operational layer.
 */
export type SagDocumentType =
  | "PD"    // Pedido — sales order / pending order
  | "F1"    // Factura tipo 1
  | "F2"    // Factura tipo 2
  | "NC"    // Nota Crédito
  | "ND"    // Nota Débito
  | "REM"   // Remisión
  | "OC"    // Orden de Compra
  | "OP"    // Orden de Producción
  | "MOV";  // Movimiento de inventario

// ─── SAG document reference ───────────────────────────────────────────────────

/**
 * A pointer to a document that exists in SAG.
 * Used by Agentik to link operational records to their legal counterparts.
 *
 * Agentik does NOT store the document itself — only the reference.
 * The actual document lives in SAG and is the fiscal source of truth.
 */
export interface SagDocumentReference {
  /** Unique SAG document identifier */
  sagId:          string;
  /** SAG document type */
  docType:        SagDocumentType;
  /** SAG document number (human-readable) */
  docNumber:      string;
  /** SAG company/company code */
  sagCompanyCode: string;
  /** ISO date of document creation in SAG */
  sagDocDate:     string;
  /** Total document value (for reconciliation reference — NOT accounting in Agentik) */
  totalValue:     number | null;
  /** SAG's internal status for this document */
  sagStatus:      string | null;
  /** ISO timestamp of last sync with Agentik */
  lastSyncAt:     string;
}

// ─── SAG sync event ───────────────────────────────────────────────────────────

/**
 * A discrete synchronization event between Agentik and SAG.
 * Each event describes one data exchange — one document, one direction.
 *
 * Events are immutable once created. State transitions produce new events.
 * This enables full audit trail of the Agentik ↔ SAG exchange.
 */
export interface SagSyncEvent {
  id:             string;
  organizationId: string;
  /** What triggered or generated this event */
  eventType:      SagSyncEventType;
  direction:      SagSyncDirection;
  status:         SagSyncStatus;
  /** The SAG document this event relates to */
  sagDocument:    SagDocumentReference | null;
  /** The Agentik entity this event relates to */
  agentikEntityType: "order" | "portfolio_item" | "reservation" | "production_signal" | "inventory_snapshot";
  agentikEntityId:   string;
  /** Raw payload sent or received */
  payload:        Record<string, unknown>;
  /** SAG response payload (if sag_to_agentik) */
  response:       Record<string, unknown> | null;
  /** Error message if failed */
  errorMessage:   string | null;
  /** Number of retry attempts */
  retryCount:     number;
  /** ISO timestamp of first attempt */
  firstAttemptAt: string | null;
  /** ISO timestamp of last attempt */
  lastAttemptAt:  string | null;
  createdAt:      string;
}

// ─── Event types ──────────────────────────────────────────────────────────────

/**
 * Taxonomy of events that can occur in the Agentik ↔ SAG sync channel.
 *
 * Naming convention: {entity}.{action}_{direction}
 *   direction: _to_sag | _from_sag | (none for internal)
 */
export type SagSyncEventType =
  // Orders
  | "order.sent_to_sag"           // Agentik confirmed order → SAG PD
  | "order.pd_acknowledged"       // SAG confirmed receipt of PD
  | "order.pd_rejected"           // SAG rejected PD
  // Invoices
  | "invoice.received_from_sag"   // SAG generated F1/F2 → Agentik marks fulfilled
  // Credit notes
  | "credit_note.received"        // SAG issued NC → Agentik reverses operational effect
  // Inventory
  | "inventory.updated_from_sag"  // New SAG inventory snapshot imported
  | "inventory.movement_received" // Single kardex movement from SAG
  // Production
  | "production.order_sent"       // Agentik production signal → SAG OP
  | "production.completed_from_sag" // SAG completed OP → inventory updated
  // Reservations
  | "reservation.sent_to_sag"     // Optional: Agentik reservation → SAG hold
  | "reservation.confirmed_by_sag"
  // Cartera
  | "payment.received_from_sag"   // SAG received customer payment;

// ─── SAG connection config ────────────────────────────────────────────────────

/**
 * Runtime configuration for a SAG connection.
 * Stored securely — not in plaintext config files.
 *
 * All fields required for V2 ODBC integration.
 * V1 (Excel import) uses only companyCode and dataPath.
 */
export interface SagConnectionConfig {
  organizationId: string;
  /** SAG company identifier */
  companyCode:    string;
  /** Integration version in use */
  version:        "v1_excel" | "v2_odbc" | "v3_api";
  /** V1 only: path to SAG Excel export file */
  dataPath?:      string;
  /** V2+: ODBC DSN or connection string key (resolved from vault) */
  odbcDsnKey?:    string;
  /** V3+: SAG API base URL */
  apiBaseUrl?:    string;
  /** Read-only guarantee (enforced in boundary layer) */
  readOnly:       boolean;
  /** Maximum rows per query (performance safety) */
  maxRows:        number;
}
