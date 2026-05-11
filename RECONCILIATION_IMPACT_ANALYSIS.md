# RECONCILIATION_IMPACT_ANALYSIS.md
## Sprint S2.2 — Phase E: Architectural Impact Analysis
_Generated: 2026-05-06 | Based on S2.2 Phase A–D findings_

---

## 1. Scope

This document analyzes the architectural impact of:
1. The historical backfill (expanded v_pagosnew → more CollectionRecord rows)
2. The Sprint S3 write engine (applying cobros to CustomerReceivable balances)
3. The combined system state at each transition point

---

## 2. Dependency Graph

```
[SAG SQL Server]
    └── v_pagosnew (view — SAG-managed)
         └── COLLECTIONS_QUERY (no filters)
              └── consultaSagJson() (SOAP, 3-min timeout)
                   └── pullCollections() (adapter)
                        └── _colCache (instance-level, populated once)
                             └── [page slices 0..N by RX_PAGE_SIZE=500]
                                  └── CollectionRecord (Prisma, upsert)
                                       └── naturalKey dedup constraint
                                            └── [write engine — Sprint S3]
                                                 └── CustomerReceivable.paidAmount
                                                      └── CustomerReceivable.balanceDue
                                                           └── [B1/B2 dashboards, Customer 360, Cartera KPIs]

[SAG SQL Server]
    └── v_cl / MOVIMIENTOS (receivables view)
         └── DEFAULT_RECEIVABLE_QUERY
              └── pullReceivables() (adapter)
                   └── CustomerReceivable (Prisma, upsert by erpId)
                        └── .erpId = "MOV-{ka_nl_movimiento}"
                             └── [join key for reconciliation]
```

### Key dependency: CollectionRecord → CustomerReceivable join
```
CollectionRecord.rawJson.raw.Documento_pagado  →→→  CustomerReceivable.erpId
= numeric SAG MOVIMIENTO PK                         = "MOV-" + ka_nl_movimiento
```

This join is the **sole reconciliation path**. No other link exists between payment and invoice data.

---

## 3. State Transitions

### State 0: Current (before any change)
```
CollectionRecord: 20,534 rows
  Documento_pagado range: 1–10,761
  appliedFacts: null (100% of rows)

CustomerReceivable: 124,998 rows
  paidAmount: 0 (100% of rows)
  balanceDue = originalAmount (stale)

Reconciliation join: 5,167 matched (4.1%)
  Available for Sprint S3 write engine: YES
```

### State 1: After mapper fix (ALREADY APPLIED)
```
CollectionRecord: 20,534 rows (no change in count)
  appliedFacts: POPULATED on new syncs
    → rawJson.raw.Documento_pagado → appliedFacts[].invoiceNumber
    → targetInvoiceId = "MOV-" + Documento_pagado
  Historical rows: still have appliedFacts=null (re-sync needed to backfill appliedFacts)

Impact: parser confidence upgrades from RAW_JSON strategy to APPLIED_FACTS_ARRAY strategy
         on future cobros. Historical rows still use RAW_JSON strategy (still works).
```

### State 2: After historical backfill (blocked on SAG v_pagosnew expansion)
```
CollectionRecord: ~120,000–420,000 rows (estimated)
  Documento_pagado range: 1–269,337+

CustomerReceivable matchable: ~55,000–90,000 (44–72%)

Performance impact:
  - CollectionRecord table: 5–20× larger
  - shadowReconcileOrg() full scan: 5–20× slower without index optimization
  - Collections sync: 1 SOAP call + 100–840 DB page writes (5–30 minutes)
```

### State 3: After Sprint S3 write engine
```
CustomerReceivable: 124,998 rows
  paidAmount: UPDATED for matched rows
  balanceDue: UPDATED = originalAmount - paidAmount
  status: PARTIAL / PAID / OPEN based on thresholds

PaymentAllocation: NEW table (Sprint S3 schema migration required)
  collectionRecordId → customerReceivableId mapping
  Audit trail for every applied cobro

Reconciliation write: HIGH-confidence matches auto-applied
                       MEDIUM-confidence goes to human review queue
```

---

## 4. Cache Invalidation Requirements

### After CollectionRecord backfill (State 2)
The following downstream caches/computations become stale:

| Downstream Consumer | Staleness After Backfill | Invalidation Action |
|--------------------|------------------------|---------------------|
| `shadowReconcileCustomer()` | Old cached result wrong (new cobros found) | No cache — runs live query. Automatically fresher. |
| `shadowReconcileOrg()` | Old result wrong | No cache — runs live query. Automatically fresher. |
| B1 Cartera KPIs (`lib/finance/cartera-kpis.ts`) | NOT affected — reads CustomerReceivable.balanceDue (not yet updated) | No action needed until Sprint S3 |
| B2 Dashboard cobros panel | May show new rows if filtering by CollectionRecord | Reloads on next page visit — no explicit invalidation |
| `lib/collections/queue.ts` | May have different priority ordering | Re-runs on next trigger |
| `CustomerProfile.totalReceivable` | NOT affected — reads CustomerReceivable.balanceDue | No action until Sprint S3 |

