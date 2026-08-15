# Sales Portfolio (Maletas) — Copilot Domain Contract

**Sprint:** AGENTIK-COPILOT-SALES-PORTFOLIO-READINESS-01
**Date:** 2026-08-06
**Status:** CERTIFIED

---

## Files

| File | Purpose | Safety |
|---|---|---|
| `lib/comercial/maletas/portfolio-copilot-domain-types.ts` | Client-safe types for all domain tool results | No runtime, no Prisma, no server-only |
| `lib/comercial/maletas/portfolio-copilot-domain-tools.ts` | Server-only tool adapters wrapping canonical authorities | `import "server-only"` |
| `lib/comercial/maletas/__tests__/portfolio-copilot-domain-tools.test.ts` | 60 structural tests (node:test) | Source-reading, no DB |

---

## Tool Registry (18 tools)

### READ (9 tools)

| Tool | Description |
|---|---|
| `getSalesPortfolios` | List all portfolios with vendor, health, sample counts |
| `getSalesPortfolio` | Single portfolio detail: vendor info, health, ref counts, lines |
| `getSalesPortfolioReferences` | Current samples in a portfolio, optionally filtered by line |
| `getSalesPortfolioWithdrawalItems` | Samples to withdraw (retiro) with removal reason |
| `getSalesPortfolioDerrotero` | Effective assortment rules with per-line coverage breakdown |
| `getSalesPortfolioSupplyPlanForVendor` | Missing Derrotero positions and supply actions for a vendor |
| `getSalesPortfolioSupplyCandidatesForPosition` | Eligible supply candidates for a missing position |
| `getSalesPortfolioProductionSignals` | Production suggestions from subgroup-level stock thresholds |
| `getSalesPortfolioCoverageOpportunities` | References in central warehouse eligible for portfolios |

### ANALYZE (5 tools)

| Tool | Description |
|---|---|
| `emitPortfolioAttentionSignals` | Deterministic attention signals (6 types, severity-sorted) |
| `comparePortfolios` | Cross-portfolio comparison: Derrotero completion, retiro counts |
| `findSharedSupplyNeeds` | Positions missing across multiple vendors |
| `findMultiVendorCandidates` | Warehouse refs eligible for multiple vendors |
| `findOpDependentNeeds` | Positions depending on pending OP with provenance |

### PREPARE (1 tool)

| Tool | Description |
|---|---|
| `prepareSalesPortfolioSupplyRecommendation` | Structured supply recommendation (advisory, no side effects) |

### APPROVAL_REQUIRED (3 tools)

| Tool | Description |
|---|---|
| `activateSalesPortfolio` | Activate a vendor's portfolio |
| `deactivateSalesPortfolio` | Deactivate a vendor's portfolio |
| `updateDerroteroEntry` | Change target units for a Derrotero position |

---

## Attention Signal Types

| Type | Severity | Trigger |
|---|---|---|
| `PORTFOLIO_WITHDRAWAL_REQUIRED` | critical/warning | Retiro refs > 0 (critical if >= 5) |
| `PORTFOLIO_COVERAGE_AT_RISK` | critical/warning | Derrotero completion < 70% (critical if < 50%) |
| `PORTFOLIO_SUPPLY_REQUIRED` | critical/warning | Missing positions with actionable candidates |
| `PORTFOLIO_NO_SUPPLY_CANDIDATE` | warning/info | Missing positions with no candidates |
| `PORTFOLIO_PRODUCTION_REQUIRED` | critical/warning | Urgent/medium production suggestions |
| `PORTFOLIO_OP_CANDIDATE_AVAILABLE` | info | Positions with pending OP |

---

## Data Authority

All tools consume `loadVendorSampleData(orgId)` as canonical data source. No direct Prisma queries. No new DB access.

### Canonical authorities consumed

| Authority | File |
|---|---|
| `loadVendorSampleData()` | `vendor-sample-loader.ts` |
| `buildSalesPortfolioSupplyPlan()` | `supply-plan-engine.ts` |
| `getSalesPortfolioDerroteroCoverage()` | `supply-plan-engine.ts` |
| `getSalesPortfolioSupplyNeeds()` | `supply-plan-engine.ts` |
| `getSalesPortfolioSupplyCandidates()` | `supply-plan-engine.ts` |
| `evaluateVendorAssortment()` | `maletas-functional-evaluation.ts` |
| `MALETA_REMOVAL_LIMITS` | `maletas-canonical-inventory.ts` |
| `VENDOR_BODEGA_CONFIGS` | `vendor-sample-presence-engine.ts` |

### Legacy exclusions (DEAD PATH)

- `maletas-runtime.ts` — Excel-based, not imported
- `maletas-ingestion.ts` — Excel-based, not imported
- `reference-decision-engine.ts` — CCS-based decisions, not imported

---

## World Separation

| World | Dimension | GRANDE |
|---|---|---|
| `CASTILLITOS` | `{ group, subgroup }` | Excluded (`active: false`) |
| `LATIN_KIDS` | `{ subgroup }` | N/A |
| `IMPORTACION` | `{ sizeClass: SMALL/MEDIUM }` | Excluded |

---

## Provenance Contract

Every result type includes `DataProvenance`:

```typescript
interface DataProvenance {
  source: string;       // "vendor-sample-loader (SAG SOAP + Prisma)"
  asOf: string;         // ISO timestamp of data load
  limitations?: string[];
}
```

OP-dependent results include `pendingQtyQuality: "CONFIRMED" | "ESTIMATED" | null`.

---

## Tenant + Permission Boundary

- Every function requires `orgId` as first argument (tenant isolation)
- No cross-org data access possible
- Permission metadata in registry: `org:read` for READ/ANALYZE, `org:admin` for APPROVAL_REQUIRED
- `approvalRequired: true` flag on all write tools

---

## Test Coverage (60 tests, 16 suites)

| Suite | Tests | Focus |
|---|---|---|
| Tenant isolation | T01-T03 | orgId required on all functions |
| Seller scoping | T04-T07 | vendorId parameter where applicable |
| World separation | T08-T13 | Discriminated union types per world |
| GRANDE exclusion | T14 | GRANDE active:false in catalog |
| Threshold authority | T15-T17 | Constants in canonical-inventory, not in tools |
| Structured outputs | T18-T19 | DataProvenance in all result types |
| OP quality provenance | T20-T23 | pendingQtyQuality field in types |
| Attention signals | T24-T31 | 6 signal types, dedup keys, severity, evidence |
| Tool registry | T32-T37 | 18 tools, valid categories, no duplicates |
| Permission metadata | T38-T39 | All tools have permission + approvalRequired |
| No React dependency | T40-T41 | No React imports in tools file |
| No arbitrary SQL | T42-T43 | No raw Prisma queries |
| No legacy Excel authority | T44-T48 | No imports from legacy files |
| No LLM dependency | T49-T50 | No AI/LLM imports |
| Certification questions | T51-T58 | Contract completeness assertions |
| Server-only | T59-T60 | Tools: server-only import; Types: no server-only |
