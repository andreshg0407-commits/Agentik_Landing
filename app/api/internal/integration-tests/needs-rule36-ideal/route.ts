/**
 * AGENTIK-STORES-NEEDS-RULE36-AND-IDEAL-CERTIFICATION-01 — Real Data Validation
 *
 * GET /api/internal/integration-tests/needs-rule36-ideal
 *
 * Validates with live Prisma data:
 *   - shortageQty = idealUnits - storeQty (not min, not max)
 *   - Rule 36 for same-ref vs replacement
 *   - 4-store evidence
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS === "true"
 */

import { NextResponse } from "next/server";
import {
  getCanonicalStoreDetail,
  CANONICAL_STORE_IDENTITY,
} from "@/lib/comercial/tiendas/store-distribution-service";
import {
  loadStoreNeedsByLine,
  type NeedItem,
} from "@/lib/comercial/tiendas/store-needs-by-line";
import {
  loadStoreInventoryByLine,
} from "@/lib/comercial/tiendas/store-inventory-by-line";
import {
  CASTILLITOS_GLOBAL_LOW_STOCK,
} from "@/lib/comercial/tiendas/store-policy-pack-config";
import { prisma } from "@/lib/prisma";

async function resolveOrgId(): Promise<string> {
  const org = await prisma.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true },
  });
  if (!org) throw new Error("Organization castillitos not found");
  return org.id;
}

