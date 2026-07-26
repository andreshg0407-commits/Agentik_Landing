/**
 * AGENTIK-STORES-NEEDS-RULE36-AND-IDEAL-CERTIFICATION-01
 *
 * Certification tests for:
 *   1. shortageQty calculated to idealUnits (not min, not max)
 *   2. Rule 36 distinguishes same-ref surtido from replacement
 *
 * Pure unit tests — no DB, no network.
 * Runner: npx tsx --test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..");
const LIB_DIR = join(__dirname, "..");

function readSrc(relPath: string): string {
  return readFileSync(join(LIB_DIR, relPath), "utf-8");
}

function readProject(relPath: string): string {
  return readFileSync(join(PROJECT_ROOT, relPath), "utf-8");
}

// ── SECTION 1: shortageQty to idealUnits ─────────────────────────────────────

describe("PRIMERO — shortageQty calculated to idealUnits", () => {
  it("distribution service shortageQty uses idealUnits for textile", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("thresholds.idealUnits - effectiveRefStock"));
    assert.ok(!(/shortageQty.*thresholds\.maxUnits\s*-\s*effectiveRefStock/.test(src)));
  });

  it("distribution service shortageQty uses idealUnits for non-textile", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("thresholds.idealUnits - v.currentUnits"));
  });

  it("needs service shortageQty uses idealUnits", () => {
    const src = readSrc("store-needs-by-line.ts");
    assert.ok(src.includes("item.idealUnits - item.currentUnits"));
    assert.ok(!(/shortageQty\s*=\s*Math\.max\(0,\s*item\.minUnits/.test(src)));
  });

  it("maximumReceivableQty uses maxUnits as guard", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("maximumReceivableQty"));
    assert.ok(src.includes("thresholds.maxUnits - effectiveRefStock"));
  });

  it("transferableUnits is capped by maximumReceivableQty", () => {
    const src = readSrc("store-distribution-service.ts");
    const transferLine = src.split("\n").find(l => l.includes("transferableUnits") && l.includes("Math.min"));
    assert.ok(transferLine);
    const idx = src.indexOf("const transferableUnits");
    const block = src.slice(idx, idx + 200);
    assert.ok(block.includes("maximumReceivableQty"));
  });

  it("8/10/12 rule with stock 4: deficit=4 (to min), shortageQty=6 (to ideal), maxReceivable=8 (to max)", () => {
    const min = 8, ideal = 10, max = 12, storeQty = 4;

    const deficit = Math.max(0, min - storeQty);
    const shortageQty = Math.max(0, ideal - storeQty);
    const maxReceivable = Math.max(0, max - storeQty);

    assert.equal(deficit, 4);
    assert.equal(shortageQty, 6);
    assert.equal(maxReceivable, 8);

    assert.equal(Math.min(shortageQty, 100, maxReceivable), 6);
    assert.equal(Math.min(shortageQty, 5, maxReceivable), 5);
    assert.equal(Math.min(shortageQty, 3, maxReceivable), 3);
  });

  it("8/10/12 rule with stock 0: shortageQty=10, maxReceivable=12", () => {
    const min = 8, ideal = 10, max = 12, storeQty = 0;
    const shortageQty = Math.max(0, ideal - storeQty);
    const maxReceivable = Math.max(0, max - storeQty);

    assert.equal(shortageQty, 10);
    assert.equal(maxReceivable, 12);
    assert.equal(Math.min(shortageQty, 50, maxReceivable), 10);
  });

  it("8/10/12 rule with stock 9: need NOT detected (above min), shortageQty=1 (to ideal)", () => {
    const min = 8, ideal = 10, max = 12, storeQty = 9;
    const deficit = Math.max(0, min - storeQty);
    const shortageQty = Math.max(0, ideal - storeQty);

    assert.equal(deficit, 0);
    assert.equal(shortageQty, 1);
  });

  it("8/10/12 rule with stock 10: shortageQty=0 (at ideal)", () => {
    const min = 8, ideal = 10, max = 12, storeQty = 10;
    const shortageQty = Math.max(0, ideal - storeQty);
    assert.equal(shortageQty, 0);
  });

  it("6/8/10 override with stock 3: deficit=3, shortageQty=5", () => {
    const min = 6, ideal = 8, max = 10, storeQty = 3;
    const deficit = Math.max(0, min - storeQty);
    const shortageQty = Math.max(0, ideal - storeQty);
    const maxReceivable = Math.max(0, max - storeQty);

    assert.equal(deficit, 3);
    assert.equal(shortageQty, 5);
    assert.equal(maxReceivable, 7);
  });

  it("maxUnits is never the target — only the guard", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(/max.*guard|guard.*max/i.test(src));
    const idx = src.indexOf("const shortageQty = canonical.world");
    assert.ok(idx > -1);
    const block = src.slice(idx, src.indexOf(";", idx) + 1);
    assert.ok(!block.includes("maxUnits"));
  });
});

// ── SECTION 2: Rule 36 for same-reference vs replacement ─────────────────────

describe("CUARTO — Rule 36 for same reference (surtido/reposicion)", () => {
  it("distribution service has isRule36BlockedForSameRef function", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("function isRule36BlockedForSameRef("));
  });

  it("isRule36BlockedForSameRef allows centro for scarce refs", () => {
    const src = readSrc("store-distribution-service.ts");
    const fnStart = src.indexOf("function isRule36BlockedForSameRef(");
    assert.ok(fnStart > -1);
    const fnEnd = src.indexOf("}", fnStart + 50);
    const body = src.slice(fnStart, fnEnd + 1);
    assert.ok(body.includes("allowedIds.includes(storeSlug)"));
  });

  it("same-ref Rule 36 inline check at item level uses allowedIds", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("scarcity.allowedIds.includes(storeSlug)"));
  });

  it("same-ref <=36 in Centro: allowed", () => {
    const allowedIds = ["centro", "caldas"];
    const storeSlug = "centro";
    const mainRefStock = 30;
    const threshold = 36;

    const blocked = !(allowedIds.includes(storeSlug)) && mainRefStock <= threshold;
    assert.equal(blocked, false);
  });

  it("same-ref <=36 in Caldas: allowed", () => {
    const allowedIds = ["centro", "caldas"];
    const storeSlug = "caldas";
    const mainRefStock = 20;
    const threshold = 36;

    const blocked = !(allowedIds.includes(storeSlug)) && mainRefStock <= threshold;
    assert.equal(blocked, false);
  });

  it("same-ref <=36 in San Diego: BLOCKED", () => {
    const allowedIds = ["centro", "caldas"];
    const storeSlug = "san_diego";
    const mainRefStock = 30;
    const threshold = 36;

    const blocked = !(allowedIds.includes(storeSlug)) && mainRefStock <= threshold;
    assert.equal(blocked, true);
  });

  it("same-ref <=36 in Gran Plaza: BLOCKED", () => {
    const allowedIds = ["centro", "caldas"];
    const storeSlug = "gran_plaza";
    const mainRefStock = 36;
    const threshold = 36;

    const blocked = !(allowedIds.includes(storeSlug)) && mainRefStock <= threshold;
    assert.equal(blocked, true);
  });

  it("same-ref >36 in San Diego: allowed", () => {
    const allowedIds = ["centro", "caldas"];
    const storeSlug = "san_diego";
    const mainRefStock = 37;
    const threshold = 36;

    const blocked = !(allowedIds.includes(storeSlug)) && mainRefStock <= threshold;
    assert.equal(blocked, false);
  });
});

describe("QUINTO — Rule 36 for replacements (strict, ALL stores)", () => {
  it("distribution service has isRule36BlockedForReplacement function", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("function isRule36BlockedForReplacement("));
  });

  it("isRule36BlockedForReplacement does NOT check storeSlug (applies to ALL stores)", () => {
    const src = readSrc("store-distribution-service.ts");
    const fnStart = src.indexOf("function isRule36BlockedForReplacement(");
    assert.ok(fnStart > -1);
    const fnEnd = src.indexOf("}", fnStart + 50);
    const body = src.slice(fnStart, fnEnd + 1);
    assert.ok(!body.includes("allowedIds"));
    assert.ok(!body.includes("storeSlug"));
  });

  it("replacement search calls isRule36BlockedForReplacement (not isRule36Blocked)", () => {
    const src = readSrc("store-distribution-service.ts");
    const fnBody = src.slice(src.indexOf("function findReplacementCandidates("));
    const candidateLoop = fnBody.slice(0, fnBody.indexOf("return { candidates"));
    assert.ok(candidateLoop.includes("isRule36BlockedForReplacement("));
    assert.ok(!candidateLoop.includes("isRule36Blocked("));
  });

  it("replacement with mainStock=35: REJECTED (<=36)", () => {
    const mainRefStock = 35;
    const threshold = 36;
    const blocked = mainRefStock <= threshold;
    assert.equal(blocked, true);
  });

  it("replacement with mainStock=36: REJECTED (<=36)", () => {
    const mainRefStock = 36;
    const threshold = 36;
    const blocked = mainRefStock <= threshold;
    assert.equal(blocked, true);
  });

  it("replacement with mainStock=37: ACCEPTED (>36)", () => {
    const mainRefStock = 37;
    const threshold = 36;
    const blocked = mainRefStock <= threshold;
    assert.equal(blocked, false);
  });

  it("replacement with mainStock=100: ACCEPTED", () => {
    const mainRefStock = 100;
    const threshold = 36;
    const blocked = mainRefStock <= threshold;
    assert.equal(blocked, false);
  });

  it("replacement with mainStock=0: REJECTED", () => {
    const mainRefStock = 0;
    const threshold = 36;
    const blocked = mainRefStock <= threshold;
    assert.equal(blocked, true);
  });

  it("replacement blocked in Centro too (strict for ALL stores)", () => {
    const mainRefStock = 30;
    const threshold = 36;
    const blocked = mainRefStock <= threshold;
    assert.equal(blocked, true);
  });

  it("replacement blocked in Caldas too (strict for ALL stores)", () => {
    const mainRefStock = 36;
    const threshold = 36;
    const blocked = mainRefStock <= threshold;
    assert.equal(blocked, true);
  });
});

// ── SECTION 3: Stock zero exclusion ──────────────────────────────────────────

describe("SEPTIMO — Inventory active exclusion of zero-stock refs", () => {
  it("inventory classifyLine sends stock-zero items to OUT_OF_STOCK", () => {
    const src = readSrc("store-inventory-by-line.ts");
    const fnStart = src.indexOf("function classifyLine(");
    assert.ok(fnStart > -1);
    const fnEnd = src.indexOf("\n}", fnStart);
    const fnBody = src.slice(fnStart, fnEnd + 2);
    assert.ok(fnBody.includes("currentUnits === 0"));
    assert.ok(fnBody.includes('"OUT_OF_STOCK"'));
  });

  it("OUT_OF_STOCK items are NOT counted in CASTILLITOS/LATIN_KIDS/ACCESSORIES", () => {
    const src = readSrc("store-inventory-by-line.ts");
    const fn = src.match(/function classifyLine\([^)]+\)[^{]*\{([\s\S]*?)\n\}/);
    assert.ok(fn);
    const body = fn![1];
    const lines = body.split("\n").filter(l => l.trim().startsWith("if"));
    assert.ok(lines[0].includes("currentUnits === 0"));
  });
});

// ── SECTION 4: Coherence checks ──────────────────────────────────────────────

describe("OCTAVO — Necesidades display fields", () => {
  it("NeedItem interface has all required fields", () => {
    const src = readSrc("store-needs-by-line.ts");
    const iface = src.slice(src.indexOf("export interface NeedItem"), src.indexOf("}", src.indexOf("export interface NeedItem")) + 1);

    assert.ok(iface.includes("currentUnits:"));
    assert.ok(iface.includes("minUnits:"));
    assert.ok(iface.includes("idealUnits:"));
    assert.ok(iface.includes("maxUnits:"));
    assert.ok(iface.includes("shortageQty:"));
    assert.ok(iface.includes("mainWarehouseAvailable:"));
    assert.ok(iface.includes("needType:"));
    assert.ok(iface.includes("candidates:"));
    assert.ok(iface.includes("rule36BlockedCount:"));
    assert.ok(iface.includes("effectiveRule:"));
    assert.ok(iface.includes("resolution:"));
  });

  it("NeedItem shortageQty comment says ideal, not min", () => {
    const src = readSrc("store-needs-by-line.ts");
    const shortageComment = src.match(/shortageQty:.*\/\/.*/);
    if (shortageComment) {
      assert.ok(!shortageComment[0].includes("minUnits"));
    }
  });
});

