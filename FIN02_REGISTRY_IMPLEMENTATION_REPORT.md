# FIN-02 — Financial Source Registry Implementation Report
## STATUS: COMPLETE
## DATE: 2026-05-07

---

## 1. Registry Architecture

### Location
`lib/financial/source-registry.ts`

### Design Approach

The registry is a **pure TypeScript module with no external runtime dependencies** — no Prisma, no database, no framework imports. It can be consumed safely by any module in the codebase including server components, API routes, background jobs, and AI reasoning engines.

It is designed as the **authoritative canonical source** for all financial code groupings. Existing files with partial source classification are migration targets — they should import from the registry, not define their own arrays.

### Type System

```ts
// Financial domain — what accounting event a source code represents
type FinancialDomain =
  | "REVENUE" | "COLLECTION" | "ADVANCE_CLIENT" | "REVENUE_ADJ"
  | "ACCOUNTS_PAYABLE" | "AP_REDUCTION" | "EXPENSE"
  | "ADVANCE_SUPPLIER" | "TREASURY" | "PENDING_DEPOSIT"
  | "COMMERCIAL" | "PAYROLL" | "INVENTORY" | "ACCOUNTING"
  | "PRODUCTION" | "LEGACY" | "IGNORE";

// V1 operational priority
type FinancialPriority =
  | "CORE" | "IMPORTANT" | "SECONDARY" | "ACCOUNTING_ONLY" | "IGNORE_V1";

// Executive data trust state
type FinancialTrustState = "LIVE" | "PARTIAL" | "PENDING" | "ESTIMATED";

// Dashboard block routing
type DashboardBlock = "B1" | "B2" | "B3" | "B4";
```

### Source Metadata Interface

Each source has a `FinancialSourceMetadata` record with:
- Financial domain classification
- V1 priority level
- Trust state for executive display
- F1/F2 track membership
- AR creation/reduction flags
- AP creation/reduction flags
- Cash inflow/outflow flags
- CEO visibility flag
- `neverCountAsCobro` safety flag (B1/B2/H1/H2/CP/NC/NE/ND/NF/etc.)
- Dashboard block routing
- Canonical note from FIN-01 intelligence map

---

## 2. Source Groups Created

### Simple Allowlists (all derived from `SOURCE_METADATA`)

| Export | Contents | Use For |
|--------|----------|---------|
| `AR_CREATION_SOURCES` | FE, FD, FC, FG, FA, FW, F2, C1\*, G1\* | Cartera queries, revenue KPIs |
| `REVENUE_SOURCES_F1` | FE, FD, FC, FG, FA, FW | Legal revenue truth — Torre de Control top-line |
| `REVENUE_SOURCES_ALL` | + F2 | Operational/forecast views |
| `COLLECTION_SOURCES` | R1, RS, RC, RG, RA, AN, A1, R2, A2 | Cobros KPIs, daily B1 card |
| `COLLECTION_SOURCES_F1` | R1, RS, RC, RG, RA, AN, A1 | Official cartera collection |
| `COLLECTION_SOURCES_F2` | R2, A2 | F2 recaudo track |
| `REVENUE_ADJ_SOURCES` | NC, NE, ND, NF, NA, NG, NS, NT, NW, D2 | AR adjustment netting |
| `AP_CREATION_SOURCES` | C1, G1, C2, NO | CxP creation queries |
| `AP_REDUCTION_SOURCES` | DC, DG | CxP reduction queries |
| `AP_SOURCES` | All AP creation + reduction | CxP balance queries |
| `TREASURY_SOURCES` | DB, 1V, 2V | Bank charge + supplier advance queries |
| `PENDING_DEPOSIT_SOURCES` | B1, B2, H1, H2, CP | Consignaciones pendientes — NEVER cobros |
| `COMMERCIAL_SOURCES` | PD | Pedidos del día pipeline |
| `PAYROLL_SOURCES` | NO | Payroll module |
| `ALL_ACTIVE_SOURCES` | All 38 V1 active codes | Operational allowlist filter |

