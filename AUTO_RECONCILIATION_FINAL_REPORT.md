# Sprint S3 Phase 1 — Auto-Reconciliation Final Report

**Generated:** 2026-05-06
**Org:** Castillitos (`cmmpwstuf000dp5y58kj1daaj`)
**Status:** DRY-RUN VALIDATED — SAFE TO APPLY

---

## 1. What Was Built

A fully idempotent, transactional auto-reconciliation engine for Phase 1, implementing a single HIGH-confidence rule (`MOV_EXACT_MATCH`).

### Files Created

| File | Role |
|---|---|
| `lib/reconciliation/reconciliation-rules.ts` | Pure rule functions — `extractDocumentoPagado`, `docPagadoToErpId`, `applyRuleMovExactMatch`, `deriveStatusAfter`, `computeBalanceAfter` |
| `lib/reconciliation/reconciliation-engine.ts` | `buildReconciliationPlan()` (read-only) + `applyReconciliationPlan()` (transactional write) |
| `lib/reconciliation/reconciliation-audit.ts` | `getReconciliationSummary()`, `getAllocationsByReceivable()`, `getUnmatchedCobros()`, `getRollbackDataForReceivable()` |
| `prisma/migrations/20260506000000_collection_allocation/migration.sql` | `CollectionAllocation` table — immutable audit trail |
| `scripts/_dry_run_auto_reconciliation.ts` | 8-section read-only simulation — validated against production |
| `scripts/_apply_auto_reconciliation.ts` | Safe apply script with CONFIRM gate, pre-apply summary, per-pair logging, error collection, post-apply DB state |

### Prisma Model Added: `CollectionAllocation`

Immutable audit record per (cobro → receivable) application:
- `amountApplied`, `balanceBefore`, `balanceAfter`, `paidBefore`, `paidAfter`
- `statusBefore`, `statusAfter`, `ruleUsed`, `confidence`, `appliedBy`
- `@@unique([collectionRecordId, receivableId])` — idempotency guarantee
- 4 performance indices; 3 FK constraints (org, cobro, receivable)

---

## 2. Dry-Run Results (Production Data)

Run: `ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_dry_run_auto_reconciliation.ts`

### Section 1: Input Summary

| Metric | Value |
|---|---|
| Cobros analyzed (AVAILABLE) | 20,534 |
| Qualified pairs | **3,987** |
| Skipped cobros | 7,718 |
| Unmatched cobros (no RX) | 8,829 |

### Section 2: Financial Impact

| Metric | Value |
|---|---|
| Current total balance | $32,679,885,952 COP |
| Amount to apply | **$1,132,828,200 COP** |
| Projected balance after | $31,547,057,753 COP |
| Balance reduction | **3.5%** |
| Invoices → PAID | **2,904** |
| Invoices → PARTIAL | **1,083** |
| Receivables touched | **3,285** of 124,998 (2.6%) |

### Section 3: Confidence Distribution

| Confidence | Count | % |
|---|---|---|
| HIGH | 3,987 | 100.0% |

All qualified pairs are HIGH confidence. No fuzzy matching, no ambiguity.

### Section 4: Skip Reason Breakdown

| Reason | Count | Meaning |
|---|---|---|
| `RX_ZERO_ORIGINAL` | 4,261 | SISTECREDITO and zero-value rows — correct to skip |
| `RX_BALANCE_ZERO` | 3,457 | Balance already zero in DB — correct to skip |
| `NO_RX_MATCH` | 8,829 | erpId not in CustomerReceivable — MOV range gap (Sprint S2.2 blocker) |

### Section 5: Top Affected Invoices (Sample)

| erpId | Applied (COP) | Cobros | Remaining | Status | Customer |
|---|---|---|---|---|---|
| MOV-925 | $7,055,058 | 6 | $3,363,699 | PARTIAL | INDUSTRIAS DIANA ALZATE SAS |
| MOV-7508 | $7,034,070 | 2 | $4,159,147 | PARTIAL | BOY TOYS FACTORY S.A.S |
| MOV-4436 | $5,622,377 | 2 | $522,588 | PARTIAL | INDUSTRIAS DIANA ALZATE SAS |
| MOV-10350 | $4,205,300 | 1 | $0 | **PAID** | JOSE GUSTAVO JARAMILLO |
| MOV-3583 | $3,892,937 | 1 | $0 | **PAID** | MONTOYA INVERSIONES S.A.S |

### Section 6: Multi-Cobro Invoices

762 invoices have multiple cobros. Top:

| erpId | Cobros | Total Applied | Final Status |
|---|---|---|---|
| MOV-7 | 8 | $3,321,058 | PARTIAL |
| MOV-137 | 8 | $1,435,656 | PARTIAL |
| MOV-190 | 7 | $741,840 | **PAID** |
| MOV-148 | 7 | $1,488,312 | **PAID** |

Multi-cobro accumulation is handled correctly: cobros processed oldest-first, running paidAmount tracked per receivable.

### Section 8: Unmatched Cobros