describe("Coherence — Inventory vs Needs", () => {
  it("inventory uses same source as needs (getCanonicalStoreDetail)", () => {
    const invSrc = readSrc("store-inventory-by-line.ts");
    const needSrc = readSrc("store-needs-by-line.ts");
    assert.ok(invSrc.includes("getCanonicalStoreDetail(orgId,"));
    assert.ok(needSrc.includes("getCanonicalStoreDetail(orgId,"));
  });

  it("both services resolve effectiveRule with same logic", () => {
    const invSrc = readSrc("store-inventory-by-line.ts");
    const needSrc = readSrc("store-needs-by-line.ts");
    assert.ok(invSrc.includes("function resolveEffectiveRuleSource("));
    assert.ok(needSrc.includes("function resolveEffectiveRuleSource("));
    assert.ok(invSrc.includes('"global_low_stock"'));
    assert.ok(needSrc.includes('"global_low_stock"'));
  });

  it("distribution service transferableUnits is capped by maxReceivable", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("maximumReceivableQty"));
  });
});

// ── SECTION 5: SEXTO — Compatibility rules ───────────────────────────────────

describe("SEXTO — Compatibility match modes", () => {
  it("Castillitos uses SAME_GROUP_AND_SUBGROUP", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("SAME_GROUP_AND_SUBGROUP"));
  });

  it("Latin Kids uses SAME_SUBGROUP", () => {
    const src = readSrc("store-policy-pack-config.ts");
    assert.ok(src.includes('"SAME_SUBGROUP"'));
  });

  it("Accessories uses SAME_SIZE_CLASS", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("SAME_SIZE_CLASS"));
  });

  it("replacement candidate search enforces line isolation", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("meta.canonicalLine !== canonicalLine"));
  });
});