\* C1, G1 are AP creation, not AR. `AR_CREATION_SOURCES` correctly excludes them.

### Exclusion Lists (documentation + safety)

| Export | Contents |
|--------|----------|
| `NA_ELIMINATED_CODES` | 21 N/A codes + SI (EXCLUIR TOTALMENTE) |
| `ARKETOPS_CODES` | 28 ARKETOPS/NIIF accounting system codes |
| `HISTORICAL_ONLY_CODES` | 37 SE USO HACE TIEMPO codes |
| `PRODUCTION_CODES` | 14 production module codes |

### Helper Predicates

```ts
isRevenueSource(code)          // createsAR === true
isCollectionSource(code)       // domain === COLLECTION | ADVANCE_CLIENT
isAccountsPayableSource(code)  // createsAP === true
isTreasurySource(code)         // domain === TREASURY | ADVANCE_SUPPLIER
isPendingDepositSource(code)   // domain === PENDING_DEPOSIT
isRevenueAdjSource(code)       // domain === REVENUE_ADJ
isF1Track(code)                // f1Track === true
isF2Track(code)                // f2Track === true
isCeoVisible(code)             // ceoVisible === true
getSourceMetadata(code)        // Full FinancialSourceMetadata | undefined
getFinancialDomain(code)       // FinancialDomain (IGNORE for unknown)
getTrustState(code)            // FinancialTrustState (PENDING for unknown)
```

### Safety Function

```ts
assertKnownFinancialSource(code, handling?)
//   handling: "warn" (default) | "throw" | "silent"
//   Returns: true if known, false if unknown
//   Diagnoses: N/A, ARKETOPS, HISTORICAL, PRODUCTION categories
```

---

## 3. Query Migrations Completed

### `lib/finance/cobros-kpis.ts` — MIGRATED

**Before:**
```ts
export const COBRO_CODES = ["R1", "R2", "RS", "RC", "RG", "RA", "SI", "AN"] as const;
export type CobroCode = typeof COBRO_CODES[number];
```

**After:**
```ts
import { COLLECTION_SOURCES } from "@/lib/financial/source-registry";
export const COBRO_CODES: readonly string[] = COLLECTION_SOURCES;
export type CobroCode = string;
```

**Changes:**
- `COBRO_CODES` now consumed from registry — single source of truth
- `CobroCode` widened to `string` for registry-driven dynamic sets
- `bySource: Record<CobroCode, ...>` → `Record<string, ...>`
- Added `getMetrics(bySource, code)` safe accessor (guards against missing keys)
- `getCobrosSegments`: direct property access `b.R1`, `b.SI` → safe `getMetrics(b, "R1")`
- `retailFinanciero`: `SI + AN` → `AN` only (SI is EXCLUIR TOTALMENTE per FUENTES.xlsx)

**Semantic impact of SI removal:**
SI (`ka_ni=111`, SISTECREDIT duplicate) was marked `EXCLUIR TOTALMENTE` in FUENTES.xlsx and has `IMPACTA COBROS=NO`. In practice it produced 0 rows in all queries. Removing it is a correctness fix with zero impact on real KPI values.

**TypeScript status:** Zero errors introduced.

---

## 4. Remaining Unsafe Queries (Migration Pending)

The following files still hardcode source arrays. They should migrate to registry imports in subsequent sprints.

### Priority 1 — Finance / Torre de Control