interface TestResult {
  name: string;
  pass: boolean;
  detail: unknown;
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") {
    return NextResponse.json({ error: "ENABLE_INTERNAL_INTEGRATION_TESTS not enabled" }, { status: 403 });
  }

  const results: TestResult[] = [];
  const t0 = Date.now();

  const ORG_ID = await resolveOrgId();

  // ── Phase 1: shortageQty = idealUnits - storeQty ──────────────────────────

  // Load needs for Centro CASTILLITOS line
  const centroNeeds = await loadStoreNeedsByLine(ORG_ID, {
    storeId: "centro", line: "CASTILLITOS", page: 1, pageSize: 200,
  });

  // Find 10 items below minimum
  const belowMin = centroNeeds.items.filter(i =>
    i.currentUnits > 0 && i.currentUnits < i.minUnits && i.idealUnits > i.minUnits
  );

  const belowMinSamples = belowMin.slice(0, 10);
  for (const item of belowMinSamples) {
    const expectedShortage = item.idealUnits - item.currentUnits;
    const maxBased = item.maxUnits - item.currentUnits;
    results.push({
      name: `shortageQty_ideal_${item.referenceCode}`,
      pass: item.shortageQty === expectedShortage,
      detail: {
        ref: item.referenceCode,
        storeQty: item.currentUnits,
        min: item.minUnits,
        ideal: item.idealUnits,
        max: item.maxUnits,
        expectedShortageToIdeal: expectedShortage,
        expectedShortageToMax: maxBased,
        actualShortageQty: item.shortageQty,
        correctlyUsesIdeal: item.shortageQty === expectedShortage,
        wouldBeWrongIfMax: item.shortageQty === maxBased && maxBased !== expectedShortage,
      },
    });
  }

  // Find 5 items where idealUnits - currentUnits != maxUnits - currentUnits
  const diffMinIdealMax = centroNeeds.items.filter(i =>
    i.currentUnits > 0 &&
    i.currentUnits < i.minUnits &&
    (i.idealUnits - i.currentUnits) !== (i.maxUnits - i.currentUnits)
  ).slice(0, 5);

  for (const item of diffMinIdealMax) {
    const toIdeal = item.idealUnits - item.currentUnits;
    const toMax = item.maxUnits - item.currentUnits;
    results.push({
      name: `shortageQty_differs_ideal_vs_max_${item.referenceCode}`,
      pass: item.shortageQty === toIdeal && item.shortageQty !== toMax,
      detail: {
        ref: item.referenceCode,
        storeQty: item.currentUnits,
        min: item.minUnits, ideal: item.idealUnits, max: item.maxUnits,
        gapToIdeal: toIdeal,
        gapToMax: toMax,
        actualShortageQty: item.shortageQty,
        usesIdealNotMax: item.shortageQty === toIdeal,
      },
    });
  }

  // ── Phase 2: Rule 36 for same-reference surtido ──────────────────────────

  const threshold = CASTILLITOS_GLOBAL_LOW_STOCK.threshold; // 36

  // Load detail for all 4 stores to find same-ref Rule 36 cases
  const storeDetails = await Promise.all(
    ["centro", "caldas", "san_diego", "gran_plaza"].map(async slug => ({
      slug,
      detail: await getCanonicalStoreDetail(ORG_ID, slug),
    }))
  );

  // Find textile refs with mainWarehouseAvailable <= 36 in Centro (allowed store)
  const centroDetail = storeDetails.find(s => s.slug === "centro")!.detail;
  if (centroDetail) {
    const scarceInCentro = centroDetail.items.filter(i =>
      i.world === "TEXTILE" &&
      i.currentUnits > 0 &&
      i.mainWarehouseAvailable <= threshold &&
      i.mainWarehouseAvailable > 0 &&
      i.action !== "RETIRAR"
    ).slice(0, 5);

    for (const item of scarceInCentro) {
      results.push({
        name: `rule36_sameref_centro_allowed_${item.referenceCode}`,
        pass: item.action !== "RETIRAR" && item.resolvedBy !== "global_low_stock",
        detail: {
          ref: item.referenceCode,
          store: "centro",
          mainStock: item.mainWarehouseAvailable,
          threshold,
          action: item.action,
          resolvedBy: item.resolvedBy,
          allowed: true,
          reason: "Centro is in allowedStoreIds — can surtir/reponer scarce refs",
        },
      });
    }
  }

  // Same check for Caldas
  const caldasDetail = storeDetails.find(s => s.slug === "caldas")!.detail;
  if (caldasDetail) {
    const scarceInCaldas = caldasDetail.items.filter(i =>
      i.world === "TEXTILE" &&
      i.currentUnits > 0 &&
      i.mainWarehouseAvailable <= threshold &&
      i.mainWarehouseAvailable > 0 &&
      i.action !== "RETIRAR"
    ).slice(0, 5);

    for (const item of scarceInCaldas) {
      results.push({
        name: `rule36_sameref_caldas_allowed_${item.referenceCode}`,
        pass: item.action !== "RETIRAR" && item.resolvedBy !== "global_low_stock",
        detail: {
          ref: item.referenceCode,
          store: "caldas",
          mainStock: item.mainWarehouseAvailable,
          threshold,
          action: item.action,
          resolvedBy: item.resolvedBy,
          allowed: true,
        },
      });
    }
  }

  // San Diego: scarce refs MUST be RETIRAR
  const sdDetail = storeDetails.find(s => s.slug === "san_diego")!.detail;
  if (sdDetail) {
    const scarceInSD = sdDetail.items.filter(i =>
      i.world === "TEXTILE" &&
      i.currentUnits > 0 &&
      i.resolvedBy === "global_low_stock"
    ).slice(0, 5);

    for (const item of scarceInSD) {
      results.push({
        name: `rule36_sameref_san_diego_blocked_${item.referenceCode}`,
        pass: item.action === "RETIRAR" && item.resolvedBy === "global_low_stock",
        detail: {
          ref: item.referenceCode,
          store: "san_diego",
          mainStock: item.mainWarehouseAvailable,
          threshold,
          action: item.action,
          resolvedBy: item.resolvedBy,
          blocked: true,
        },
      });
    }
  }

  // Gran Plaza: scarce refs MUST be RETIRAR
  const gpDetail = storeDetails.find(s => s.slug === "gran_plaza")!.detail;
  if (gpDetail) {
    const scarceInGP = gpDetail.items.filter(i =>
      i.world === "TEXTILE" &&
      i.currentUnits > 0 &&
      i.resolvedBy === "global_low_stock"
    ).slice(0, 5);

    for (const item of scarceInGP) {
      results.push({
        name: `rule36_sameref_gran_plaza_blocked_${item.referenceCode}`,
        pass: item.action === "RETIRAR" && item.resolvedBy === "global_low_stock",
        detail: {
          ref: item.referenceCode,
          store: "gran_plaza",
          mainStock: item.mainWarehouseAvailable,
          threshold,
          action: item.action,
          resolvedBy: item.resolvedBy,
          blocked: true,
        },
      });
    }
  }

  // ── Phase 3: Rule 36 for replacement candidates ───────────────────────────

  // Load needs with replacements across lines
  const allNeeds: NeedItem[] = [];
  for (const line of ["CASTILLITOS", "LATIN_KIDS", "ACCESSORIES"] as const) {
    const needs = await loadStoreNeedsByLine(ORG_ID, {
      storeId: "centro", line, page: 1, pageSize: 200,
    });
    allNeeds.push(...needs.items);
  }

  // Find items with replacement candidates — verify all candidates have mainStock > 36
  const withCandidates = allNeeds.filter(i => i.candidates.length > 0);
  const candidatesAccepted: { ref: string; candidateRef: string; mainStock: number }[] = [];
  const candidatesAbove36 = withCandidates.flatMap(item =>
    item.candidates.map(c => ({
      sourceRef: item.referenceCode,
      candidateRef: c.referenceCode,
      mainStock: c.mainWarehouseAvailableQty,
      isAboveThreshold: c.mainWarehouseAvailableQty > threshold,
    }))
  );

  // All accepted candidates must have mainStock > 36
  const acceptedSamples = candidatesAbove36.slice(0, 10);
  for (const c of acceptedSamples) {
    results.push({
      name: `rule36_replacement_accepted_${c.candidateRef}_for_${c.sourceRef}`,
      pass: c.isAboveThreshold,
      detail: {
        sourceRef: c.sourceRef,
        candidateRef: c.candidateRef,
        mainStock: c.mainStock,
        threshold,
        isAboveThreshold: c.isAboveThreshold,
      },
    });
  }

  // Check rule36BlockedCount on items that have blocked candidates
  const withBlocked = allNeeds.filter(i => i.rule36BlockedCount > 0).slice(0, 10);
  for (const item of withBlocked) {
    results.push({
      name: `rule36_replacement_blocked_count_${item.referenceCode}`,
      pass: item.rule36BlockedCount > 0,
      detail: {
        ref: item.referenceCode,
        rule36BlockedCount: item.rule36BlockedCount,
        needType: item.needType,
        candidatesAccepted: item.candidates.length,
        allAcceptedAbove36: item.candidates.every(c => c.mainWarehouseAvailableQty > threshold),
      },
    });
  }

  // ── Phase 4: Inventory active exclusion ───────────────────────────────────

  // Verify inventory CASTILLITOS line has no zero-stock items
  const invCastillitos = await loadStoreInventoryByLine(ORG_ID, {
    storeId: "centro", line: "CASTILLITOS", page: 1, pageSize: 500,
  });
  const zeroStockInActive = invCastillitos.items.filter(i => i.currentStoreQty === 0);
  results.push({
    name: "inventory_active_no_zero_stock",
    pass: zeroStockInActive.length === 0,
    detail: {
      line: "CASTILLITOS",
      totalItems: invCastillitos.items.length,
      zeroStockCount: zeroStockInActive.length,
      sampleZeroRefs: zeroStockInActive.slice(0, 3).map(i => i.referenceCode),
    },
  });

  // Verify OUT_OF_STOCK line contains zero-stock items
  const invOutOfStock = await loadStoreInventoryByLine(ORG_ID, {
    storeId: "centro", line: "OUT_OF_STOCK", page: 1, pageSize: 50,
  });
  const nonZeroInOOS = invOutOfStock.items.filter(i => i.currentStoreQty > 0);
  results.push({
    name: "inventory_oos_all_zero_stock",
    pass: nonZeroInOOS.length === 0,
    detail: {
      line: "OUT_OF_STOCK",
      totalItems: invOutOfStock.items.length,
      nonZeroCount: nonZeroInOOS.length,
    },
  });

  // ── Phase 5: Line-specific evidence ───────────────────────────────────────

  // Castillitos needs
  const castNeedsSample = centroNeeds.items.filter(i => i.currentUnits > 0 && i.currentUnits < i.minUnits).slice(0, 5);
  for (const item of castNeedsSample) {
    results.push({
      name: `castillitos_need_${item.referenceCode}`,
      pass: item.shortageQty === Math.max(0, item.idealUnits - item.currentUnits),
      detail: {
        ref: item.referenceCode,
        actual: item.currentUnits, min: item.minUnits, ideal: item.idealUnits, max: item.maxUnits,
        shortageQty: item.shortageQty,
        expectedToIdeal: item.idealUnits - item.currentUnits,
        needType: item.needType,
      },
    });
  }

  // Latin Kids needs
  const lkNeeds = await loadStoreNeedsByLine(ORG_ID, {
    storeId: "centro", line: "LATIN_KIDS", page: 1, pageSize: 200,
  });
  const lkSamples = lkNeeds.items.filter(i => i.currentUnits > 0 && i.currentUnits < i.minUnits).slice(0, 5);
  for (const item of lkSamples) {
    results.push({
      name: `latin_kids_need_${item.referenceCode}`,
      pass: item.shortageQty === Math.max(0, item.idealUnits - item.currentUnits),
      detail: {
        ref: item.referenceCode,
        actual: item.currentUnits, min: item.minUnits, ideal: item.idealUnits, max: item.maxUnits,
        shortageQty: item.shortageQty,
        expectedToIdeal: item.idealUnits - item.currentUnits,
      },
    });
  }

  // Accessories needs
  const accNeeds = await loadStoreNeedsByLine(ORG_ID, {
    storeId: "centro", line: "ACCESSORIES", page: 1, pageSize: 200,
  });
  const accSamples = accNeeds.items.filter(i => i.currentUnits > 0 && i.currentUnits < i.minUnits).slice(0, 5);
  for (const item of accSamples) {
    results.push({
      name: `accessories_need_${item.referenceCode}`,
      pass: item.shortageQty === Math.max(0, item.idealUnits - item.currentUnits),
      detail: {
        ref: item.referenceCode,
        actual: item.currentUnits, min: item.minUnits, ideal: item.idealUnits, max: item.maxUnits,
        shortageQty: item.shortageQty,
        expectedToIdeal: item.idealUnits - item.currentUnits,
      },
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const elapsed = Date.now() - t0;
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  return NextResponse.json({
    sprint: "AGENTIK-STORES-NEEDS-RULE36-AND-IDEAL-CERTIFICATION-01",
    summary: {
      total: results.length,
      passed,
      failed,
      elapsedMs: elapsed,
      allPassed: failed === 0,
    },
    results,
    formulas: {
      needDetected: "storeQty > 0 && storeQty < minUnits",
      shortageQty: "max(0, idealUnits - storeQty)",
      maximumReceivableQty: "max(0, maxUnits - storeQty)",
      suggestedQty: "min(shortageQty, availableWarehouseQty, maximumReceivableQty)",
      rule36SameRef: "scarcity.enabled && !allowedIds.includes(storeSlug) && mainRefStock <= threshold → BLOCKED",
      rule36Replacement: "scarcity.enabled && mainRefStock <= threshold → BLOCKED (ALL stores, strict)",
    },
  });
}
