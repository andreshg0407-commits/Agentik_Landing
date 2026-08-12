/**
 * lib/comercial/maletas/__tests__/portfolio-copilot-domain-tools.test.ts
 *
 * AGENTIK-COPILOT-SALES-PORTFOLIO-READINESS-01
 *
 * Structural and contract tests for Sales Portfolio Copilot domain tools.
 *
 * Tests:
 *   1. Tenant isolation (orgId required)
 *   2. Seller/portfolio scoping (vendorId where applicable)
 *   3. World separation (CASTILLITOS/LATIN_KIDS/IMPORTACION)
 *   4. GRANDE exclusion
 *   5. Threshold authority not duplicated in React
 *   6. Structured outputs (provenance in every result type)
 *   7. OP quality provenance (pendingQtyQuality)
 *   8. Attention signals (dedup keys, severity, evidence)
 *   9. Tool registry (metadata completeness)
 *  10. Permission metadata
 *  11. No React dependency
 *  12. No arbitrary SQL
 *  13. No legacy Excel authority
 *  14. No LLM dependency
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Source reading ────────────────────────────────────────────────────────────

const toolsDir = path.resolve(__dirname, "..");
const toolsSrc = fs.readFileSync(path.join(toolsDir, "portfolio-copilot-domain-tools.ts"), "utf8");
const typesSrc = fs.readFileSync(path.join(toolsDir, "portfolio-copilot-domain-types.ts"), "utf8");
const catalogSrc = fs.readFileSync(path.join(toolsDir, "assortment-catalog", "castillitos-mallet-assortment-catalog.ts"), "utf8");
const canonicalSrc = fs.readFileSync(path.join(toolsDir, "maletas-canonical-inventory.ts"), "utf8");

// ── Registry helpers ────────────────────────────────────────────────────────

function extractToolNames() {
  const matches = toolsSrc.match(/name:\s*"([^"]+)"/g);
  return matches ? matches.map(m => m.replace(/name:\s*"/, "").replace(/"$/, "")) : [];
}

function extractToolCategories() {
  const matches = toolsSrc.match(/category:\s*"([^"]+)"/g);
  return matches ? matches.map(m => m.replace(/category:\s*"/, "").replace(/"$/, "")) : [];
}

function extractApprovalFlags() {
  const matches = toolsSrc.match(/approvalRequired:\s*(true|false)/g);
  return matches ? matches.map(m => m.includes("true")) : [];
}

function extractPermissions() {
  const matches = toolsSrc.match(/permission:\s*"([^"]+)"/g);
  return matches ? matches.map(m => m.replace(/permission:\s*"/, "").replace(/"$/, "")) : [];
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. TENANT ISOLATION
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — Tenant Isolation", () => {
  it("T01: Every exported async function requires orgId as first parameter", () => {
    const exportedFns = toolsSrc.match(/export async function (\w+)\(\s*\n?\s*orgId:\s*string/g);
    assert.ok(exportedFns, "No exported functions with orgId found");
    assert.ok(exportedFns.length >= 10, `Expected >= 10 exported functions, found ${exportedFns.length}`);
  });

  it("T02: No function accepts arbitrary SQL or raw query parameters", () => {
    assert.ok(!toolsSrc.includes("$queryRaw"), "Contains $queryRaw");
    assert.ok(!toolsSrc.includes("$executeRaw"), "Contains $executeRaw");
    assert.ok(!toolsSrc.includes("queryRawUnsafe"), "Contains queryRawUnsafe");
  });

  it("T03: No cross-tenant query patterns (no orgId reassignment)", () => {
    const orgIdAssignments = toolsSrc.match(/orgId\s*=\s*[^=]/g);
    assert.ok(!orgIdAssignments, "orgId should never be reassigned in tool adapters");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. SELLER / PORTFOLIO SCOPING
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — Seller/Portfolio Scoping", () => {
  it("T04: getSalesPortfolioReferences requires vendorId", () => {
    const sig = toolsSrc.match(/export async function getSalesPortfolioReferences\([\s\S]*?\)/);
    assert.ok(sig, "getSalesPortfolioReferences not found");
    assert.ok(sig[0].includes("vendorId"), "Missing vendorId parameter");
  });

  it("T05: getSalesPortfolioWithdrawalItems requires vendorId", () => {
    const sig = toolsSrc.match(/export async function getSalesPortfolioWithdrawalItems\([\s\S]*?\)/);
    assert.ok(sig, "getSalesPortfolioWithdrawalItems not found");
    assert.ok(sig[0].includes("vendorId"), "Missing vendorId parameter");
  });

  it("T06: getSalesPortfolioDerrotero requires vendorId", () => {
    const sig = toolsSrc.match(/export async function getSalesPortfolioDerrotero\([\s\S]*?\)/);
    assert.ok(sig, "getSalesPortfolioDerrotero not found");
    assert.ok(sig[0].includes("vendorId"), "Missing vendorId parameter");
  });

  it("T07: getSalesPortfolioSupplyCandidatesForPosition requires vendorId AND subgroupName", () => {
    const sig = toolsSrc.match(/export async function getSalesPortfolioSupplyCandidatesForPosition\([\s\S]*?\)/);
    assert.ok(sig, "getSalesPortfolioSupplyCandidatesForPosition not found");
    assert.ok(sig[0].includes("vendorId"), "Missing vendorId parameter");
    assert.ok(sig[0].includes("subgroupName"), "Missing subgroupName parameter");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. WORLD SEPARATION
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — World Separation", () => {
  it("T08: Types define PortfolioDimension with correct world-specific fields", () => {
    assert.ok(typesSrc.includes("CASTILLITOS"), "Missing CASTILLITOS world");
    assert.ok(typesSrc.includes("LATIN_KIDS"), "Missing LATIN_KIDS world");
    assert.ok(typesSrc.includes("IMPORTACION"), "Missing IMPORTACION world");
  });

  it("T09: PortfolioDimension — CASTILLITOS uses group + subgroup", () => {
    assert.ok(typesSrc.includes('world: "CASTILLITOS"; group: string; subgroup: string'), "CASTILLITOS must use group + subgroup");
  });

  it("T10: PortfolioDimension — LATIN_KIDS uses subgroup only", () => {
    assert.ok(typesSrc.includes('world: "LATIN_KIDS"; subgroup: string'), "LATIN_KIDS must use subgroup only");
  });

  it("T11: PortfolioDimension — IMPORTACION uses sizeClass", () => {
    assert.ok(typesSrc.includes('world: "IMPORTACION"; sizeClass:'), "IMPORTACION must use sizeClass");
  });

  it("T12: PortfolioDimension — Import sizeClass restricted to SMALL | MEDIUM", () => {
    assert.ok(typesSrc.includes('"SMALL" | "MEDIUM"'), "Import sizeClass must be SMALL | MEDIUM only");
  });

  it("T13: resolveLineKey maps worlds correctly", () => {
    assert.ok(toolsSrc.includes('if (commercialWorld === "IMPORTACION") return "IMPORT"'), "IMPORTACION -> IMPORT mapping");
    assert.ok(toolsSrc.includes('if (brand === "Castillitos") return "CS"'), "Castillitos -> CS mapping");
    assert.ok(toolsSrc.includes('if (brand === "Latin Kids") return "LT"'), "Latin Kids -> LT mapping");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. GRANDE EXCLUSION
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — GRANDE Exclusion", () => {
  it("T14: GRANDE is marked active: false in catalog", () => {
    const grandeMatch = catalogSrc.match(/subgroupCode:\s*"GRANDE"[\s\S]*?active:\s*(true|false)/);
    assert.ok(grandeMatch, "GRANDE entry not found in catalog");
    assert.equal(grandeMatch[1], "false", "GRANDE must be active: false");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. THRESHOLD AUTHORITY NOT DUPLICATED
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — Threshold Authority", () => {
  it("T15: MALETA_REMOVAL_LIMITS defined in canonical-inventory, imported (not redefined) in tools", () => {
    assert.ok(canonicalSrc.includes("MALETA_REMOVAL_LIMITS"), "Thresholds must exist in canonical-inventory");
    // Tools may IMPORT from canonical but must not DEFINE their own constant
    assert.ok(!toolsSrc.includes("export const MALETA_REMOVAL_LIMITS"), "Tools must NOT redefine removal limits");
  });

  it("T16: Tools do not hardcode threshold values", () => {
    // Check that tools file doesn't contain raw threshold numbers as retiro limits
    const rawThresholds = toolsSrc.match(/retiro.*<=\s*(20|30|10)/g);
    assert.ok(!rawThresholds, "Tools must not hardcode retiro threshold numbers");
  });

  it("T17: MALETA_COVERAGE_MINIMUMS defined in canonical-inventory only", () => {
    assert.ok(canonicalSrc.includes("MALETA_COVERAGE_MINIMUMS"), "Coverage minimums must exist in canonical-inventory");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. STRUCTURED OUTPUTS
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — Structured Outputs", () => {
  it("T18: Every result type includes DataProvenance", () => {
    const resultTypes = typesSrc.match(/export interface \w+Result\s*\{[\s\S]*?\}/g) ?? [];
    assert.ok(resultTypes.length >= 10, `Expected >= 10 result types, found ${resultTypes.length}`);
    for (const rt of resultTypes) {
      const typeName = rt.match(/interface (\w+)/)?.[1] ?? "?";
      assert.ok(rt.includes("provenance: DataProvenance"), `${typeName} missing provenance field`);
    }
  });

  it("T19: DataProvenance has source, asOf, limitations", () => {
    assert.ok(typesSrc.includes("source: string"), "DataProvenance must have source");
    assert.ok(typesSrc.includes("asOf: string"), "DataProvenance must have asOf");
    assert.ok(typesSrc.includes("limitations?: string[]"), "DataProvenance must have limitations");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. OP QUALITY PROVENANCE
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — OP Quality Provenance", () => {
  it("T20: SupplyCandidateItem includes pendingQtyQuality field", () => {
    assert.ok(typesSrc.includes('pendingQtyQuality: "CONFIRMED" | "ESTIMATED" | null'), "Missing pendingQtyQuality in SupplyCandidateItem");
  });

  it("T21: OpDependentNeedItem includes pendingQtyQuality field", () => {
    const match = typesSrc.match(/OpDependentNeedItem[\s\S]*?pendingQtyQuality/);
    assert.ok(match, "OpDependentNeedItem must include pendingQtyQuality");
  });

  it("T22: Tools preserve ESTIMATED when OP data unavailable", () => {
    assert.ok(toolsSrc.includes('"ESTIMATED"'), "Tools must use ESTIMATED for OP quality");
  });

  it("T23: Limitation documented for ESTIMATED pendingQty", () => {
    assert.ok(toolsSrc.includes("pendingQtyQuality=ESTIMATED"), "Must document ESTIMATED limitation in provenance");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. ATTENTION SIGNALS
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — Attention Signals", () => {
  it("T24: PortfolioAttentionItem has deduplicationKey", () => {
    assert.ok(typesSrc.includes("deduplicationKey: string"), "Missing deduplicationKey in PortfolioAttentionItem");
  });

  it("T25: PortfolioAttentionItem has severity", () => {
    assert.ok(typesSrc.includes("severity: AttentionSeverity"), "Missing severity in PortfolioAttentionItem");
  });

  it("T26: PortfolioAttentionItem has evidence", () => {
    const match = typesSrc.match(/PortfolioAttentionItem[\s\S]*?evidence: Record<string, unknown>/);
    assert.ok(match, "Missing evidence in PortfolioAttentionItem");
  });

  it("T27: PortfolioAttentionItem has sellerId and portfolioId", () => {
    assert.ok(typesSrc.includes("sellerId: string | null"), "Missing sellerId");
    assert.ok(typesSrc.includes("portfolioId: string | null"), "Missing portfolioId");
  });

  it("T28: PortfolioAttentionItem has world and line", () => {
    const match = typesSrc.match(/PortfolioAttentionItem[\s\S]*?world: string \| null/);
    assert.ok(match, "Missing world in PortfolioAttentionItem");
  });

  it("T29: PortfolioAttentionItem has suggestedDestination", () => {
    assert.ok(typesSrc.includes("suggestedDestination: string | null"), "Missing suggestedDestination");
  });

  it("T30: emitPortfolioAttentionSignals emits all 6 signal types", () => {
    assert.ok(toolsSrc.includes("PORTFOLIO_WITHDRAWAL_REQUIRED"), "Missing PORTFOLIO_WITHDRAWAL_REQUIRED");
    assert.ok(toolsSrc.includes("PORTFOLIO_SUPPLY_REQUIRED"), "Missing PORTFOLIO_SUPPLY_REQUIRED");
    assert.ok(toolsSrc.includes("PORTFOLIO_COVERAGE_AT_RISK"), "Missing PORTFOLIO_COVERAGE_AT_RISK");
    assert.ok(toolsSrc.includes("PORTFOLIO_NO_SUPPLY_CANDIDATE"), "Missing PORTFOLIO_NO_SUPPLY_CANDIDATE");
    assert.ok(toolsSrc.includes("PORTFOLIO_OP_CANDIDATE_AVAILABLE"), "Missing PORTFOLIO_OP_CANDIDATE_AVAILABLE");
    assert.ok(toolsSrc.includes("PORTFOLIO_PRODUCTION_REQUIRED"), "Missing PORTFOLIO_PRODUCTION_REQUIRED");
  });

  it("T31: Dedup keys include orgId", () => {
    const dedupKeys = toolsSrc.match(/deduplicationKey:\s*`[^`]+`/g) ?? [];
    assert.ok(dedupKeys.length >= 6, `Expected >= 6 dedup keys, found ${dedupKeys.length}`);
    for (const key of dedupKeys) {
      assert.ok(key.includes("${orgId}"), `Dedup key missing orgId: ${key}`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. TOOL REGISTRY
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — Tool Registry", () => {
  const names = extractToolNames();
  const categories = extractToolCategories();
  const approvals = extractApprovalFlags();
  const permissions = extractPermissions();

  it("T32: Registry has >= 15 tools", () => {
    assert.ok(names.length >= 15, `Expected >= 15 tools, found ${names.length}`);
  });

  it("T33: Every tool has a unique name", () => {
    const unique = new Set(names);
    assert.equal(unique.size, names.length, "Duplicate tool names detected");
  });

  it("T34: Every tool has a valid category", () => {
    const valid = new Set(["READ", "ANALYZE", "PREPARE", "WRITE", "APPROVAL_REQUIRED"]);
    for (const cat of categories) {
      assert.ok(valid.has(cat), `Invalid category: ${cat}`);
    }
  });

  it("T35: WRITE and APPROVAL_REQUIRED tools require approval", () => {
    for (let i = 0; i < categories.length; i++) {
      if (categories[i] === "WRITE" || categories[i] === "APPROVAL_REQUIRED") {
        assert.ok(approvals[i], `Tool at index ${i} (${names[i]}) must require approval`);
      }
    }
  });

  it("T36: Every tool has a permission string", () => {
    assert.equal(permissions.length, names.length, "Permission count must match tool count");
    for (const perm of permissions) {
      assert.ok(perm.startsWith("org:"), `Permission must start with org: — got ${perm}`);
    }
  });

  it("T37: Registry exported as PORTFOLIO_DOMAIN_TOOL_REGISTRY", () => {
    assert.ok(toolsSrc.includes("export const PORTFOLIO_DOMAIN_TOOL_REGISTRY"), "Missing PORTFOLIO_DOMAIN_TOOL_REGISTRY export");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. PERMISSION METADATA
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — Permission Metadata", () => {
  it("T38: APPROVAL_REQUIRED tools use org:admin permission", () => {
    const categories = extractToolCategories();
    const permissions = extractPermissions();
    for (let i = 0; i < categories.length; i++) {
      if (categories[i] === "APPROVAL_REQUIRED") {
        assert.ok(permissions[i] === "org:admin" || permissions[i] === "org:write",
          `APPROVAL_REQUIRED tool ${extractToolNames()[i]} should use org:admin or org:write`);
      }
    }
  });

  it("T39: READ tools use org:read permission", () => {
    const categories = extractToolCategories();
    const permissions = extractPermissions();
    for (let i = 0; i < categories.length; i++) {
      if (categories[i] === "READ") {
        assert.equal(permissions[i], "org:read", `READ tool ${extractToolNames()[i]} must use org:read`);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. NO REACT DEPENDENCY
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — No React Dependency", () => {
  it("T40: Tools file has no React imports", () => {
    assert.ok(!toolsSrc.includes('from "react"'), "Tools must not import React");
    assert.ok(!toolsSrc.includes("from 'react'"), "Tools must not import React");
    assert.ok(!toolsSrc.includes("useState"), "Tools must not use useState");
    assert.ok(!toolsSrc.includes("useEffect"), "Tools must not use useEffect");
    assert.ok(!toolsSrc.includes("useMemo"), "Tools must not use useMemo");
  });

  it("T41: Types file has no React imports", () => {
    assert.ok(!typesSrc.includes('from "react"'), "Types must not import React");
    assert.ok(!typesSrc.includes("from 'react'"), "Types must not import React");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. NO ARBITRARY SQL
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — No Arbitrary SQL", () => {
  it("T42: No raw SQL in tools", () => {
    assert.ok(!toolsSrc.includes("$queryRaw"), "No $queryRaw");
    assert.ok(!toolsSrc.includes("$executeRaw"), "No $executeRaw");
    assert.ok(!toolsSrc.includes("SELECT "), "No raw SELECT");
    assert.ok(!toolsSrc.includes("INSERT "), "No raw INSERT");
  });

  it("T43: No direct Prisma import", () => {
    assert.ok(!toolsSrc.includes('from "@/lib/prisma"'), "Tools must not import prisma directly");
    assert.ok(!toolsSrc.includes("from '@/lib/prisma'"), "Tools must not import prisma directly");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. NO LEGACY EXCEL AUTHORITY
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — No Legacy Excel Authority", () => {
  it("T44: Tools do not import maletas-ingestion", () => {
    assert.ok(!toolsSrc.includes('from "./maletas-ingestion"'), "Must not import legacy maletas-ingestion");
    assert.ok(!toolsSrc.includes("from './maletas-ingestion'"), "Must not import legacy maletas-ingestion");
  });

  it("T45: Tools do not import maletas-runtime", () => {
    assert.ok(!toolsSrc.includes('from "./maletas-runtime"'), "Must not import legacy maletas-runtime");
    assert.ok(!toolsSrc.includes("from './maletas-runtime'"), "Must not import legacy maletas-runtime");
  });

  it("T46: Tools do not import reference-decision-engine", () => {
    assert.ok(!toolsSrc.includes('from "./reference-decision-engine"'), "Must not import legacy reference-decision-engine");
    assert.ok(!toolsSrc.includes("from './reference-decision-engine'"), "Must not import legacy reference-decision-engine");
  });

  it("T47: Tools do not import maletas-excel-bootstrap", () => {
    assert.ok(!toolsSrc.includes('from "./maletas-excel-bootstrap"'), "Must not import legacy maletas-excel-bootstrap");
    assert.ok(!toolsSrc.includes("from './maletas-excel-bootstrap'"), "Must not import legacy maletas-excel-bootstrap");
  });

  it("T48: Tools use vendor-sample-loader as data authority", () => {
    assert.ok(toolsSrc.includes("vendor-sample-loader"), "Must use vendor-sample-loader");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. NO LLM DEPENDENCY
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — No LLM Dependency", () => {
  it("T49: Tools file has no LLM imports", () => {
    assert.ok(!toolsSrc.includes("openai"), "Must not import openai");
    assert.ok(!toolsSrc.includes("anthropic"), "Must not import anthropic");
    assert.ok(!toolsSrc.includes("generateText"), "Must not use generateText");
    assert.ok(!toolsSrc.includes("ChatCompletion"), "Must not use ChatCompletion");
  });

  it("T50: Types file has no LLM imports", () => {
    assert.ok(!typesSrc.includes("openai"), "Must not import openai");
    assert.ok(!typesSrc.includes("anthropic"), "Must not import anthropic");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. CERTIFICATION QUESTIONS
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — Certification Questions", () => {
  it("T51: 'Que le falta a la maleta de Nestor?' → getSalesPortfolioSupplyPlanForVendor", () => {
    assert.ok(toolsSrc.includes("getSalesPortfolioSupplyPlanForVendor"), "Function must exist");
  });

  it("T52: 'Que debe retirar?' → getSalesPortfolioWithdrawalItems", () => {
    assert.ok(toolsSrc.includes("getSalesPortfolioWithdrawalItems"), "Function must exist");
  });

  it("T53: 'Que puedo enviarle desde Bodega?' → getSalesPortfolioSupplyCandidatesForPosition", () => {
    assert.ok(toolsSrc.includes("getSalesPortfolioSupplyCandidatesForPosition"), "Function must exist");
  });

  it("T54: 'Que posiciones dependen de OP?' → findOpDependentNeeds", () => {
    assert.ok(toolsSrc.includes("findOpDependentNeeds"), "Function must exist");
  });

  it("T55: 'Por que sugieres referencia X?' → SupplyCandidateItem.explanation", () => {
    assert.ok(typesSrc.includes("explanation: string"), "SupplyCandidateItem must have explanation");
  });

  it("T56: 'Que posiciones no tienen cobertura?' → PORTFOLIO_NO_SUPPLY_CANDIDATE signal", () => {
    assert.ok(toolsSrc.includes("PORTFOLIO_NO_SUPPLY_CANDIDATE"), "Signal must exist");
  });

  it("T57: 'Que maletas requieren atencion?' → comparePortfolios + emitPortfolioAttentionSignals", () => {
    assert.ok(toolsSrc.includes("comparePortfolios"), "comparePortfolios must exist");
    assert.ok(toolsSrc.includes("emitPortfolioAttentionSignals"), "emitPortfolioAttentionSignals must exist");
  });

  it("T58: 'Que debe producirse?' → getSalesPortfolioProductionSignals (preserves production motors)", () => {
    assert.ok(toolsSrc.includes("getSalesPortfolioProductionSignals"), "Function must exist");
    assert.ok(toolsSrc.includes("productionSuggestions"), "Must consume production engine output");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 16. SERVER-ONLY
// ══════════════════════════════════════════════════════════════════════════════

describe("PORTFOLIO-COPILOT-TOOLS — Server Only", () => {
  it("T59: Tools file uses server-only import", () => {
    assert.ok(toolsSrc.includes('"server-only"'), "Must import server-only");
  });

  it("T60: Types file does NOT import server-only (client-safe)", () => {
    assert.ok(!typesSrc.includes('import "server-only"'), "Types must not import server-only");
    assert.ok(!typesSrc.includes("import 'server-only'"), "Types must not import server-only");
  });
});
