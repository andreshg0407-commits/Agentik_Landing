/**
 * lib/comercial/maletas/assortment-catalog/mallet-assortment-evaluator.ts
 *
 * Evaluates a mallet's current composition against its applicable assortment catalog.
 *
 * SCOPE: Maletas de vendedores ONLY. NOT for tiendas.
 *
 * Produces:
 * - Complete/missing/excess entries per group
 * - Suggestions for completion (ADD)
 * - Suggestions for swaps (SWAP) when excess in one subgroup and deficit in another
 * - Evidence trail
 * - Confidence score
 *
 * Sprint: CASTILLITOS-MALLET-POLICIES-01
 */

import type {
  MalletAssortmentEvaluation,
  MalletAssortmentEvaluationInput,
  MalletAssortmentEvaluationEvidence,
  MalletAssortmentStatus,
  MalletAssortmentSuggestion,
  MalletGroupResult,
  MalletGroupEntryResult,
  MalletCurrentItem,
  AvailableInventoryItem,
  MalletAssortmentGroup,
  MalletAssortmentEntry,
  DataQualityLevel,
} from "./mallet-assortment-types";

import { validateEvaluationInput } from "./mallet-assortment-validation";

// ── Main evaluator ──────────────────────────────────────────────────────────

export function evaluateMalletAssortment(
  input: MalletAssortmentEvaluationInput,
): MalletAssortmentEvaluation {
  const validation = validateEvaluationInput(input);
  if (!validation.valid) {
    return buildInsufficientDataResult(input, validation.issues.map((i) => i.message));
  }

  const { catalog, currentItems, availableInventory, traceId } = input;
  const groupResults: MalletGroupResult[] = [];
  const allSuggestions: MalletAssortmentSuggestion[] = [];
  const unresolvedReasons: string[] = [];

  let totalComplete = 0;
  let totalMissing = 0;
  let totalExcess = 0;
  let totalUnresolved = 0;
  let totalEntries = 0;

  for (const group of catalog.groups) {
    const result = evaluateGroup(
      group,
      currentItems,
      availableInventory,
      catalog,
      unresolvedReasons,
    );
    groupResults.push(result.groupResult);
    allSuggestions.push(...result.suggestions);

    totalComplete += result.groupResult.completeEntries;
    totalMissing += result.groupResult.missingEntries;
    totalExcess += result.groupResult.excessEntries;
    totalUnresolved += result.groupResult.unresolvedEntries;
    totalEntries += result.groupResult.entryResults.length;
  }

  // Cross-group swap suggestions (Phase 9)
  const swapSuggestions = buildSwapSuggestions(groupResults, currentItems, availableInventory, catalog);
  allSuggestions.push(...swapSuggestions);

  const overallCompletion = totalEntries > 0
    ? Math.round((totalComplete / totalEntries) * 100)
    : 0;

  const status = computeStatus(totalComplete, totalMissing, totalExcess, totalUnresolved, totalEntries);
  const confidence = computeConfidence(totalUnresolved, totalEntries, unresolvedReasons.length);
  const dataQuality = computeDataQuality(confidence);

  const evidence: MalletAssortmentEvaluationEvidence = {
    domain: "MALLET_ASSORTMENT_EVALUATION",
    traceId,
    tenantId: input.tenantId,
    catalogId: catalog.catalogId,
    catalogVersion: catalog.version,
    malletId: input.malletId,
    groupsEvaluated: groupResults.length,
    entriesEvaluated: totalEntries,
    dataQuality,
    unresolvedReasons,
    observedAt: input.asOf,
    note: null,
  };

  return {
    malletId: input.malletId,
    vendorId: input.vendorId,
    catalogId: catalog.catalogId,
    catalogVersion: catalog.version,
    commercialWorld: catalog.commercialWorld,
    brand: catalog.brand,
    groupResults,
    completeEntries: totalComplete,
    missingEntries: totalMissing,
    excessEntries: totalExcess,
    unresolvedEntries: totalUnresolved,
    overallCompletion,
    status,
    suggestions: allSuggestions,
    evidence,
    confidence,
    evaluatedAt: input.asOf,
  };
}