- **8,829 cobros** reference erpIds not present in CustomerReceivable
- **$11,165,129,729 COP** in unmatched cobro value
- Root cause: v_pagosnew on SAG SQL Server only exposes Documento_pagado ≈ 1–10,761; receivables for MOV 10,801–269,337 have no cobro data
- **Resolution:** Sprint S2.2 blocker — requires SAG team to expand v_pagosnew + cursor reset

---

## 3. Idempotency Mechanisms

Three independent layers prevent double-application:

1. **DB constraint:** `@@unique([collectionRecordId, receivableId])` on `CollectionAllocation` — Postgres rejects duplicates at write time
2. **Pre-fetch check:** Engine loads all existing allocations before processing; `allocatedSet` skips already-applied pairs
3. **Transaction re-validation:** Inside each `prisma.$transaction()`, live `balanceDue` is re-read; if `paidNow >= origAmt`, the pair is skipped with `SKIP:RX_FULLY_PAID`

Safe to re-run the apply script at any time.

---

## 4. Downstream Impact

### Automatically propagated (no action needed)

- **`CustomerReceivable.balanceDue/paidAmount/status`** — updated directly by apply engine
- **Cartera KPIs** (`lib/finance/cartera-kpis.ts`) — queries `CustomerReceivable.balanceDue` live; picks up changes immediately
- **Customer360 financials** (`lib/customer360/service.ts`) — reads `CustomerReceivable` via `refreshAllCustomerFinancials()`; already called after every sync via `sync/route.ts`
- **Torre de Control aging buckets** — derived from `CustomerReceivable.daysOverdue + balanceDue`; live queries
- **Centro de Decisiones alerts** — cartera alert thresholds re-evaluated on next sync

### Recommended: Run after apply

```bash
# Trigger Customer360 KPI refresh for Castillitos
POST /api/orgs/castillitos/connectors/cmnhu4hky0000n4y50jlhkfib/sync?module=receivables
```

Or call directly in a script:
```typescript
import { refreshAllCustomerFinancials } from "@/lib/customer360/service";
await refreshAllCustomerFinancials("cmmpwstuf000dp5y58kj1daaj");
```

---

## 5. Operational Risks

| Risk | Severity | Mitigation |
|---|---|---|
| MOV range gap — 8,829 cobros unmatched | HIGH | Sprint S2.2: SAG team must expand v_pagosnew |
| `RX_ZERO_ORIGINAL` rows (4,261) — no original amount | LOW | Correct skip behavior; SISTECREDITO rows |
| `RX_BALANCE_ZERO` (3,457) — balance already zero | LOW | Idempotent skip; these may have been zeroed via other means |
| Concurrent sync during apply | LOW | Transaction re-validation catches stale plan state |
| Large batch time (3,987 pairs) | LOW | Engine uses `prisma.$transaction()` per pair — resumable; re-run is safe |

---

## 6. How to Apply

```bash
# Step 1: Run dry-run (already done — output above)
ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_dry_run_auto_reconciliation.ts

# Step 2: Apply (CONFIRM=yes required)
CONFIRM=yes ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_apply_auto_reconciliation.ts

# Step 3: Verify — dry-run should show 0 qualified pairs
ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_dry_run_auto_reconciliation.ts

# Step 4: Verify audit trail
SELECT COUNT(*), SUM("amountApplied"), "confidence"
FROM "CollectionAllocation"
WHERE "organizationId" = 'cmmpwstuf000dp5y58kj1daaj'
GROUP BY "confidence";
```

Staged rollout option (apply 100 pairs at a time):
```bash
CONFIRM=yes LIMIT=100 ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_apply_auto_reconciliation.ts
```

---

## 7. Phase 2 Recommendations

Phase 1 covers only HIGH-confidence exact MOV-ID matches. Remaining opportunities:

| Phase | Rule | Confidence | Prerequisite |
|---|---|---|---|
| **2a** | `FUZZY_CUSTOMER_AMOUNT_DATE` — match by customer NIT + amount ± 1% + date ± 30d | MEDIUM | Human review queue UI |
| **2b** | `ND_CREDIT_NOTE` — apply credit notes (ND) to open receivables | HIGH | ND docs ingested into CollectionRecord |
| **2c** | `SISTECREDITO_CHANNEL` — zero-original receivables linked via payment channel code | MEDIUM | SAG schema clarification |
| **3** | ML ranking of unmatched cobros | LOW | Labeled dataset from Phase 1+2 |

**Most impactful next step:** Resolve Sprint S2.2 blocker (SAG expand v_pagosnew). This would unlock an estimated 8,829 additional cobros ($11.1B) for reconciliation.

---

## 8. TypeScript Status

All new files pass `tsc --noEmit` with zero errors:
- `lib/reconciliation/reconciliation-rules.ts` ✓
- `lib/reconciliation/reconciliation-engine.ts` ✓
- `lib/reconciliation/reconciliation-audit.ts` ✓
- `scripts/_dry_run_auto_reconciliation.ts` ✓
- `scripts/_apply_auto_reconciliation.ts` ✓

Pre-existing errors in `open-design/` (electron, vitest modules) and `marketing-studio/` (GarmentType enum) are unrelated to this sprint.