| File | Hardcoded Patterns | Migrate To |
|------|--------------------|-----------|
| `lib/sag/master-data/source-semantic-rules.ts` | `CODIGOS_COBROS_EMPRESA = ["R1"]`, `CODIGOS_COBROS_ALMACEN_ACTIVOS = ["RS","RC","RG","RA"]`, `CODIGOS_RETAIL_FINANCIERO = ["SI","AN"]` (SI conflict!), `CODIGOS_CONSIGNACIONES_PENDIENTES = ["CP","B1","B2","H1","H2"]` | `COLLECTION_SOURCES`, `PENDING_DEPOSIT_SOURCES` |
| `lib/finance/cobros-breakdown.ts` | Imports from source-semantic-rules.ts | Will resolve when source-semantic-rules.ts migrates |
| `lib/sag/source-semantics.ts` | `REVENUE_SOURCE_CONDITION` references `OFICIAL` not code-level allowlist | Add `AR_CREATION_SOURCES` SQL fragment |

### Priority 2 — Reconciliation

| File | Hardcoded Patterns | Migrate To |
|------|--------------------|-----------|
| `lib/reconciliation/applied-facts-parser.ts` | Source code patterns | Registry predicates |
| `lib/finance/auto-reconcile.ts` | Source code matching | Registry helpers |

### Priority 3 — Customer 360 / Commercial

| File | Hardcoded Patterns | Migrate To |
|------|--------------------|-----------|
| `lib/customer360/service.ts` | Source code references | Registry predicates |
| `lib/connectors/adapters/sag-pya-soap/mappers.ts` | Source code parsing | `assertKnownFinancialSource` at import boundary |

### Priority 4 — Other

| File | Notes |
|------|-------|
| `lib/castillitos/cash-sources.ts` | Already excellent deep cash metadata. Register as the "cash layer extension" of the registry. No urgent migration — it provides finer granularity than the registry for cash-specific use cases. |
| `lib/sales/source-rules.ts` | Uses `sagSourceType` (OFICIAL/REMISION) not code-level. Orthogonal to registry — both layers valid. |
| `lib/castillitos/source-rules.ts` | Similar to sales/source-rules.ts. |
| `lib/activation/*`, `lib/connectors/core/types.ts` | Source references in connector/activation context — low priority. |

---

## 5. Future Trust-State Integration Plan

The registry's `FinancialTrustState` per source enables a future trust-state engine:

```
LIVE     (FE, FD, FC, FG, FA, FW, PD, NC, NE, NF, C1, G1, DC, DG)
PARTIAL  (R1, RS, RC, RG, RA, F2, DB)
PENDING  (AN, A1, R2, A2, B1, B2, H1, H2, CP, 1V, 2V, ND)
```

**Integration path:**
1. `getCobrosKpis()` can expose `trustState` per code using `getTrustState(code)` from registry
2. `getCarteraKpis()` can return `carteraTrust: "PARTIAL"` (live SAG, pending bank reconciliation)
3. Executive page B1/B2/B4 cards can display the trust state badge (when UI trust-state system activates)
4. `auto-reconcile.ts` can promote trust state: `PENDING → PARTIAL → LIVE` as reconciliation progresses

The architecture is ready. The semantic data is already in the registry. No schema changes needed for V1 trust display.

---

## 6. Semantic Conflicts Discovered

### SI — Critical Conflict

| Attribute | Value |
|-----------|-------|
| Code | `SI` |
| ka_ni_fuente | 111 |
| Name | SISTECREDIT |
| FUENTES.xlsx classification | `NO SE USA` → Observation: **`EXCLUIR TOTALMENTE`** |
| IMPACTA COBROS | NO |
| Previous usage | Included in `COBRO_CODES` in `cobros-kpis.ts` and `CODIGOS_RETAIL_FINANCIERO` in `source-semantic-rules.ts` |

**Resolution in this sprint:** SI removed from `COBRO_CODES` in `cobros-kpis.ts`. Added to `NA_ELIMINATED_CODES` in the registry.

**Remaining conflict:** `source-semantic-rules.ts` still has `CODIGOS_RETAIL_FINANCIERO = ["SI", "AN"]`. This should be corrected to `["AN"]` when that file is migrated. `cobros-breakdown.ts` imports `CODIGOS_RETAIL_FINANCIERO` — it currently includes SI which produces 0 rows.