// ── Group evaluation ────────────────────────────────────────────────────────

interface GroupEvalResult {
  groupResult: MalletGroupResult;
  suggestions: MalletAssortmentSuggestion[];
}

function evaluateGroup(
  group: MalletAssortmentGroup,
  currentItems: readonly MalletCurrentItem[],
  availableInventory: readonly AvailableInventoryItem[],
  catalog: import("./mallet-assortment-types").MalletAssortmentCatalog,
  unresolvedReasons: string[],
): GroupEvalResult {
  const entryResults: MalletGroupEntryResult[] = [];
  const suggestions: MalletAssortmentSuggestion[] = [];
  let completeEntries = 0;
  let missingEntries = 0;
  let excessEntries = 0;
  let unresolvedEntries = 0;

  for (const entry of group.entries) {
    if (!entry.active) continue;

    // Match current items to this group+subgroup
    const matched = matchItemsToEntry(currentItems, group, entry, catalog.commercialWorld);

    const currentUnits = matched.length;
    const delta = currentUnits - entry.targetUnits;
    const complete = currentUnits >= entry.targetUnits;
    const excess = currentUnits > entry.targetUnits;

    if (matched.length === 0 && currentItems.length > 0) {
      // Items exist but none match — could be classification issue
      const hasUnclassified = currentItems.some(
        (item) => item.groupCode === null || item.subgroupCode === null,
      );
      if (hasUnclassified) {
        unresolvedReasons.push(`Unclassified items in group ${group.groupCode}`);
        unresolvedEntries++;
      }
    }

    entryResults.push({
      subgroupCode: entry.subgroupCode,
      subgroupName: entry.subgroupName,
      targetUnits: entry.targetUnits,
      currentUnits,
      delta,
      complete,
      excess,
      matchedReferences: matched.map((m) => m.reference),
    });

    if (complete) {
      completeEntries++;
    } else {
      missingEntries++;
      // Build ADD suggestions (Phase 8)
      const addSuggestions = buildAddSuggestions(
        group,
        entry,
        entry.targetUnits - currentUnits,
        matched.map((m) => m.reference),
        availableInventory,
        catalog,
      );
      suggestions.push(...addSuggestions);
    }

    if (excess) {
      excessEntries++;
    }
  }

  const activeEntries = group.entries.filter((e) => e.active).length;
  const groupCompletion = activeEntries > 0
    ? Math.round((completeEntries / activeEntries) * 100)
    : 100;

  return {
    groupResult: {
      groupCode: group.groupCode,
      groupName: group.groupName,
      entryResults,
      completeEntries,
      missingEntries,
      excessEntries,
      unresolvedEntries,
      groupCompletion,
    },
    suggestions,
  };
}

// ── Item matching ───────────────────────────────────────────────────────────

function matchItemsToEntry(
  items: readonly MalletCurrentItem[],
  group: MalletAssortmentGroup,
  entry: MalletAssortmentEntry,
  commercialWorld: string,
): readonly MalletCurrentItem[] {
  if (commercialWorld === "IMPORTACION") {
    // Import: match by sizeClass only
    return items.filter(
      (item) => item.sizeClass !== null && item.sizeClass === entry.subgroupCode,
    );
  }

  // Textil: match by groupCode + subgroupCode
  return items.filter(
    (item) =>
      item.groupCode === group.groupCode &&
      item.subgroupCode === entry.subgroupCode,
  );
}

// ── ADD suggestions (Phase 8) ───────────────────────────────────────────────

