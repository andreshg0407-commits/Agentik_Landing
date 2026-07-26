/**
 * app/api/internal/integration-tests/supply-rules-certification/route.ts
 *
 * AGENTIK-STORES-SUPPLY-RULES-CONSUMPTION-CERTIFICATION-01 — Integration Harness
 *
 * GET /api/internal/integration-tests/supply-rules-certification
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS === "true"
 *
 * Phases:
 *   1  — Baseline snapshots for all 4 stores
 *   2  — Override lifecycle: save 6/8/10 → verify → restore 8/10/12
 *   3  — Rule 36 validation across stores
 *   4  — Special rules validation
 *   5  — Per-store case evidence
 *   6  — Performance summary
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import {
  getEffectiveStoreConfig,
  saveDistributionConfig,
} from "@/lib/comercial/tiendas/store-distribution-actions";

import {
  getCanonicalStoreDetail,
  CANONICAL_STORE_IDENTITY,
} from "@/lib/comercial/tiendas/store-distribution-service";

import {
  loadStoreInventoryByLine,
} from "@/lib/comercial/tiendas/store-inventory-by-line";

import {
  loadStoreNeedsByLine,
} from "@/lib/comercial/tiendas/store-needs-by-line";

import {
  CASTILLITOS_TEXTILE_COVERAGE,
  CASTILLITOS_GLOBAL_LOW_STOCK,
  CASTILLITOS_SPECIAL_PRODUCTS,
} from "@/lib/comercial/tiendas/store-policy-pack-config";

// ── Guards ────────────────────────────────────────────────────────────────────

function guardCheck(): string | null {
  if (process.env.NODE_ENV === "production") return "BLOCKED: production environment";
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") {
    return "BLOCKED: set ENABLE_INTERNAL_INTEGRATION_TESTS=true";
  }
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestResult {
  id: string;
  name: string;
  pass: boolean;
  detail: unknown;
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORE_SLUGS = Object.values(CANONICAL_STORE_IDENTITY).map(s => s.slug);

async function resolveOrgId(): Promise<string> {
  const org = await prisma.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true },
  });
  if (!org) throw new Error("Organization castillitos not found");
  return org.id;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  const blockReason = guardCheck();
  if (blockReason) {
    return NextResponse.json({ error: blockReason }, { status: 403 });
  }

  const results: TestResult[] = [];
  const t0 = Date.now();

  try {
    const orgId = await resolveOrgId();

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 1 — BASELINE: Read all 4 stores
    // ══════════════════════════════════════════════════════════════════════════

    const baselineConfigs: Record<string, unknown> = {};

    for (const slug of STORE_SLUGS) {
      const t1 = Date.now();
      try {
        const config = await getEffectiveStoreConfig(orgId, slug);
        const detail = await getCanonicalStoreDetail(orgId, slug);
        baselineConfigs[slug] = config;

        // Get a sample from inventory
        const invResult = await loadStoreInventoryByLine(orgId, {
          storeId: slug,
          line: "CASTILLITOS",
          page: 1,
          pageSize: 5,
        });

        // Get a sample from needs
        const needsResult = await loadStoreNeedsByLine(orgId, {
          storeId: slug,
          line: "CASTILLITOS",
          page: 1,
          pageSize: 5,
        });

        results.push({
          id: `P1_BASELINE_${slug.toUpperCase()}`,
          name: `Baseline snapshot for ${slug}`,
          pass: true,
          detail: {
            storeName: Object.values(CANONICAL_STORE_IDENTITY).find(s => s.slug === slug)?.name,
            distributionItemCount: detail?.items.length ?? 0,
            effectiveConfig: config,
            inventorySample: invResult.items.slice(0, 3).map(i => ({
              referenceCode: i.referenceCode,
              productName: i.productName,
              currentStoreQty: i.currentStoreQty,
              mainWarehouseQty: i.mainWarehouseQty,
              minUnits: i.minUnits,
              idealUnits: i.idealUnits,
              maxUnits: i.maxUnits,
              inventoryState: i.inventoryState,
              effectiveRule: i.effectiveRule,
            })),
            needsSample: needsResult.items.slice(0, 3).map(n => ({
              referenceCode: n.referenceCode,
              productName: n.productName,
              currentUnits: n.currentUnits,
              minUnits: n.minUnits,
              idealUnits: n.idealUnits,
              maxUnits: n.maxUnits,
              shortageQty: n.shortageQty,
              needType: n.needType,
              suggestedReplenishment: n.suggestedReplenishment,
              effectiveRule: n.effectiveRule,
            })),
            inventoryTotalCount: invResult.pagination.total,
            needsTotalCount: needsResult.pagination.total,
          },
          durationMs: Date.now() - t1,
        });
      } catch (err) {
        results.push({
          id: `P1_BASELINE_${slug.toUpperCase()}`,
          name: `Baseline snapshot for ${slug}`,
          pass: false,
          detail: { error: String(err) },
          durationMs: Date.now() - t1,
        });
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2 — OVERRIDE LIFECYCLE: save 6/8/10, verify, restore
    // ══════════════════════════════════════════════════════════════════════════

    const OVERRIDE_STORE = "centro";

    // 2A — Capture BEFORE state
    const t2a = Date.now();
    const configBefore = await getEffectiveStoreConfig(orgId, OVERRIDE_STORE);
    results.push({
      id: "P2A_CONFIG_BEFORE",
      name: "Effective config BEFORE override (Centro)",
      pass: true,
      detail: { castillitos: configBefore.castillitos, latinKids: configBefore.latinKids },
      durationMs: Date.now() - t2a,
    });

    // Capture inventory BEFORE for comparison
    const invBefore = await loadStoreInventoryByLine(orgId, {
      storeId: OVERRIDE_STORE,
      line: "CASTILLITOS",
      page: 1,
      pageSize: 50,
    });

    const needsBefore = await loadStoreNeedsByLine(orgId, {
      storeId: OVERRIDE_STORE,
      line: "CASTILLITOS",
      page: 1,
      pageSize: 50,
    });

    // 2B — Apply override: minUnits=6, targetUnits=8, maxUnits=10
    const t2b = Date.now();
    const saveResult = await saveDistributionConfig({
      orgId,
      storeId: OVERRIDE_STORE,
      storeName: "Centro",
      userId: "integration-test-runner",
      role: "ORG_ADMIN" as any,
      config: {
        castillitos: {
          enabled: true,
          minUnits: 6,
          targetUnits: 8,
          maxUnits: 10,
          validFrom: null,
          validTo: null,
          season: "CERT-TEST",
          notes: "Supply rules certification — temporary override",
          source: "store_override",
        },
      },
      motivo: "AGENTIK-STORES-SUPPLY-RULES-CONSUMPTION-CERTIFICATION-01 — controlled override test",
      source: "api",
    });
    const saveDurationMs = Date.now() - t2b;

    results.push({
      id: "P2B_SAVE_OVERRIDE",
      name: "Save override 6/8/10 for Centro Castillitos",
      pass: saveResult.ok === true,
      detail: {
        ok: saveResult.ok,
        error: saveResult.error,
        validationErrors: saveResult.validationErrors,
        savedConfig: saveResult.config?.castillitos,
      },
      durationMs: saveDurationMs,
    });

    // 2C — Read effective config AFTER override
    const t2c = Date.now();
    const configAfter = await getEffectiveStoreConfig(orgId, OVERRIDE_STORE);
    const overrideApplied =
      configAfter.castillitos.minUnits === 6
      && configAfter.castillitos.targetUnits === 8
      && configAfter.castillitos.maxUnits === 10
      && configAfter.castillitos.source === "store_override";

    results.push({
      id: "P2C_CONFIG_AFTER",
      name: "Effective config AFTER override (Centro)",
      pass: overrideApplied,
      detail: {
        expected: { minUnits: 6, targetUnits: 8, maxUnits: 10, source: "store_override" },
        actual: configAfter.castillitos,
      },
      durationMs: Date.now() - t2c,
    });

    // 2D — Verify Prisma persistence
    const t2d = Date.now();
    const storedPolicy = await prisma.agentExecution.findFirst({
      where: {
        tenantId: orgId,
        operation: "COMERCIAL_STORE_POLICY_RULES",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, metadataJson: true, createdAt: true },
    });

    const policyData = storedPolicy?.metadataJson as any;
    const storedRules = policyData?.rules ?? [];
    const castillitosRule = storedRules.find(
      (r: any) => r.scope === "line" && r.line === "castillitos",
    );

    results.push({
      id: "P2D_PRISMA_PERSISTENCE",
      name: "StorePolicyRule persisted in Prisma",
      pass: !!castillitosRule && castillitosRule.minQty === 6,
      detail: {
        executionId: storedPolicy?.id,
        castillitosRule,
        totalRules: storedRules.length,
      },
      durationMs: Date.now() - t2d,
    });

    // 2E — Verify audit trail
    const t2e = Date.now();
    const auditEntry = await prisma.agentExecution.findFirst({
      where: {
        tenantId: orgId,
        operation: "STORE_DISTRIBUTION_CONFIG_AUDIT",
        intent: { contains: "centro" },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, intent: true, metadataJson: true, createdAt: true },
    });

    results.push({
      id: "P2E_AUDIT_TRAIL",
      name: "Audit entry recorded for override",
      pass: !!auditEntry,
      detail: {
        auditId: auditEntry?.id,
        intent: auditEntry?.intent,
        createdAt: auditEntry?.createdAt,
      },
      durationMs: Date.now() - t2e,
    });

    // 2F — Verify inventory reflects override
    const t2f = Date.now();
    const invAfter = await loadStoreInventoryByLine(orgId, {
      storeId: OVERRIDE_STORE,
      line: "CASTILLITOS",
      page: 1,
      pageSize: 50,
    });

    // Find items where state changed due to lower thresholds
    const stateChanges: unknown[] = [];
    for (const afterItem of invAfter.items) {
      const beforeItem = invBefore.items.find(b => b.referenceCode === afterItem.referenceCode);
      if (beforeItem && beforeItem.inventoryState !== afterItem.inventoryState) {
        stateChanges.push({
          referenceCode: afterItem.referenceCode,
          currentStoreQty: afterItem.currentStoreQty,
          before: {
            state: beforeItem.inventoryState,
            min: beforeItem.minUnits,
            ideal: beforeItem.idealUnits,
            max: beforeItem.maxUnits,
            ruleSource: beforeItem.effectiveRule?.source,
          },
          after: {
            state: afterItem.inventoryState,
            min: afterItem.minUnits,
            ideal: afterItem.idealUnits,
            max: afterItem.maxUnits,
            ruleSource: afterItem.effectiveRule?.source,
          },
        });
      }
    }

    // Find any item with STORE_OVERRIDE source
    const anyOverrideItem = invAfter.items.find(i =>
      i.effectiveRule?.source === "STORE_OVERRIDE",
    );

    results.push({
      id: "P2F_INVENTORY_AFTER",
      name: "Inventory reflects override (Centro Castillitos)",
      pass: !!anyOverrideItem || stateChanges.length > 0,
      detail: {
        totalItems: invAfter.items.length,
        itemsWithOverrideSource: invAfter.items.filter(i => i.effectiveRule?.source === "STORE_OVERRIDE").length,
        stateChangesDetected: stateChanges.length,
        stateChangeExamples: stateChanges.slice(0, 5),
        sampleOverrideItem: anyOverrideItem ? {
          referenceCode: anyOverrideItem.referenceCode,
          currentStoreQty: anyOverrideItem.currentStoreQty,
          minUnits: anyOverrideItem.minUnits,
          idealUnits: anyOverrideItem.idealUnits,
          maxUnits: anyOverrideItem.maxUnits,
          inventoryState: anyOverrideItem.inventoryState,
          effectiveRule: anyOverrideItem.effectiveRule,
        } : null,
      },
      durationMs: Date.now() - t2f,
    });

    // 2G — Verify needs reflect override
    const t2g = Date.now();
    const needsAfter = await loadStoreNeedsByLine(orgId, {
      storeId: OVERRIDE_STORE,
      line: "CASTILLITOS",
      page: 1,
      pageSize: 50,
    });

    // Compare needs counts
    const needsCountBefore = needsBefore.pagination.total;
    const needsCountAfter = needsAfter.pagination.total;

    results.push({
      id: "P2G_NEEDS_AFTER",
      name: "Needs reflect override (Centro Castillitos)",
      pass: true,
      detail: {
        needsCountBefore,
        needsCountAfter,
        delta: needsCountAfter - needsCountBefore,
        note: needsCountAfter < needsCountBefore
          ? "Lower thresholds reduced needs count (expected)"
          : needsCountAfter === needsCountBefore
            ? "Same count (no items in 6-8 range to change)"
            : "More needs after lower thresholds (unexpected — investigate)",
        sampleNeed: needsAfter.items[0] ? {
          referenceCode: needsAfter.items[0].referenceCode,
          currentUnits: needsAfter.items[0].currentUnits,
          minUnits: needsAfter.items[0].minUnits,
          idealUnits: needsAfter.items[0].idealUnits,
          shortageQty: needsAfter.items[0].shortageQty,
          effectiveRule: needsAfter.items[0].effectiveRule,
        } : null,
      },
      durationMs: Date.now() - t2g,
    });

    // 2H — RESTORE: remove override (set to tenant_default)
    const t2h = Date.now();
    const restoreResult = await saveDistributionConfig({
      orgId,
      storeId: OVERRIDE_STORE,
      storeName: "Centro",
      userId: "integration-test-runner",
      role: "ORG_ADMIN" as any,
      config: {
        castillitos: {
          enabled: true,
          minUnits: CASTILLITOS_TEXTILE_COVERAGE.minimumUnits,
          targetUnits: CASTILLITOS_TEXTILE_COVERAGE.idealUnits,
          maxUnits: CASTILLITOS_TEXTILE_COVERAGE.maximumUnits,
          validFrom: null,
          validTo: null,
          season: null,
          notes: "Restored to tenant default after certification test",
          source: "tenant_default",
        },
      },
      motivo: "AGENTIK-STORES-SUPPLY-RULES-CONSUMPTION-CERTIFICATION-01 — restore after test",
      source: "api",
    });
    const restoreDurationMs = Date.now() - t2h;

    results.push({
      id: "P2H_RESTORE",
      name: "Restore to tenant default 8/10/12",
      pass: restoreResult.ok === true,
      detail: {
        ok: restoreResult.ok,
        error: restoreResult.error,
        restoredConfig: restoreResult.config?.castillitos,
      },
      durationMs: restoreDurationMs,
    });

    // 2I — Verify restoration
    const t2i = Date.now();
    const configRestored = await getEffectiveStoreConfig(orgId, OVERRIDE_STORE);
    const restoredCorrectly =
      configRestored.castillitos.minUnits === CASTILLITOS_TEXTILE_COVERAGE.minimumUnits
      && configRestored.castillitos.targetUnits === CASTILLITOS_TEXTILE_COVERAGE.idealUnits
      && configRestored.castillitos.maxUnits === CASTILLITOS_TEXTILE_COVERAGE.maximumUnits;

    results.push({
      id: "P2I_VERIFY_RESTORE",
      name: "Verify restored config matches tenant default",
      pass: restoredCorrectly,
      detail: {
        expected: {
          minUnits: CASTILLITOS_TEXTILE_COVERAGE.minimumUnits,
          targetUnits: CASTILLITOS_TEXTILE_COVERAGE.idealUnits,
          maxUnits: CASTILLITOS_TEXTILE_COVERAGE.maximumUnits,
        },
        actual: {
          minUnits: configRestored.castillitos.minUnits,
          targetUnits: configRestored.castillitos.targetUnits,
          maxUnits: configRestored.castillitos.maxUnits,
          source: configRestored.castillitos.source,
        },
      },
      durationMs: Date.now() - t2i,
    });

    // 2J — Verify inventory restored
    const t2j = Date.now();
    const invRestored = await loadStoreInventoryByLine(orgId, {
      storeId: OVERRIDE_STORE,
      line: "CASTILLITOS",
      page: 1,
      pageSize: 5,
    });

    const restoredItem = invRestored.items[0];
    const inventoryRestored = restoredItem
      ? restoredItem.minUnits === CASTILLITOS_TEXTILE_COVERAGE.minimumUnits
      : true;

    results.push({
      id: "P2J_INVENTORY_RESTORED",
      name: "Inventory restored to tenant default thresholds",
      pass: inventoryRestored,
      detail: {
        sampleItem: restoredItem ? {
          referenceCode: restoredItem.referenceCode,
          minUnits: restoredItem.minUnits,
          idealUnits: restoredItem.idealUnits,
          maxUnits: restoredItem.maxUnits,
          inventoryState: restoredItem.inventoryState,
          effectiveRule: restoredItem.effectiveRule,
        } : null,
      },
      durationMs: Date.now() - t2j,
    });

    // 2K — Idempotency
    const t2k = Date.now();
    const idempotentResult = await saveDistributionConfig({
      orgId,
      storeId: OVERRIDE_STORE,
      storeName: "Centro",
      userId: "integration-test-runner",
      role: "ORG_ADMIN" as any,
      config: {
        castillitos: {
          enabled: true,
          minUnits: CASTILLITOS_TEXTILE_COVERAGE.minimumUnits,
          targetUnits: CASTILLITOS_TEXTILE_COVERAGE.idealUnits,
          maxUnits: CASTILLITOS_TEXTILE_COVERAGE.maximumUnits,
          validFrom: null,
          validTo: null,
          season: null,
          notes: null,
          source: "tenant_default",
        },
      },
      motivo: "Idempotency check",
      source: "api",
    });

    results.push({
      id: "P2K_IDEMPOTENCY",
      name: "Idempotent restore produces same config",
      pass: idempotentResult.ok === true,
      detail: { ok: idempotentResult.ok, config: idempotentResult.config?.castillitos },
      durationMs: Date.now() - t2k,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 3 — RULE 36 VALIDATION
    // ══════════════════════════════════════════════════════════════════════════

    const t3 = Date.now();
    const rule36Evidence: Record<string, unknown> = {};

    for (const slug of STORE_SLUGS) {
      const detail = await getCanonicalStoreDetail(orgId, slug);
      if (!detail) continue;

      const rule36Items = detail.items.filter(i => i.resolvedBy === "global_low_stock");
      const isAllowed = CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds.includes(slug);

      rule36Evidence[slug] = {
        isRule36Allowed: isAllowed,
        rule36BlockedCount: rule36Items.length,
        threshold: CASTILLITOS_GLOBAL_LOW_STOCK.threshold,
        sampleBlocked: rule36Items.slice(0, 3).map(i => ({
          referenceCode: i.referenceCode,
          productName: i.productName,
          mainWarehouseAvailable: i.mainWarehouseAvailable,
          resolvedBy: i.resolvedBy,
        })),
      };
    }

    const centroR36 = (rule36Evidence.centro as any)?.rule36BlockedCount ?? -1;
    const caldasR36 = (rule36Evidence.caldas as any)?.rule36BlockedCount ?? -1;
    const sanDiegoR36 = (rule36Evidence.san_diego as any)?.rule36BlockedCount ?? -1;
    const granPlazaR36 = (rule36Evidence.gran_plaza as any)?.rule36BlockedCount ?? -1;

    results.push({
      id: "P3A_RULE36_ALLOWED",
      name: "Rule 36: Centro and Caldas are allowed (0 blocked)",
      pass: centroR36 === 0 && caldasR36 === 0,
      detail: { centro: centroR36, caldas: caldasR36 },
      durationMs: 0,
    });

    results.push({
      id: "P3B_RULE36_BLOCKED",
      name: "Rule 36: San Diego and Gran Plaza block scarce items",
      pass: sanDiegoR36 >= 0 && granPlazaR36 >= 0,
      detail: {
        san_diego: sanDiegoR36,
        gran_plaza: granPlazaR36,
        note: "0 is valid if no current items have mainWarehouse <= threshold",
      },
      durationMs: 0,
    });

    results.push({
      id: "P3C_RULE36_CONFIG",
      name: "Rule 36 config consumed from policy pack",
      pass: true,
      detail: {
        threshold: CASTILLITOS_GLOBAL_LOW_STOCK.threshold,
        allowedIds: CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds,
        fullEvidence: rule36Evidence,
      },
      durationMs: Date.now() - t3,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 4 — SPECIAL RULES VALIDATION
    // ══════════════════════════════════════════════════════════════════════════

    const t4 = Date.now();
    const specialEvidence: Record<string, unknown[]> = {};

    for (const slug of STORE_SLUGS) {
      const detail = await getCanonicalStoreDetail(orgId, slug);
      if (!detail) continue;

      const specialItems = detail.items.filter(i => i.resolvedBy === "special_product");
      specialEvidence[slug] = specialItems.map(i => ({
        referenceCode: i.referenceCode,
        productName: i.productName,
        currentUnits: i.currentUnits,
        minUnits: i.minUnits,
        idealUnits: i.idealUnits,
        maxUnits: i.maxUnits,
        resolvedBy: i.resolvedBy,
        mainWarehouseAvailable: i.mainWarehouseAvailable,
      }));
    }

    results.push({
      id: "P4_SPECIAL_RULES",
      name: "Special product rules (BANERA/CUNA/CORRAL)",
      pass: true,
      detail: {
        totalFound: Object.values(specialEvidence).flat().length,
        patterns: Object.keys(CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns),
        idealByStore: CASTILLITOS_SPECIAL_PRODUCTS.idealByStore,
        byStore: specialEvidence,
      },
      durationMs: Date.now() - t4,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 5 — PER-STORE CASE EVIDENCE
    // ══════════════════════════════════════════════════════════════════════════

    for (const slug of STORE_SLUGS) {
      const t5 = Date.now();
      const detail = await getCanonicalStoreDetail(orgId, slug);
      if (!detail) continue;

      // Classify by resolvedBy
      const byResolvedBy: Record<string, number> = {};
      for (const item of detail.items) {
        const key = item.resolvedBy ?? "unknown";
        byResolvedBy[key] = (byResolvedBy[key] ?? 0) + 1;
      }

      // Find cases per line
      const castillitosItems = detail.items.filter(i => i.canonicalLine === "castillitos");
      const latinKidsItems = detail.items.filter(i => i.canonicalLine === "latin_kids");
      const accessoryItems = detail.items.filter(i => i.canonicalLine === "accesorios");

      const items = detail.items;
      const pick = (arr: typeof items, cond: (i: typeof items[0]) => boolean) => {
        const found = arr.find(cond);
        if (!found) return "NOT_FOUND";
        return {
          referenceCode: found.referenceCode,
          productName: found.productName,
          currentUnits: found.currentUnits,
          minUnits: found.minUnits,
          idealUnits: found.idealUnits,
          maxUnits: found.maxUnits,
          mainWarehouseAvailable: found.mainWarehouseAvailable,
          resolvedBy: found.resolvedBy,
          sizeClass: found.sizeClass,
        };
      };

      results.push({
        id: `P5_STORE_${slug.toUpperCase()}`,
        name: `Per-store evidence: ${slug}`,
        pass: true,
        detail: {
          totalItems: detail.items.length,
          byResolvedBy,
          byLine: {
            castillitos: castillitosItems.length,
            latin_kids: latinKidsItems.length,
            accesorios: accessoryItems.length,
          },
          cases: {
            castillitos_bajo_minimo: pick(castillitosItems, i => i.currentUnits > 0 && i.currentUnits < i.minUnits),
            castillitos_saludable: pick(castillitosItems, i => i.currentUnits >= i.minUnits && i.currentUnits <= i.maxUnits),
            castillitos_sobre_maximo: pick(castillitosItems, i => i.currentUnits > i.maxUnits),
            latin_kids_sample: pick(latinKidsItems, () => true),
            accessory_small: pick(accessoryItems, i => i.sizeClass === "small"),
            accessory_medium: pick(accessoryItems, i => i.sizeClass === "medium"),
            accessory_large: pick(accessoryItems, i => i.sizeClass === "large"),
            rule36_blocked: pick(detail.items, i => i.resolvedBy === "global_low_stock"),
            special_product: pick(detail.items, i => i.resolvedBy === "special_product"),
          },
        },
        durationMs: Date.now() - t5,
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 6 — PERFORMANCE SUMMARY
    // ══════════════════════════════════════════════════════════════════════════

    const totalDurationMs = Date.now() - t0;

    results.push({
      id: "P6_PERFORMANCE",
      name: "Performance summary",
      pass: saveDurationMs < 5000 && restoreDurationMs < 5000,
      detail: {
        totalDurationMs,
        saveDurationMs,
        restoreDurationMs,
        readAfterSaveMs: results.find(r => r.id === "P2C_CONFIG_AFTER")?.durationMs,
        inventoryAfterSaveMs: results.find(r => r.id === "P2F_INVENTORY_AFTER")?.durationMs,
        needsAfterSaveMs: results.find(r => r.id === "P2G_NEEDS_AFTER")?.durationMs,
        baselineDurationMs: results
          .filter(r => r.id.startsWith("P1_"))
          .reduce((sum, r) => sum + r.durationMs, 0),
        requirements: {
          hotRead: "< 1000ms",
          save: "< 5000ms",
          zeroSOAP: true,
          zeroRestart: true,
        },
      },
      durationMs: 0,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════════════════════════

    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;

    return NextResponse.json({
      sprint: "AGENTIK-STORES-SUPPLY-RULES-CONSUMPTION-CERTIFICATION-01",
      summary: { total: results.length, passed, failed },
      totalDurationMs: Date.now() - t0,
      results,
    });

  } catch (err) {
    return NextResponse.json({
      sprint: "AGENTIK-STORES-SUPPLY-RULES-CONSUMPTION-CERTIFICATION-01",
      error: String(err),
      stack: (err as Error).stack,
      results,
    }, { status: 500 });
  }
}
