/**
 * lib/comercial/tiendas/store-copilot-domain-types.ts
 *
 * AGENTIK-COPILOT-STORES-TOOLS-01 — Client-safe types for Tiendas Copilot domain tools.
 *
 * Pure types only. No runtime, no Prisma, no server-only.
 *
 * These types define the structured result contracts for domain tools.
 * Every result includes provenance (source, freshness, limitations).
 */

// ── Provenance ──────────────────────────────────────────────────────────────

export interface DataProvenance {
  source: string;
  asOf: string;          // ISO date or datetime
  dataStart?: string;    // ISO date — earliest data point
  dataEnd?: string;      // ISO date — latest data point
  limitations?: string[];
}

// ── Tool classification ──────────────────────────────────────────────────────

export type ToolCategory = "READ" | "ANALYZE" | "PREPARE" | "WRITE" | "APPROVAL_REQUIRED";

// ── Tool definition ──────────────────────────────────────────────────────────

export interface DomainToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  approvalRequired: boolean;
  permission: string;
  inputSchema: Record<string, unknown>;
  outputType: string;
}

// ── Monthly time series ─────────────────────────────────────────────────────

export interface MonthlySalesEntry {
  month: string;          // "2026-01", "2026-02", etc.
  invoiceUnits: number;
  invoiceTotal: number;
  creditNoteUnits: number;
  creditNoteTotal: number;
  netUnits: number;
  netTotal: number;
  lineCount: number;
}

export interface ProductTimeSeriesResult {
  storeId: string;
  storeName: string;
  referenceCode: string;
  months: MonthlySalesEntry[];
  provenance: DataProvenance;
}

// ── Cross-store product sales ───────────────────────────────────────────────

export interface StoreProductSalesSlice {
  storeId: string;
  storeName: string;
  invoiceUnits: number;
  invoiceTotal: number;
  creditNoteUnits: number;
  creditNoteTotal: number;
  netUnits: number;
  netTotal: number;
}

export interface CrossStoreProductSalesResult {
  referenceCode: string;
  articleName: string;
  dateFrom: string;
  dateTo: string;
  stores: StoreProductSalesSlice[];
  totalNetUnits: number;
  totalNetTotal: number;
  provenance: DataProvenance;
}

// ── Cross-store rate ranking ────────────────────────────────────────────────

export interface StoreProductRateRank {
  storeId: string;
  storeName: string;
  salesRate30d: number;
  netUnits30d: number;
  rank: number;
}

export interface CrossStoreRateRankingResult {
  referenceCode: string;
  productName: string;
  windowId: string;
  stores: StoreProductRateRank[];
  provenance: DataProvenance;
}

// ── Reservation expiry ──────────────────────────────────────────────────────

export interface ExpiringReservation {
  documentId: string;
  documentNumber: string;
  storeId: string;
  storeName: string;
  status: string;
  reservedAt: string;
  hoursElapsed: number;
  isExpiring: boolean;
}

export interface ReservationExpiryResult {
  reservations: ExpiringReservation[];
  provenance: DataProvenance;
}

// ── Attention signals ───────────────────────────────────────────────────────

export type AttentionSeverity = "critical" | "warning" | "info";

export interface StoreAttentionItem {
  type: string;
  severity: AttentionSeverity;
  storeId: string;
  storeName: string;
  entityId?: string;
  title: string;
  evidence: Record<string, unknown>;
  suggestedAction: string;
  deduplicationKey: string;
  createdAt: string;
}

export interface StoreAttentionResult {
  items: StoreAttentionItem[];
  provenance: DataProvenance;
}
