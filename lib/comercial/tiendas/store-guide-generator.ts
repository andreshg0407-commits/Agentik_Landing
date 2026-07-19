/**
 * lib/comercial/tiendas/store-guide-generator.ts
 *
 * FASE 3-6 — Store Warehouse Guide Generator.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Converts StoreReplenishmentSuggestion[] → StoreWarehouseGuide[]
 * grouped by store, with priority calculation and executive summary.
 *
 * Sprint: TIENDAS-WAREHOUSE-GUIDE-01
 */

import type { StoreReplenishmentSuggestion } from "./store-suggestions-types";
import type {
  StoreWarehouseGuide,
  StoreWarehouseGuideLine,
  GuideSummary,
  GuidePriority,
  GuideAuditEntry,
} from "./store-guide-types";

// ── FASE 3+4 — Main generator ───────────────────────────────────────────────

/**
 * Build warehouse guides from replenishment suggestions.
 *
 * Groups suggestions by store — one guide per store.
 * Excludes no_action suggestions (nothing to do).
 *
 * @param suggestions  All suggestions (may span multiple stores)
 * @param orgId        Organization ID
 * @param generatedBy  User ID or "system"
 * @param guideSeqStart Starting sequence number for guide numbering
 */
export function buildWarehouseGuides(
  suggestions:   StoreReplenishmentSuggestion[],
  orgId:         string,
  generatedBy:   string,
  guideSeqStart: number = 1,
): StoreWarehouseGuide[] {
  // Filter out no_action — nothing to tell bodega
  const actionable = suggestions.filter(s => s.suggestedAction !== "no_action");

  if (actionable.length === 0) return [];

  // FASE 4 — Group by store
  const byStore = new Map<string, StoreReplenishmentSuggestion[]>();
  for (const s of actionable) {
    const arr = byStore.get(s.storeId) ?? [];
    arr.push(s);
    byStore.set(s.storeId, arr);
  }

  const guides: StoreWarehouseGuide[] = [];
  let seq = guideSeqStart;

  for (const [storeId, storeSugs] of byStore) {
    const guide = buildGuideForStore(storeSugs, orgId, generatedBy, seq);
    guides.push(guide);
    seq++;
  }

  // Sort by priority score descending (most urgent first)
  guides.sort((a, b) => b.priorityScore - a.priorityScore);

  return guides;
}

/**
 * Build a single warehouse guide for one store from its suggestions.
 */
export function buildWarehouseGuide(
  suggestions: StoreReplenishmentSuggestion[],
  orgId:       string,
  generatedBy: string,
  guideSeq:    number = 1,
): StoreWarehouseGuide {
  const actionable = suggestions.filter(s => s.suggestedAction !== "no_action");
  return buildGuideForStore(
    actionable.length > 0 ? actionable : suggestions,
    orgId,
    generatedBy,
    guideSeq,
  );
}

// ── Guide builder ───────────────────────────────────────────────────────────

function buildGuideForStore(
  suggestions: StoreReplenishmentSuggestion[],
  orgId:       string,
  generatedBy: string,
  seq:         number,
): StoreWarehouseGuide {
  const first = suggestions[0];
  const now = new Date().toISOString();

  // Build lines
  const lines = suggestions.map((s, i) => buildGuideLine(s, i + 1));

  // Sort lines by priority
  lines.sort((a, b) => b.priorityScore - a.priorityScore);

  // FASE 5 — Priority calculation
  const { priority, priorityScore } = calculateGuidePriority(suggestions);

  // FASE 6 — Executive summary
  const summary = buildGuideSummary(lines);

  // Audit trail
  const audit: GuideAuditEntry[] = [{
    action:    "created",
    userId:    generatedBy,
    timestamp: now,
  }];

  const totalUnits = lines.reduce((sum, l) => sum + l.requestedQty, 0);

  return {
    id:             `guide-${seq}`, // placeholder — service assigns real ID
    organizationId: orgId,
    guideNumber:    `TG-${String(seq).padStart(5, "0")}`,
    storeId:        first.storeId,
    storeName:      first.storeName,
    generatedAt:    now,
    generatedBy,
    status:         "draft",
    totalLines:     lines.length,
    totalUnits,
    priority,
    priorityScore,
    summary,
    lines,
    audit,
    notes:          "",
  };
}