**Key finding:** The backfill is invisible to all downstream consumers until Sprint S3 applies the cobros to balances. No cache invalidation is required for State 2.

### After Sprint S3 write engine (State 3)
Balance changes propagate to:

| Consumer | Impact | Required Action |
|----------|--------|----------------|
| B1 Cartera (cartera-kpis.ts) | Old KPIs show full balance (overstated) | Re-run `refreshAllCustomerFinancials()` |
| B2 Dashboard (exec page) | Balance overstatement visible to CEO | Same |
| Customer 360 | `CustomerProfile.totalReceivable` outdated | `refreshAllCustomerFinancials(orgId)` |
| Alert engine (org-alerts.ts) | Thresholds recalibrate | Re-run `generateCarteraAlerts()` |
| Reconciliation reports | Historical baselines change | Re-run `_shadow-recon-audit.ts` |
| CRM scoring | `churnRisk` based on receivable balance | Re-run `runScoringForOrg()` |

Sprint S3 write engine must trigger `refreshAllCustomerFinancials()` as a post-write hook, the same way the receivables sync does today (see `sync/route.ts` lines 83–90).

---

## 5. Performance Impact Assessment

### CollectionRecord table growth

| State | Rows | Index Size (est.) | Join Performance |
|-------|------|------------------|-----------------|
| Current | 20,534 | ~5 MB | Fast (small table) |
| After conservative backfill | 70,534 | ~17 MB | Fast |
| After optimistic backfill | 420,534 | ~100 MB | Needs index optimization |

### Critical queries to optimize before optimistic backfill

**Query 1: Shadow reconciliation join (used by `shadow-reconciliation.ts`)**
```sql
SELECT col.amount FROM "CollectionRecord" col
WHERE col."organizationId" = $1
  AND col."rawJson"->'raw'->>'Documento_pagado' = $2
```
Current performance: JSONB extraction with no GIN index → sequential scan.

**Recommended index (add before optimistic backfill):**
```sql
-- GIN index for rawJson JSONB path lookups
CREATE INDEX "CollectionRecord_rawJson_gin"
ON "CollectionRecord" USING GIN ("rawJson" jsonb_path_ops);

-- Or more targeted (if Postgres 16+ with expression index on extracted value):
CREATE INDEX "CollectionRecord_docPagado"
ON "CollectionRecord" (("rawJson"->'raw'->>'Documento_pagado'))
WHERE "rawJson"->'raw'->>'Documento_pagado' IS NOT NULL;
```

**Query 2: Sprint S3 write engine batch**
When applying cobros to receivables, the write engine will need:
```sql
SELECT cr.id, col.id, col.amount
FROM "CustomerReceivable" cr
JOIN "CollectionRecord" col
  ON cr."erpId" = 'MOV-' || (col."rawJson"->'raw'->>'Documento_pagado')
WHERE cr."organizationId" = $1
  AND cr."paidAmount" = 0
  AND (col."rawJson"->'raw'->>'Documento_pagado')::text NOT IN ('0','null','')
```
After optimistic backfill (~420K rows), this join will be slow without the JSONB index above.

**Query 3: Incremental collections sync (after backfill)**
```sql
-- Agentik filters in-memory using collectionDate > dateFilter (in pullCollections())
-- No DB query — uses _colCache. Not a DB performance concern.
```

### Index recommendations (in priority order)

| Priority | Index | Rationale | Required Before |
|----------|-------|-----------|----------------|
| HIGH | GIN on `CollectionRecord.rawJson` OR expression index on `rawJson->'raw'->>'Documento_pagado'` | Reconciliation join will scan 420K+ rows post-backfill | Optimistic backfill |
| MEDIUM | `CustomerReceivable` composite on `(organizationId, erpId, status)` | Sprint S3 write engine batch update | Sprint S3 |
| LOW | `CollectionRecord` on `(organizationId, collectionDate)` | Incremental sync filter (currently in-memory) | Only if table grows beyond 1M rows |

---

## 6. Sprint S3 Prerequisites Checklist

Before implementing the write engine:

### Schema migrations required
```prisma
// Add to CustomerReceivable:
reconcileStatus  ReconcileStatus  @default(UNPROCESSED)
reconciledAt     DateTime?

enum ReconcileStatus {
  UNPROCESSED
  AUTO_APPLIED    // HIGH confidence match, auto-written
  HUMAN_REVIEW    // MEDIUM confidence, needs approval
  CONFIRMED       // Human approved
  REJECTED        // Human rejected
  PARTIAL_MATCH   // Some cobros applied, balance still open
}

// New model: PaymentAllocation
model PaymentAllocation {
  id                  String   @id @default(cuid())
  organizationId      String
  receivableId        String   // FK CustomerReceivable
  collectionRecordId  String   // FK CollectionRecord
  amountApplied       Decimal  @db.Decimal(18, 2)
  confidence          String   // HIGH / MEDIUM
  appliedAt           DateTime @default(now())
  appliedBy           String?  // "AUTO" or userId
  reversedAt          DateTime?

  @@unique([receivableId, collectionRecordId])
  @@index([organizationId, receivableId])
  @@index([organizationId, collectionRecordId])
}
```

