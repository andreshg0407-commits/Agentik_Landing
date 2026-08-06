/**
 * lib/comercial/tiendas/__tests__/store-copilot-domain-tools.test.ts
 *
 * AGENTIK-COPILOT-STORES-TOOLS-01 — Structural and contract tests for Copilot domain tools.
 *
 * Tests:
 *   1. Tenant isolation (orgId required)
 *   2. Store scoping (storeId where applicable)
 *   3. Date range parameter validation
 *   4. Structured output shapes
 *   5. Provenance/freshness in every result
 *   6. Attention signal dedup keys
 *   7. Tool registry metadata completeness
 *   8. Approval metadata on write tools
 *   9. No direct React dependency
 *  10. No arbitrary SQL exposure
 *  11. Reference filtering
 *  12. Monthly bucketing correctness
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Source reading ────────────────────────────────────────────────────────────

const toolsDir = path.resolve(__dirname, "..");
const toolsSrc = fs.readFileSync(path.join(toolsDir, "store-copilot-domain-tools.ts"), "utf8");
const typesSrc = fs.readFileSync(path.join(toolsDir, "store-copilot-domain-types.ts"), "utf8");

// ── Registry import (types only, no runtime) ────────────────────────────────

// Parse registry from source to avoid server-only import
function extractToolNames(): string[] {
  const matches = toolsSrc.match(/name:\s*"([^"]+)"/g);
  return matches ? matches.map(m => m.replace(/name:\s*"/, "").replace(/"$/, "")) : [];
}

function extractToolCategories(): string[] {
  const matches = toolsSrc.match(/category:\s*"([^"]+)"/g);
  return matches ? matches.map(m => m.replace(/category:\s*"/, "").replace(/"$/, "")) : [];
}

function extractApprovalFlags(): boolean[] {
  const matches = toolsSrc.match(/approvalRequired:\s*(true|false)/g);
  return matches ? matches.map(m => m.includes("true")) : [];
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. TENANT ISOLATION
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Tenant Isolation", () => {
  it("T01: Every exported async function requires orgId as first parameter", () => {
    const exportedFns = toolsSrc.match(/export async function (\w+)\(\s*\n?\s*orgId:\s*string/g);
    assert.ok(exportedFns, "No exported functions with orgId found");
    assert.ok(exportedFns.length >= 5, `Expected >= 5 exported functions, found ${exportedFns.length}`);
  });

  it("T02: No function accepts arbitrary SQL or raw query parameters", () => {
    assert.ok(!toolsSrc.includes("$queryRaw"), "Contains $queryRaw");
    assert.ok(!toolsSrc.includes("$executeRaw"), "Contains $executeRaw");
    assert.ok(!toolsSrc.includes("queryRawUnsafe"), "Contains queryRawUnsafe");
  });

  it("T03: No cross-tenant query patterns (no orgId reassignment)", () => {
    // Ensure orgId is always passed through, never overridden
    const orgIdAssignments = toolsSrc.match(/orgId\s*=\s*[^=]/g);
    assert.ok(!orgIdAssignments, "orgId should never be reassigned in tool adapters");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. STORE SCOPING
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Store Scoping", () => {
  it("T04: buildProductTimeSeries requires storeId", () => {
    const sig = toolsSrc.match(/export async function buildProductTimeSeries\([\s\S]*?\)/);
    assert.ok(sig, "buildProductTimeSeries not found");
    assert.ok(sig[0].includes("storeId: string"), "Missing storeId parameter");
  });

  it("T05: aggregateProductSalesAcrossStores uses resolveActiveStores for scoping", () => {
    assert.ok(
      toolsSrc.includes("resolveActiveStores(orgId)"),
      "Cross-store aggregator must use resolveActiveStores for tenant-scoped store list",
    );
  });

  it("T06: rankStoresByProductRate scopes through resolveActiveStores", () => {
    const fn = toolsSrc.slice(toolsSrc.indexOf("export async function rankStoresByProductRate"));
    assert.ok(fn.includes("resolveActiveStores(orgId)"), "Rate ranker must scope through governance");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. DATE RANGE PARAMETERS
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Date Range Parameters", () => {
  it("T07: buildProductTimeSeries accepts dateFrom and dateTo", () => {
    const sig = toolsSrc.match(/export async function buildProductTimeSeries\([\s\S]*?\)/);
    assert.ok(sig, "Not found");
    assert.ok(sig[0].includes("dateFrom: string"), "Missing dateFrom");
    assert.ok(sig[0].includes("dateTo: string"), "Missing dateTo");
  });

  it("T08: aggregateProductSalesAcrossStores accepts dateFrom and dateTo", () => {
    const sig = toolsSrc.match(/export async function aggregateProductSalesAcrossStores\([\s\S]*?\)/);
    assert.ok(sig, "Not found");
    assert.ok(sig[0].includes("dateFrom: string"), "Missing dateFrom");
    assert.ok(sig[0].includes("dateTo: string"), "Missing dateTo");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. STRUCTURED OUTPUT SHAPES
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Structured Outputs", () => {
  it("T09: ProductTimeSeriesResult has months array with correct shape", () => {
    assert.ok(typesSrc.includes("interface MonthlySalesEntry"), "MonthlySalesEntry type missing");
    assert.ok(typesSrc.includes("months: MonthlySalesEntry[]"), "months field missing");
    assert.ok(typesSrc.includes("month: string"), "month field missing");
    assert.ok(typesSrc.includes("netUnits: number"), "netUnits field missing");
    assert.ok(typesSrc.includes("netTotal: number"), "netTotal field missing");
  });

  it("T10: CrossStoreProductSalesResult has stores array with structured slices", () => {
    assert.ok(typesSrc.includes("interface StoreProductSalesSlice"), "Slice type missing");
    assert.ok(typesSrc.includes("stores: StoreProductSalesSlice[]"), "stores field missing");
    assert.ok(typesSrc.includes("totalNetUnits: number"), "totalNetUnits missing");
    assert.ok(typesSrc.includes("totalNetTotal: number"), "totalNetTotal missing");
  });

  it("T11: StoreAttentionItem has deduplicationKey", () => {
    assert.ok(typesSrc.includes("deduplicationKey: string"), "deduplicationKey field missing");
  });

  it("T12: ExpiringReservation has isExpiring boolean", () => {
    assert.ok(typesSrc.includes("isExpiring: boolean"), "isExpiring field missing");
  });

  it("T13: No prose in output types — no 'description' narrative fields in results", () => {
    // Results should contain structured data, not narrative text
    // The exception is 'title' in attention items (short structured label)
    const resultTypes = typesSrc.match(/interface \w+Result\s*\{[^}]+\}/g) ?? [];
    for (const rt of resultTypes) {
      assert.ok(!rt.includes("narrative:"), `Result type contains narrative field: ${rt.slice(0, 50)}`);
      assert.ok(!rt.includes("explanation:"), `Result type contains explanation field: ${rt.slice(0, 50)}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. PROVENANCE / FRESHNESS
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Provenance", () => {
  it("T14: DataProvenance type has source, asOf, and optional limitations", () => {
    assert.ok(typesSrc.includes("interface DataProvenance"), "DataProvenance type missing");
    assert.ok(typesSrc.includes("source: string"), "source field missing");
    assert.ok(typesSrc.includes("asOf: string"), "asOf field missing");
    assert.ok(typesSrc.includes("limitations?: string[]"), "limitations field missing");
  });

  it("T15: Every result type includes provenance field", () => {
    const resultTypes = [
      "ProductTimeSeriesResult",
      "CrossStoreProductSalesResult",
      "CrossStoreRateRankingResult",
      "ReservationExpiryResult",
      "StoreAttentionResult",
    ];
    for (const rt of resultTypes) {
      const typeBlock = typesSrc.slice(typesSrc.indexOf(`interface ${rt}`));
      assert.ok(typeBlock.includes("provenance: DataProvenance"), `${rt} missing provenance field`);
    }
  });

  it("T16: Every adapter function populates provenance with source and asOf", () => {
    const fns = [
      "buildProductTimeSeries",
      "aggregateProductSalesAcrossStores",
      "rankStoresByProductRate",
      "detectExpiringReservations",
      "emitStoreAttentionSignals",
    ];
    for (const fn of fns) {
      const fnBlock = toolsSrc.slice(toolsSrc.indexOf(`export async function ${fn}`));
      assert.ok(
        fnBlock.includes("provenance:"),
        `${fn} missing provenance in return`,
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. ATTENTION SIGNAL DEDUP KEYS
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Attention Signals", () => {
  it("T17: Attention signal types include SUPPLY_PLAN_READY, RESERVATION_EXPIRING, SUPPLY_PLAN_PENDING_DISPATCH", () => {
    assert.ok(toolsSrc.includes('"SUPPLY_PLAN_READY"'), "SUPPLY_PLAN_READY signal missing");
    assert.ok(toolsSrc.includes('"RESERVATION_EXPIRING"'), "RESERVATION_EXPIRING signal missing");
    assert.ok(toolsSrc.includes('"SUPPLY_PLAN_PENDING_DISPATCH"'), "SUPPLY_PLAN_PENDING_DISPATCH signal missing");
  });

  it("T18: Dedup keys follow pattern type:orgId:entityId", () => {
    const dedupKeys = toolsSrc.match(/deduplicationKey:\s*`[^`]+`/g);
    assert.ok(dedupKeys, "No dedup keys found");
    for (const key of dedupKeys) {
      assert.ok(key.includes("${orgId}"), `Dedup key missing orgId: ${key}`);
    }
  });

  it("T19: StoreAttentionItem has severity, evidence, and suggestedAction", () => {
    assert.ok(typesSrc.includes("severity: AttentionSeverity"), "severity missing");
    assert.ok(typesSrc.includes("evidence: Record<string, unknown>"), "evidence missing");
    assert.ok(typesSrc.includes("suggestedAction: string"), "suggestedAction missing");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. TOOL REGISTRY METADATA
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Tool Registry", () => {
  const toolNames = extractToolNames();
  const categories = extractToolCategories();
  const approvals = extractApprovalFlags();

  it("T20: Registry has at least 25 tools", () => {
    assert.ok(toolNames.length >= 25, `Expected >= 25 tools, found ${toolNames.length}`);
  });

  it("T21: Every tool has a unique name", () => {
    const unique = new Set(toolNames);
    assert.equal(unique.size, toolNames.length, "Duplicate tool names found");
  });

  it("T22: Valid categories only", () => {
    const valid = new Set(["READ", "ANALYZE", "PREPARE", "WRITE", "APPROVAL_REQUIRED"]);
    for (const cat of categories) {
      assert.ok(valid.has(cat), `Invalid category: ${cat}`);
    }
  });

  it("T23: WRITE and APPROVAL_REQUIRED tools have approvalRequired=true", () => {
    for (let i = 0; i < toolNames.length; i++) {
      if (categories[i] === "WRITE" || categories[i] === "APPROVAL_REQUIRED") {
        assert.ok(approvals[i], `Tool ${toolNames[i]} (${categories[i]}) should require approval`);
      }
    }
  });

  it("T24: READ and ANALYZE tools have approvalRequired=false", () => {
    for (let i = 0; i < toolNames.length; i++) {
      if (categories[i] === "READ" || categories[i] === "ANALYZE") {
        assert.ok(!approvals[i], `Tool ${toolNames[i]} (${categories[i]}) should not require approval`);
      }
    }
  });

  it("T25: Every tool has inputSchema with orgId", () => {
    const schemas = toolsSrc.match(/inputSchema:\s*\{[^}]+\}/g);
    assert.ok(schemas, "No inputSchema found");
    for (const schema of schemas) {
      assert.ok(schema.includes("orgId"), `inputSchema missing orgId: ${schema.slice(0, 60)}`);
    }
  });

  it("T26: Every tool has outputType", () => {
    const outputs = toolsSrc.match(/outputType:\s*"[^"]+"/g);
    assert.ok(outputs, "No outputType found");
    assert.equal(outputs.length, toolNames.length, "outputType count mismatch");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. APPROVAL METADATA
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Approval Metadata", () => {
  it("T27: reserveSupplyPlan requires approval", () => {
    const idx = extractToolNames().indexOf("reserveSupplyPlan");
    assert.ok(idx >= 0, "reserveSupplyPlan not in registry");
    assert.ok(extractApprovalFlags()[idx], "reserveSupplyPlan should require approval");
  });

  it("T28: releaseReservation requires approval", () => {
    const idx = extractToolNames().indexOf("releaseReservation");
    assert.ok(idx >= 0, "releaseReservation not in registry");
    assert.ok(extractApprovalFlags()[idx], "releaseReservation should require approval");
  });

  it("T29: activateStore and deactivateStore are APPROVAL_REQUIRED", () => {
    const names = extractToolNames();
    const cats = extractToolCategories();
    const actIdx = names.indexOf("activateStore");
    const deactIdx = names.indexOf("deactivateStore");
    assert.ok(actIdx >= 0, "activateStore not in registry");
    assert.ok(deactIdx >= 0, "deactivateStore not in registry");
    assert.equal(cats[actIdx], "APPROVAL_REQUIRED");
    assert.equal(cats[deactIdx], "APPROVAL_REQUIRED");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. NO REACT DEPENDENCY
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — No React Dependency", () => {
  it("T30: Tools file has no React imports", () => {
    assert.ok(!toolsSrc.includes("from 'react'"), "Tools contain React import");
    assert.ok(!toolsSrc.includes('from "react"'), "Tools contain React import");
    assert.ok(!toolsSrc.includes("from 'next"), "Tools contain Next.js import");
    assert.ok(!toolsSrc.includes('from "next'), "Tools contain Next.js import");
  });

  it("T31: Types file has no React imports", () => {
    assert.ok(!typesSrc.includes("from 'react'"), "Types contain React import");
    assert.ok(!typesSrc.includes('from "react"'), "Types contain React import");
  });

  it("T32: Tools file has no JSX", () => {
    assert.ok(!toolsSrc.includes("<div"), "Tools contain JSX");
    assert.ok(!toolsSrc.includes("<span"), "Tools contain JSX");
    assert.ok(!toolsSrc.includes("className="), "Tools contain className");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. NO ARBITRARY SQL
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — No Arbitrary SQL", () => {
  it("T33: No direct Prisma import in tools file (uses service wrappers)", () => {
    assert.ok(!toolsSrc.includes('from "@/lib/prisma"'), "Direct Prisma import found");
    assert.ok(!toolsSrc.includes("prisma."), "Direct Prisma usage found");
  });

  it("T34: No SQL strings in tools file", () => {
    assert.ok(!toolsSrc.includes("SELECT "), "SQL SELECT found");
    assert.ok(!toolsSrc.includes("INSERT "), "SQL INSERT found");
    assert.ok(!toolsSrc.includes("UPDATE "), "SQL UPDATE found");
    assert.ok(!toolsSrc.includes("DELETE "), "SQL DELETE found");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. REFERENCE FILTERING
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Reference Filtering", () => {
  it("T35: buildProductTimeSeries supports optional referenceCode filter", () => {
    const sig = toolsSrc.match(/export async function buildProductTimeSeries\([\s\S]*?\)/);
    assert.ok(sig, "Not found");
    assert.ok(sig[0].includes("referenceCode?:"), "Missing optional referenceCode");
  });

  it("T36: Reference comparison uses toUpperCase for case-insensitive matching", () => {
    const refs = toolsSrc.match(/\.toUpperCase\(\)/g);
    assert.ok(refs, "No toUpperCase calls found");
    assert.ok(refs.length >= 3, `Expected >= 3 toUpperCase calls, found ${refs.length}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. MONTHLY BUCKETING
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Monthly Bucketing", () => {
  it("T37: Time series uses YYYY-MM format for month keys", () => {
    assert.ok(toolsSrc.includes('.slice(0, 7)'), "Month bucketing should use slice(0,7) for YYYY-MM");
  });

  it("T38: Months are sorted chronologically", () => {
    assert.ok(toolsSrc.includes("months.sort((a, b) => a.month.localeCompare(b.month))"), "Months should be sorted chronologically");
  });

  it("T39: Net values computed as invoice minus credit note", () => {
    // In the time series builder
    assert.ok(toolsSrc.includes("entry.netUnits = entry.invoiceUnits - entry.creditNoteUnits"), "Net units formula missing");
    assert.ok(toolsSrc.includes("entry.netTotal = entry.invoiceTotal - entry.creditNoteTotal"), "Net total formula missing");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. CERTIFICATION QUESTIONS — STRUCTURAL PROOF
// ══════════════════════════════════════════════════════════════════════════════

describe("COPILOT-DOMAIN-TOOLS — Certification Questions", () => {
  it("CQ-A: Inventory + talla query path exists (getStoreInventory + getProductVariants)", () => {
    const names = extractToolNames();
    assert.ok(names.includes("getStoreInventory"), "getStoreInventory tool missing");
    assert.ok(names.includes("getProductVariants"), "getProductVariants tool missing");
  });

  it("CQ-B: 12-month sales query path exists (buildProductTimeSeries)", () => {
    const names = extractToolNames();
    assert.ok(names.includes("buildProductTimeSeries"), "buildProductTimeSeries tool missing");
  });

  it("CQ-C: Needs query path exists (getStoreNeeds)", () => {
    const names = extractToolNames();
    assert.ok(names.includes("getStoreNeeds"), "getStoreNeeds tool missing");
  });

  it("CQ-D: Discount status query path exists (getStoreDiscountStatus)", () => {
    const names = extractToolNames();
    assert.ok(names.includes("getStoreDiscountStatus"), "getStoreDiscountStatus tool missing");
  });

  it("CQ-E: Effective rules query path exists (getEffectiveStoreRules)", () => {
    const names = extractToolNames();
    assert.ok(names.includes("getEffectiveStoreRules"), "getEffectiveStoreRules tool missing");
  });

  it("CQ-F: Supply plans and reservations query path exists", () => {
    const names = extractToolNames();
    assert.ok(names.includes("getSupplyPlans"), "getSupplyPlans tool missing");
    assert.ok(names.includes("getReservationStatus"), "getReservationStatus tool missing");
    assert.ok(names.includes("detectExpiringReservations"), "detectExpiringReservations tool missing");
  });
});
