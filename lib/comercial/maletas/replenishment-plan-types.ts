/**
 * lib/comercial/maletas/replenishment-plan-types.ts
 *
 * MALETAS-BULK-REPLENISHMENT-01
 *
 * Domain types for the bulk replenishment plan model.
 * The operational unit is "Plan de surtido de maleta" — not individual replacement.
 *
 * A plan accumulates multiple changes for a single vendor/maleta,
 * then generates one surtido document for warehouse execution.
 */

// ── Plan status lifecycle ────────────────────────────────────────────────────

export type ReplenishmentPlanStatus =
  | "draft"
  | "pending_warehouse"
  | "prepared"
  | "shipped"
  | "received"
  | "cancelled";

export const PLAN_STATUS_LABEL: Record<ReplenishmentPlanStatus, string> = {
  draft:             "Borrador",
  pending_warehouse: "Pendiente bodega",
  prepared:          "Preparado",
  shipped:           "Enviado",
  received:          "Recibido",
  cancelled:         "Cancelado",
};

export const PLAN_STATUS_COLOR: Record<ReplenishmentPlanStatus, "info" | "warning" | "success" | "critical" | "neutral"> = {
  draft:             "info",
  pending_warehouse: "warning",
  prepared:          "info",
  shipped:           "info",
  received:          "success",
  cancelled:         "neutral",
};

// ── Replenishment plan (one per vendor, accumulates changes) ─────────────────

export interface MaletaReplenishmentPlan {
  id: string;
  organizationId: string;
  vendorId: string;
  vendorName: string;
  warehouseCode: string;
  status: ReplenishmentPlanStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  notes: string;
  items: MaletaReplenishmentItem[];
  /** Computed summaries */
  summaryAddedRefs: number;
  summaryRemovedRefs: number;
  /** Document number (set when status goes to pending_warehouse) */
  documentNumber: string | null;
  /** Traceability events */
  events: ReplenishmentEvent[];
}

// ── Plan item (one swap or addition) ─────────────────────────────────────────

export interface MaletaReplenishmentItem {
  id: string;
  planId: string;
  subgroupSag: string;
  /** Reference being removed from the maleta (null for pure additions) */
  removedReference: string | null;
  removedDescription: string | null;
  /** Reference being added to the maleta */
  addedReference: string;
  addedDescription: string;
  quantity: number;
  reason: string;
  createdAt: string;
}

// ── Traceability event ───────────────────────────────────────────────────────

export type ReplenishmentEventType =
  | "created"
  | "item_added"
  | "item_removed"
  | "item_edited"
  | "document_generated"
  | "dispatched"
  | "received"
  | "cancelled";

export interface ReplenishmentEvent {
  id: string;
  type: ReplenishmentEventType;
  description: string;
  user: string;
  timestamp: string;
}

// ── Coverage recovery ────────────────────────────────────────────────────────

export interface CoverageRecovery {
  addedRefs: number;
  removedRefs: number;
  subgroupsCovered: string[];
  estimatedCoverageGain: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function generatePlanId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateItemId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generatePlanDocumentNumber(): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
  return `PS-${ymd}-${seq}`;
}

export function createReplenishmentEvent(
  type: ReplenishmentEventType,
  description: string,
  user: string = "sistema",
): ReplenishmentEvent {
  return {
    id: generateEventId(),
    type,
    description,
    user,
    timestamp: new Date().toISOString(),
  };
}

export function computePlanSummary(items: MaletaReplenishmentItem[]): {
  summaryAddedRefs: number;
  summaryRemovedRefs: number;
  subgroupsCovered: string[];
} {
  const added = items.length;
  const removed = items.filter(i => i.removedReference).length;
  const subgroups = [...new Set(items.map(i => i.subgroupSag))];
  return { summaryAddedRefs: added, summaryRemovedRefs: removed, subgroupsCovered: subgroups };
}

export function computeCoverageRecovery(items: MaletaReplenishmentItem[]): CoverageRecovery {
  const { summaryAddedRefs, summaryRemovedRefs, subgroupsCovered } = computePlanSummary(items);
  const netGain = summaryAddedRefs - summaryRemovedRefs;
  return {
    addedRefs: summaryAddedRefs,
    removedRefs: summaryRemovedRefs,
    subgroupsCovered,
    estimatedCoverageGain: netGain > 0 ? netGain : 0,
  };
}