function buildAddSuggestions(
  group: MalletAssortmentGroup,
  entry: MalletAssortmentEntry,
  deficit: number,
  alreadyAssigned: readonly string[],
  availableInventory: readonly AvailableInventoryItem[],
  catalog: import("./mallet-assortment-types").MalletAssortmentCatalog,
): MalletAssortmentSuggestion[] {
  const suggestions: MalletAssortmentSuggestion[] = [];

  // Find candidates matching the group+subgroup
  const candidates = findCandidates(
    group,
    entry,
    alreadyAssigned,
    availableInventory,
    catalog.commercialWorld,
  );

  if (candidates.length === 0) {
    // No candidates — produce explanation
    suggestions.push({
      type: "ADD",
      groupCode: group.groupCode,
      groupName: group.groupName,
      subgroupCode: entry.subgroupCode,
      subgroupName: entry.subgroupName,
      reference: null,
      description: null,
      photoUrl: null,
      availableUnits: 0,
      suggestedQty: deficit,
      reason: `No available references for ${entry.subgroupName} in ${group.groupName}`,
      confidence: 0.3,
      evidence: {
        source: "evaluator",
        confidence: 0.3,
        note: "No candidates found in available inventory",
      },
    });
    return suggestions;
  }

  // Sort candidates by: availableUnits desc, quality desc
  const sorted = [...candidates].sort((a, b) => {
    if (b.availableUnits !== a.availableUnits) return b.availableUnits - a.availableUnits;
    return b.quality - a.quality;
  });

  let remaining = deficit;
  for (const candidate of sorted) {
    if (remaining <= 0) break;
    if (candidate.availableUnits <= 0) continue;

    const qty = Math.min(remaining, candidate.availableUnits);
    suggestions.push({
      type: "ADD",
      groupCode: group.groupCode,
      groupName: group.groupName,
      subgroupCode: entry.subgroupCode,
      subgroupName: entry.subgroupName,
      reference: candidate.reference,
      description: candidate.description,
      photoUrl: candidate.photoUrl,
      availableUnits: candidate.availableUnits,
      suggestedQty: qty,
      reason: `Completes ${entry.subgroupName} in ${group.groupName} (${deficit} needed)`,
      confidence: candidate.quality >= 0.8 ? 0.9 : candidate.quality >= 0.5 ? 0.7 : 0.5,
      evidence: {
        source: "evaluator",
        confidence: candidate.quality,
        note: `Available: ${candidate.availableUnits}, Quality: ${candidate.quality}`,
      },
    });
    remaining -= qty;
  }

  return suggestions;
}

function findCandidates(
  group: MalletAssortmentGroup,
  entry: MalletAssortmentEntry,
  exclude: readonly string[],
  inventory: readonly AvailableInventoryItem[],
  commercialWorld: string,
): readonly AvailableInventoryItem[] {
  const excludeSet = new Set(exclude.map((r) => r.toUpperCase()));

  return inventory.filter((item) => {
    if (excludeSet.has(item.reference.toUpperCase())) return false;
    if (item.availableUnits <= 0) return false;

    if (commercialWorld === "IMPORTACION") {
      return item.sizeClass !== null && item.sizeClass === entry.subgroupCode;
    }

    return (
      item.groupCode === group.groupCode &&
      item.subgroupCode === entry.subgroupCode
    );
  });
}

// ── SWAP suggestions (Phase 9) ──────────────────────────────────────────────

