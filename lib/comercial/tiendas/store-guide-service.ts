/**
 * lib/comercial/tiendas/store-guide-service.ts
 *
 * FASE 8-10 — Service for store warehouse guides.
 * Persists guides in AgentExecution via metadataJson.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: TIENDAS-WAREHOUSE-GUIDE-01
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  StoreWarehouseGuide,
  StoreWarehouseGuideLine,
  GuideStatus,
  GuideCard,
  GuideAuditEntry,
  GuideSummary,
  GuidePriority,
  GUIDE_TRANSITIONS,
} from "./store-guide-types";
import type { StoreReplenishmentSuggestion } from "./store-suggestions-types";
import { buildWarehouseGuides } from "./store-guide-generator";
import { loadStoreSuggestions } from "./store-suggestions-service";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_STORE_WAREHOUSE_GUIDE";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── FASE 9 — State machine ──────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<GuideStatus, GuideStatus[]> = {
  draft:     ["approved", "cancelled"],
  approved:  ["executed"],
  executed:  [],
  cancelled: [],
};

function canTransition(from: GuideStatus, to: GuideStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Row mapping ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToGuide(row: any): StoreWarehouseGuide {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    id:             row.id,
    organizationId: row.tenantId,
    guideNumber:    (meta.guideNumber as string) ?? "",
    storeId:        (meta.storeId as string) ?? "",
    storeName:      (meta.storeName as string) ?? "",
    generatedAt:    row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    generatedBy:    row.createdBy ?? "system",
    status:         (meta.status as GuideStatus) ?? "draft",
    totalLines:     (meta.totalLines as number) ?? 0,
    totalUnits:     (meta.totalUnits as number) ?? 0,
    priority:       (meta.priority as GuidePriority) ?? "media",
    priorityScore:  (meta.priorityScore as number) ?? 0,
    summary:        (meta.summary as GuideSummary) ?? { totalLines: 0, totalUnits: 0, transferFullCount: 0, transferPartialCount: 0, findReplacementCount: 0, overstockReviewCount: 0, noActionCount: 0, executiveSummary: "" },
    lines:          (meta.lines as StoreWarehouseGuideLine[]) ?? [],
    audit:          (meta.audit as GuideAuditEntry[]) ?? [],
    notes:          (meta.notes as string) ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCard(row: any): GuideCard {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    id:            row.id,
    guideNumber:   (meta.guideNumber as string) ?? "",
    storeId:       (meta.storeId as string) ?? "",
    storeName:     (meta.storeName as string) ?? "",
    status:        (meta.status as GuideStatus) ?? "draft",
    priority:      (meta.priority as GuidePriority) ?? "media",
    priorityScore: (meta.priorityScore as number) ?? 0,
    totalLines:    (meta.totalLines as number) ?? 0,
    totalUnits:    (meta.totalUnits as number) ?? 0,
    generatedAt:   row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

// ── Generate guide ───────────────────────────────────────────────────────────

/**
 * Generate warehouse guides from current suggestions.
 * Creates one guide per store (grouped automatically).
 */
export async function generateGuides(
  orgId:       string,
  generatedBy: string,
): Promise<StoreWarehouseGuide[]> {
  // Load current suggestions
  const sugResult = await loadStoreSuggestions(orgId);
  if (sugResult.suggestions.length === 0) return [];

  // Get next sequence number
  const existingCount = await getGuideCount(orgId);
  const seqStart = existingCount + 1;

  // Build guides (pure engine)
  const guides = buildWarehouseGuides(
    sugResult.suggestions,
    orgId,
    generatedBy,
    seqStart,
  );

  // Persist each guide
  const persisted: StoreWarehouseGuide[] = [];
  for (const guide of guides) {
    const saved = await persistGuide(orgId, guide);
    persisted.push(saved);
  }

  return persisted;
}