### API changes required
1. New endpoint: `POST /api/orgs/{orgSlug}/reconciliation/apply` — batch apply HIGH-confidence matches
2. New endpoint: `POST /api/orgs/{orgSlug}/reconciliation/review` — human approve/reject MEDIUM matches
3. Guard: ensure `PaymentAllocation` is idempotent (upsert by `[receivableId, collectionRecordId]`)
4. Post-write hook: trigger `refreshAllCustomerFinancials(orgId)` after each batch

### Double-counting prevention
The write engine MUST:
1. Check `PaymentAllocation` before applying: if `(receivableId, collectionRecordId)` already exists → skip
2. Sum all existing `PaymentAllocation.amountApplied` before updating `paidAmount`:
   ```
   newPaidAmount = SUM(existing allocations) + new cobro amount
   newBalanceDue = originalAmount - newPaidAmount
   ```
3. Never apply if `newPaidAmount > originalAmount * 1.05` (5% overpayment tolerance) — flag OVERPAID

---

## 7. Reconciliation Confidence at Each State

| State | HIGH confidence | MEDIUM confidence | LOW confidence | Auto-reconcilable |
|-------|----------------|-------------------|----------------|------------------|
| State 0 (current) | 0.5% | 2.5% | 97.0% | 4.1% |
| State 1 (mapper fix applied) | 0.5% → becomes ~57% on new syncs | Same | Same | 4.1% (historical data unchanged) |
| State 2 (backfill) | 40–75% | 5–10% | 20–50% | 44–75% |
| State 3 (write engine) | Applied | Human reviewed | Carry forward | 55–85% fully reconciled |

---

## 8. Rollback Considerations

### Backfill (State 2) rollback
```sql
-- Remove only backfilled rows (those referencing higher MOV IDs):
DELETE FROM "CollectionRecord"
WHERE "organizationId" = '<orgId>'
  AND CAST(("rawJson"->'raw'->>'Documento_pagado') AS INTEGER) > 10761;
```
Risk: LOW. Only CollectionRecord is affected. CustomerReceivable untouched.

### Write engine (State 3) rollback
Much more complex — requires:
1. Delete all `PaymentAllocation` rows created in the batch
2. Revert `CustomerReceivable.paidAmount` to 0 and `balanceDue` to `originalAmount`
3. Set `reconcileStatus` back to UNPROCESSED

This is why Sprint S3 must implement a `PaymentAllocation` table as the audit trail — reversal is impossible without it.

---

## 9. Executive Recommendation

### Optimal sequencing

```
NOW (Sprint S2.2 complete):
  → Run Sprint S3 write engine on existing 5,167 receivables
  → Apply $14.265B in cobros to matched balances
  → Immediate value: $14.265B in balance corrections visible to CEO/Finance

IN PARALLEL (no code work needed):
  → SAG inquiry: expand v_pagosnew to cover MOV 10,801–269,337
  → Estimated SAG turnaround: 1–4 weeks

WHEN SAG CONFIRMS (1 hour of work):
  → cursorStore.clear() + sync trigger
  → 44–75% reconciliation coverage unlocked
  → ~$18.4B additional balance corrections possible

SPRINT S3+:
  → Human review queue for MEDIUM-confidence matches
  → Weekly reconciliation report to management
  → Alert on new UNMATCHED cobros
```

### Why not wait for backfill before Sprint S3
- Sprint S3 value: $14.265B in corrections available TODAY
- Backfill blocker: SAG external dependency (weeks)
- Waiting for backfill delays CEO-visible improvements by 1–4 weeks unnecessarily
- Sprint S3 engine is designed to be idempotent — it will automatically process new cobros when backfill completes

---

## 10. Summary Table

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| When to start Sprint S3 | NOW | 5,167 receivables ready, no blockers |
| When to trigger backfill | After SAG expands v_pagosnew | External dependency, ready to execute |
| Index to add | GIN on rawJson before optimistic backfill | Performance safety |
| Schema migration | Sprint S3 (PaymentAllocation + ReconcileStatus) | Required for write engine |
| Cache invalidation on backfill | NONE | Backfill invisible until Sprint S3 applies cobros |
| Cache invalidation on Sprint S3 | refreshAllCustomerFinancials() | Post-write hook, mirrors existing receivables sync |
| Double-counting guard | PaymentAllocation @@unique([rx, col]) | Critical — prevents re-application |
| Trust layer | SAG saldo (long term) | Short term: dual-layer as per S2_1_IMPLEMENTATION_DECISION.md |