function buildSwapSuggestions(
  groupResults: readonly MalletGroupResult[],
  currentItems: readonly MalletCurrentItem[],
  availableInventory: readonly AvailableInventoryItem[],
  catalog: import("./mallet-assortment-types").MalletAssortmentCatalog,
): MalletAssortmentSuggestion[] {
  const suggestions: MalletAssortmentSuggestion[] = [];

  for (const gr of groupResults) {
    const excessEntries = gr.entryResults.filter((e) => e.excess);
    const deficitEntries = gr.entryResults.filter((e) => !e.complete);

    if (excessEntries.length === 0 || deficitEntries.length === 0) continue;

    for (const excess of excessEntries) {
      for (const deficit of deficitEntries) {
        const excessCount = excess.currentUnits - excess.targetUnits;
        const deficitCount = deficit.targetUnits - deficit.currentUnits;

        if (excessCount <= 0 || deficitCount <= 0) continue;

        // Find a reference from excess to remove
        const removeRef = excess.matchedReferences[excess.matchedReferences.length - 1] ?? null;
        if (!removeRef) continue;

        // Find a candidate to add for the deficit
        const candidates = findCandidates(
          catalog.groups.find((g) => g.groupCode === gr.groupCode)!,
          catalog.groups
            .find((g) => g.groupCode === gr.groupCode)!
            .entries.find((e) => e.subgroupCode === deficit.subgroupCode)!,
          deficit.matchedReferences,
          availableInventory,
          catalog.commercialWorld,
        );

        const addCandidate = candidates[0] ?? null;

        suggestions.push({
          type: "SWAP",
          groupCode: gr.groupCode,
          groupName: gr.groupName,
          subgroupCode: deficit.subgroupCode,
          subgroupName: `${excess.subgroupName} -> ${deficit.subgroupName}`,
          reference: addCandidate?.reference ?? null,
          description: addCandidate?.description ?? null,
          photoUrl: addCandidate?.photoUrl ?? null,
          availableUnits: addCandidate?.availableUnits ?? 0,
          suggestedQty: Math.min(excessCount, deficitCount),
          reason: `Excess in ${excess.subgroupName} (${excessCount} over), deficit in ${deficit.subgroupName} (${deficitCount} needed). Consider swapping.`,
          confidence: addCandidate ? 0.7 : 0.4,
          evidence: {
            source: "evaluator-swap",
            confidence: addCandidate ? 0.7 : 0.4,
            note: `Remove from ${excess.subgroupName}, add to ${deficit.subgroupName}`,
          },
        });
      }
    }
  }

  return suggestions;
}

// ── Status computation ──────────────────────────────────────────────────────

function computeStatus(
  complete: number,
  missing: number,
  excess: number,
  unresolved: number,
  total: number,
): MalletAssortmentStatus {
  if (total === 0) return "INSUFFICIENT_DATA";
  if (unresolved > total * 0.3) return "INSUFFICIENT_DATA";
  if (missing > 0 && excess > 0) return "CONFLICTED";
  if (excess > 0 && missing === 0) return "OVER_ASSORTED";
  if (missing > 0) return "INCOMPLETE";
  return "COMPLETE";
}

function computeConfidence(
  unresolved: number,
  total: number,
  unresolvedReasonCount: number,
): number {
  if (total === 0) return 0;
  const resolvedRatio = (total - unresolved) / total;
  const penaltyForReasons = Math.min(unresolvedReasonCount * 0.05, 0.3);
  return Math.max(0, Math.min(1, resolvedRatio - penaltyForReasons));
}

function computeDataQuality(confidence: number): DataQualityLevel {
  if (confidence >= 0.9) return "HIGH";
  if (confidence >= 0.7) return "MEDIUM";
  if (confidence >= 0.4) return "LOW";
  return "INSUFFICIENT";
}

// ── Insufficient data fallback ──────────────────────────────────────────────

function buildInsufficientDataResult(
  input: MalletAssortmentEvaluationInput,
  reasons: readonly string[],
): MalletAssortmentEvaluation {
  return {
    malletId: input.malletId,
    vendorId: input.vendorId,
    catalogId: input.catalog?.catalogId ?? "unknown",
    catalogVersion: input.catalog?.version ?? "0.0.0",
    commercialWorld: input.catalog?.commercialWorld ?? "TEXTIL",
    brand: input.catalog?.brand ?? null,
    groupResults: [],
    completeEntries: 0,
    missingEntries: 0,
    excessEntries: 0,
    unresolvedEntries: 0,
    overallCompletion: 0,
    status: "INSUFFICIENT_DATA",
    suggestions: [],
    evidence: {
      domain: "MALLET_ASSORTMENT_EVALUATION",
      traceId: input.traceId ?? "no-trace",
      tenantId: input.tenantId ?? "unknown",
      catalogId: input.catalog?.catalogId ?? "unknown",
      catalogVersion: input.catalog?.version ?? "0.0.0",
      malletId: input.malletId ?? "unknown",
      groupsEvaluated: 0,
      entriesEvaluated: 0,
      dataQuality: "INSUFFICIENT",
      unresolvedReasons: [...reasons],
      observedAt: input.asOf ?? new Date(),
      note: "Evaluation input validation failed",
    },
    confidence: 0,
    evaluatedAt: input.asOf ?? new Date(),
  };
}