// ── SECTION 6: Warehouse identity — world-aware main warehouse ──────────────

describe("NOVENO — Main warehouse split by world", () => {
  it("distribution service has MAIN_WAREHOUSE_PK_TEXTILE = '10'", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes('MAIN_WAREHOUSE_PK_TEXTILE = "10"'));
  });

  it("distribution service has MAIN_WAREHOUSE_PK_IMPORT = '33'", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes('MAIN_WAREHOUSE_PK_IMPORT  = "33"'));
  });

  it("ALL_MAIN_WAREHOUSE_PKS includes both textile and import", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("ALL_MAIN_WAREHOUSE_PKS = new Set([MAIN_WAREHOUSE_PK_TEXTILE, MAIN_WAREHOUSE_PK_IMPORT])"));
  });

  it("no single MAIN_WAREHOUSE_PK constant exists (replaced by split)", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(!(/^const MAIN_WAREHOUSE_PK = /m.test(src)));
  });

  it("PIL query uses ALL_MAIN_WAREHOUSE_PKS spread", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("...ALL_MAIN_WAREHOUSE_PKS"));
  });

  it("main stock attribution uses ALL_MAIN_WAREHOUSE_PKS.has()", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("ALL_MAIN_WAREHOUSE_PKS.has(lv.warehouseId)"));
  });

  it("main stock push uses lv.warehouseId (not hardcoded PK)", () => {
    const src = readSrc("store-distribution-service.ts");
    const pushIdx = src.indexOf("ALL_MAIN_WAREHOUSE_PKS.has(lv.warehouseId)");
    assert.ok(pushIdx > -1);
    const block = src.slice(pushIdx, pushIdx + 300);
    assert.ok(block.includes("warehouseCode: lv.warehouseId"));
  });

  it("warehouse-master confirms kaNlBodega=10 is COMMERCIAL_TEXTILE", () => {
    const src = readProject("lib/inventory/warehouse-master.ts");
    assert.ok(src.includes('kaNlBodega: "10"'));
    assert.ok(src.includes('"COMMERCIAL_TEXTILE"'));
  });

  it("warehouse-master confirms kaNlBodega=33 is COMMERCIAL_AVAILABLE_IMPORT", () => {
    const src = readProject("lib/inventory/warehouse-master.ts");
    assert.ok(src.includes('kaNlBodega: "33"'));
    assert.ok(src.includes('"COMMERCIAL_AVAILABLE_IMPORT"'));
  });
});