async function getGuideCount(orgId: string): Promise<number> {
  try {
    const count = await execDb().count({
      where: { tenantId: orgId, module: MODULE, operation: OPERATION },
    });
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function persistGuide(
  orgId: string,
  guide: StoreWarehouseGuide,
): Promise<StoreWarehouseGuide> {
  const metadataJson = {
    guideNumber:   guide.guideNumber,
    storeId:       guide.storeId,
    storeName:     guide.storeName,
    status:        guide.status,
    totalLines:    guide.totalLines,
    totalUnits:    guide.totalUnits,
    priority:      guide.priority,
    priorityScore: guide.priorityScore,
    summary:       guide.summary,
    lines:         guide.lines,
    audit:         guide.audit,
    notes:         guide.notes,
  };

  const row = await execDb().create({
    data: {
      tenantId:     orgId,
      module:       MODULE,
      operation:    OPERATION,
      status:       "pending",
      createdBy:    guide.generatedBy,
      intent:       `Guia de surtido para ${guide.storeName}`,
      metadataJson,
    },
  });

  return rowToGuide(row);
}

// ── Load guides ──────────────────────────────────────────────────────────────

export async function loadGuides(orgId: string): Promise<GuideCard[]> {
  try {
    const rows = await execDb().findMany({
      where: { tenantId: orgId, module: MODULE, operation: OPERATION },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => rowToCard(r));
  } catch {
    return [];
  }
}

export async function loadGuide(
  orgId:   string,
  guideId: string,
): Promise<StoreWarehouseGuide | null> {
  try {
    const row = await execDb().findFirst({
      where: { id: guideId, tenantId: orgId, module: MODULE, operation: OPERATION },
    });
    return row ? rowToGuide(row) : null;
  } catch {
    return null;
  }
}

// ── FASE 9+10 — State transitions with audit ─────────────────────────────────

async function transitionGuide(
  orgId:    string,
  guideId:  string,
  toStatus: GuideStatus,
  userId:   string,
  note?:    string,
): Promise<StoreWarehouseGuide | null> {
  const guide = await loadGuide(orgId, guideId);
  if (!guide) return null;

  if (!canTransition(guide.status, toStatus)) {
    throw new Error(
      `Transicion invalida: ${guide.status} → ${toStatus}`,
    );
  }

  // Build audit entry
  const auditAction = toStatus === "approved" ? "approved"
    : toStatus === "cancelled" ? "cancelled"
    : toStatus === "executed" ? "executed"
    : "created";

  const auditEntry: GuideAuditEntry = {
    action:    auditAction,
    userId,
    timestamp: new Date().toISOString(),
    note,
  };

  const updatedAudit = [...guide.audit, auditEntry];

  // For approval, set approvedQty = requestedQty on all lines
  const updatedLines = toStatus === "approved"
    ? guide.lines.map(l => ({ ...l, approvedQty: l.requestedQty }))
    : guide.lines;

  const metadataJson = {
    guideNumber:   guide.guideNumber,
    storeId:       guide.storeId,
    storeName:     guide.storeName,
    status:        toStatus,
    totalLines:    guide.totalLines,
    totalUnits:    guide.totalUnits,
    priority:      guide.priority,
    priorityScore: guide.priorityScore,
    summary:       guide.summary,
    lines:         updatedLines,
    audit:         updatedAudit,
    notes:         guide.notes,
  };

  await execDb().update({
    where: { id: guideId },
    data:  { metadataJson },
  });

  return { ...guide, status: toStatus, lines: updatedLines, audit: updatedAudit };
}

export async function approveGuide(
  orgId: string, guideId: string, userId: string, note?: string,
): Promise<StoreWarehouseGuide | null> {
  return transitionGuide(orgId, guideId, "approved", userId, note);
}

export async function cancelGuide(
  orgId: string, guideId: string, userId: string, note?: string,
): Promise<StoreWarehouseGuide | null> {
  return transitionGuide(orgId, guideId, "cancelled", userId, note);
}

export async function markGuideExecuted(
  orgId: string, guideId: string, userId: string, note?: string,
): Promise<StoreWarehouseGuide | null> {
  return transitionGuide(orgId, guideId, "executed", userId, note);
}