// ── Line builder ────────────────────────────────────────────────────────────

function buildGuideLine(
  s:     StoreReplenishmentSuggestion,
  lineNum: number,
): StoreWarehouseGuideLine {
  // For find_replacement, pick the top candidate
  const topReplacement = s.replacementCandidates?.[0] ?? null;

  return {
    id:                        `ln-${lineNum}`,
    suggestionId:              s.suggestionId,
    actionType:                s.suggestedAction,
    referenceCode:             s.referenceCode,
    productName:               s.productName,
    size:                      s.size,
    color:                     s.color,
    requestedQty:              s.suggestedAction === "overstock_review" ? 0 : (s.transferQty > 0 ? s.transferQty : s.neededQty),
    approvedQty:               0, // set on approval
    availableMainWarehouseQty: s.mainWarehouseQty,
    replacementReferenceCode:  s.suggestedAction === "find_replacement" && topReplacement
      ? topReplacement.referenceCode : null,
    replacementProductName:    s.suggestedAction === "find_replacement" && topReplacement
      ? topReplacement.productName : null,
    reason:                    s.reason,
    confidence:                s.confidence,
    priorityScore:             s.priorityScore,
  };
}

// ── FASE 5 — Priority calculation ───────────────────────────────────────────

function calculateGuidePriority(
  suggestions: StoreReplenishmentSuggestion[],
): { priority: GuidePriority; priorityScore: number } {
  const outCount = suggestions.filter(s => s.needStatus === "out").length;
  const lowCount = suggestions.filter(s => s.needStatus === "low").length;
  const replacementCount = suggestions.filter(s => s.suggestedAction === "find_replacement").length;
  const avgScore = suggestions.length > 0
    ? suggestions.reduce((sum, s) => sum + s.priorityScore, 0) / suggestions.length
    : 0;

  // Composite score: out count weighs most, then avg need score
  const compositeScore = Math.round(
    outCount * 15 +
    lowCount * 5 +
    replacementCount * 3 +
    avgScore * 0.5,
  );

  let priority: GuidePriority;
  if (outCount >= 5 || compositeScore >= 100) {
    priority = "critica";
  } else if (outCount >= 2 || compositeScore >= 50) {
    priority = "alta";
  } else if (outCount >= 1 || lowCount >= 3 || compositeScore >= 25) {
    priority = "media";
  } else {
    priority = "baja";
  }

  return { priority, priorityScore: compositeScore };
}

// ── FASE 6 — Executive summary ──────────────────────────────────────────────

function buildGuideSummary(lines: StoreWarehouseGuideLine[]): GuideSummary {
  const transferFullCount    = lines.filter(l => l.actionType === "transfer_full").length;
  const transferPartialCount = lines.filter(l => l.actionType === "transfer_partial").length;
  const findReplacementCount = lines.filter(l => l.actionType === "find_replacement").length;
  const overstockReviewCount = lines.filter(l => l.actionType === "overstock_review").length;
  const noActionCount        = lines.filter(l => l.actionType === "no_action").length;
  const totalUnits           = lines.reduce((sum, l) => sum + l.requestedQty, 0);

  // Build human-readable executive summary
  const parts: string[] = [];

  const actionableCount = transferFullCount + transferPartialCount + findReplacementCount;
  parts.push(`${actionableCount} referencias requieren surtido.`);

  if (transferFullCount > 0) {
    parts.push(`${transferFullCount} pueden surtirse completamente.`);
  }
  if (transferPartialCount > 0) {
    parts.push(`${transferPartialCount} requieren surtido parcial.`);
  }
  if (findReplacementCount > 0) {
    parts.push(`${findReplacementCount} requieren reemplazo.`);
  }
  if (overstockReviewCount > 0) {
    parts.push(`${overstockReviewCount} con sobrestock para revisar.`);
  }

  parts.push(`Total estimado: ${totalUnits} unidades.`);

  return {
    totalLines:           lines.length,
    totalUnits,
    transferFullCount,
    transferPartialCount,
    findReplacementCount,
    overstockReviewCount,
    noActionCount,
    executiveSummary:     parts.join(" "),
  };
}