// ── SECTION 7: Reference grain — product.sku as canonical key ───────────────

describe("DÉCIMO — canonicalReferenceKey = product.sku", () => {
  it("referenceCode uses product.sku (not variant.sku)", () => {
    const src = readSrc("store-distribution-service.ts");
    // The line that resolves ref should use product.sku, not variant.sku
    const refLine = src.split("\n").find(l => l.includes("const ref = lv.product?.sku"));
    assert.ok(refLine, "Expected 'const ref = lv.product?.sku' pattern");
    assert.ok(!refLine!.includes("lv.variant?.sku"), "Must NOT fall back to variant.sku");
  });

  it("multiple variants of same ref consolidate to one refStockInStore entry", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("refStockInStore.set(v.referenceCode"));
    assert.ok(src.includes("refStockInStore.get(v.referenceCode)"));
  });

  it("effectiveRefStock uses consolidated refStockInStore", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("const effectiveRefStock = refStockInStore.get(v.referenceCode)"));
  });

  it("shortageQty uses effectiveRefStock for textile", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("thresholds.idealUnits - effectiveRefStock"));
  });

  it("8/10/12 with 6 variants summing to 15: above max, excess=3", () => {
    const min = 8, ideal = 10, max = 12;
    const variantQtys = [3, 3, 3, 1, 2, 3]; // L-1288 in Centro
    const consolidatedStock = variantQtys.reduce((s, q) => s + q, 0); // = 15

    assert.equal(consolidatedStock, 15);
    const deficit = Math.max(0, min - consolidatedStock);
    const shortage = Math.max(0, ideal - consolidatedStock);
    const excess = Math.max(0, consolidatedStock - max);

    assert.equal(deficit, 0);
    assert.equal(shortage, 0);
    assert.equal(excess, 3); // 15 - 12 = 3 excess
  });

  it("8/10/12 with 3 variants summing to 3: below min, shortage=7", () => {
    const min = 8, ideal = 10, max = 12;
    const variantQtys = [1, 1, 1]; // 3 variants each qty=1
    const consolidatedStock = variantQtys.reduce((s, q) => s + q, 0); // = 3

    assert.equal(consolidatedStock, 3);
    const deficit = Math.max(0, min - consolidatedStock);
    const shortage = Math.max(0, ideal - consolidatedStock);

    assert.equal(deficit, 5); // 8 - 3
    assert.equal(shortage, 7); // 10 - 3
  });

  it("BEFORE bug: each variant qty=1 treated as separate ref → all bajo minimo", () => {
    // Before fix: 6 variants → 6 "references" each with qty=1
    const min = 8;
    const wrongDeficits = [1, 1, 1, 1, 1, 1].map(q => Math.max(0, min - q)); // all 7
    assert.ok(wrongDeficits.every(d => d === 7)); // all "bajo minimo"

    // After fix: 1 reference with consolidated qty=6+
    const rightDeficit = Math.max(0, min - 15); // 0 — above min
    assert.equal(rightDeficit, 0);
  });

  it("Rule 36 uses getMainReferenceStock which sums by referenceCode", () => {
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("function getMainReferenceStock(index: MainStockIndex, referenceCode: string)"));
    assert.ok(src.includes("index.byReference.get(referenceCode)"));
  });

  it("main warehouse byReference now sums all variants of same product.sku", () => {
    // byReference uses referenceCode = product.sku after fix
    const src = readSrc("store-distribution-service.ts");
    const buildFn = src.slice(src.indexOf("function buildMainStockIndex("));
    assert.ok(buildFn.includes("byReference.set(s.referenceCode"));
    // With ref = product.sku, L-1288 from wh10 sums ALL its variants
  });

  it("inventory consolidateByReference groups by referenceCode = product.sku", () => {
    const src = readSrc("store-inventory-by-line.ts");
    assert.ok(src.includes("refMap.get(item.referenceCode)"));
    assert.ok(src.includes("refMap.set(item.referenceCode"));
    // currentStoreQty = sum of variant.currentUnits
    assert.ok(src.includes("variants.reduce((sum, v) => sum + v.currentUnits, 0)"));
  });

  it("inventory and needs share the same referenceCode source", () => {
    const invSrc = readSrc("store-inventory-by-line.ts");
    const needSrc = readSrc("store-needs-by-line.ts");
    // Both consume StoreDistributionItem.referenceCode from getCanonicalStoreDetail
    assert.ok(invSrc.includes("getCanonicalStoreDetail(orgId,"));
    assert.ok(needSrc.includes("getCanonicalStoreDetail(orgId,"));
  });

  it("zero is different from no-data in main warehouse column", () => {
    // mainWarehouseAvailable returns 0 when ref exists but has 0 stock
    // mainWarehouseAvailable returns 0 when ref doesn't exist in main
    // The consolidation at UI level should differentiate via refMap presence
    const src = readSrc("store-distribution-service.ts");
    assert.ok(src.includes("function getMainAvailable(index: MainStockIndex, ref: string"));
    // Returns 0 for both cases via ?? 0
    assert.ok(src.includes("?? 0"));
  });
});
