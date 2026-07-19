/**
 * lib/comercial/tiendas/store-guide-types.ts
 *
 * FASE 1-2 — Domain types for Store Warehouse Guides.
 * Pure types — no runtime logic, no Prisma, no imports.
 *
 * A warehouse guide is an operational document that tells bodega
 * exactly what to pick and ship to a specific store.
 *
 * Lifecycle: draft → approved → executed
 *            draft → cancelled
 *
 * Sprint: TIENDAS-WAREHOUSE-GUIDE-01
 */

import type { SuggestedAction, SuggestionConfidence } from "./store-suggestions-types";

// ── Guide status ────────────────────────────────────────────────────────────

export type GuideStatus = "draft" | "approved" | "executed" | "cancelled";

// ── Guide priority ──────────────────────────────────────────────────────────

export type GuidePriority = "critica" | "alta" | "media" | "baja";

// ── Guide line ──────────────────────────────────────────────────────────────

export interface StoreWarehouseGuideLine {
  id:                        string;

  // Link to suggestion
  suggestionId:              string;
  actionType:                SuggestedAction;

  // Product identity
  referenceCode:             string;
  productName:               string;
  size:                      string;
  color:                     string;

  // Quantities
  requestedQty:              number;
  approvedQty:               number;  // set on approval, defaults to requestedQty
  availableMainWarehouseQty: number;

  // Replacement (only for find_replacement)
  replacementReferenceCode:  string | null;
  replacementProductName:    string | null;

  // Evaluation
  reason:                    string;
  confidence:                SuggestionConfidence;
  priorityScore:             number;
}

// ── Audit entry ─────────────────────────────────────────────────────────────

export interface GuideAuditEntry {
  action:    "created" | "approved" | "cancelled" | "executed";
  userId:    string;
  timestamp: string;
  note?:     string;
}

// ── Guide summary ───────────────────────────────────────────────────────────

export interface GuideSummary {
  totalLines:           number;
  totalUnits:           number;
  transferFullCount:    number;
  transferPartialCount: number;
  findReplacementCount: number;
  overstockReviewCount: number;
  noActionCount:        number;
  executiveSummary:     string;
}

// ── Warehouse guide ─────────────────────────────────────────────────────────

export interface StoreWarehouseGuide {
  id:              string;
  organizationId:  string;

  guideNumber:     string;  // e.g. "TG-00034"

  // Destination
  storeId:         string;
  storeName:       string;

  // Metadata
  generatedAt:     string;
  generatedBy:     string;

  // Status
  status:          GuideStatus;

  // Totals
  totalLines:      number;
  totalUnits:      number;

  // Priority
  priority:        GuidePriority;
  priorityScore:   number;

  // Content
  summary:         GuideSummary;
  lines:           StoreWarehouseGuideLine[];

  // Audit
  audit:           GuideAuditEntry[];

  // User notes
  notes:           string;
}

// ── Guide card (for list view) ──────────────────────────────────────────────

export interface GuideCard {
  id:            string;
  guideNumber:   string;
  storeId:       string;
  storeName:     string;
  status:        GuideStatus;
  priority:      GuidePriority;
  priorityScore: number;
  totalLines:    number;
  totalUnits:    number;
  generatedAt:   string;
}

// ── Valid state transitions ─────────────────────────────────────────────────

export const GUIDE_TRANSITIONS: Record<GuideStatus, GuideStatus[]> = {
  draft:     ["approved", "cancelled"],
  approved:  ["executed"],
  executed:  [],
  cancelled: [],
};