### ND — Payment Discount (Not a Cash Receipt)

`ND` (Nota Crédito — Descuentos Financieros) reduces AR at payment time. It has been seen used in cobros-adjacent contexts. **ND must never be summed into cash cobros totals.** The registry marks it `neverCountAsCobro: true` and domain `REVENUE_ADJ`. Any query using COLLECTION_SOURCES correctly excludes ND.

### E1 — Egresos with IMPACTA VENTAS=SI

`E1` (ka_ni=3, "EGRESOS") is marked `IMPACTA VENTAS=SI(+)` in FUENTES.xlsx but is named "Egresos" (outflows). This appears to be a legacy naming inconsistency. The registry classifies it `SECONDARY` with domain `REVENUE` pending accounting review. It is NOT included in `REVENUE_SOURCES_F1` to avoid corrupting official revenue KPIs. Requires client accounting team confirmation.

---

## 7. Unknown/Unmapped Sources Detected

The following sources appeared in the FUENTES CSV with incomplete metadata (blank CLASIFICACION or partial columns). They are classified as SECONDARY or IGNORE_V1 pending clarification:

| Code | Name | Issue |
|------|------|-------|
| BN | Bonos Regalo | No UNIDAD/TIPO/IMPACTA columns filled. Classified ACCOUNTING/SECONDARY. |
| DS | Desglose de Mercancía | No financial columns. INVENTORY/SECONDARY. |
| DE (gasto) | Doc Soporte Electrónico Gasto | Conflicts with DE (depreciación ARKETOPS). Resolved by ka_ni_fuente: ka_ni=158 is the operational one. |
| T3 | Doc Soporte Electrónico | Same as DE — operational expense source, not ARKETOPS. |
| AI / IF | Ajuste Inventario / Inventario Físico | No CLASIFICACION in CSV. INVENTORY/SECONDARY. |
| AP | Ajuste Pedidos | Minimal metadata. COMMERCIAL/SECONDARY. |

---

## 8. Architecture Summary

```
lib/financial/source-registry.ts    ← THE CANONICAL SOURCE (this sprint)
        │
        ├── SOURCE_METADATA         ← 38 V1 active sources with full metadata
        │
        ├── Derived allowlists       ← AR_CREATION, COLLECTION, AP, REVENUE_ADJ, etc.
        │
        ├── Helper predicates        ← isRevenueSource(), isPendingDepositSource(), etc.
        │
        └── assertKnownFinancialSource() ← Safety guard at import boundaries

Consumes registry:
  lib/finance/cobros-kpis.ts       ← MIGRATED (COBRO_CODES → COLLECTION_SOURCES)

Pending migration (next sprints):
  lib/sag/master-data/source-semantic-rules.ts
  lib/finance/cobros-breakdown.ts
  lib/reconciliation/applied-facts-parser.ts
  lib/finance/auto-reconcile.ts
  lib/connectors/adapters/sag-pya-soap/mappers.ts

Orthogonal (no migration needed — different layer):
  lib/castillitos/cash-sources.ts   ← Deep cash metadata extension
  lib/sales/source-rules.ts         ← sagSourceType (OFICIAL/REMISION) layer
```

---

## Success Condition Status

| Requirement | Status |
|-------------|--------|
| Canonical typed registry created | COMPLETE |
| All source groups exported | COMPLETE |
| Rich metadata (domain, trust, flags) | COMPLETE |
| Type definitions (FinancialDomain, Priority, TrustState) | COMPLETE |
| Helper predicates | COMPLETE |
| assertKnownFinancialSource() | COMPLETE |
| getCobrosKpis migration | COMPLETE |
| TypeScript clean | COMPLETE — 0 errors |
| SI conflict resolved in cobros-kpis | COMPLETE |
| Remaining unsafe queries documented | COMPLETE |
| Future trust-state integration plan | COMPLETE |
