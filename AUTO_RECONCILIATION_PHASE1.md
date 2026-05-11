# AUTO_RECONCILIATION_PHASE1.md
## Sprint S3 — Phase 1: Automatic Receivable Reconciliation Engine
_Generated: 2026-05-06 | Architecture and design document_

---

## 1. Objective

Apply SAG cobros (CollectionRecord) to CustomerReceivable balances automatically, for HIGH-confidence cases only. Phase 1 covers only deterministic, exact-match associations. No fuzzy matching, no AI heuristics.

**Target:** 5,167 CustomerReceivable rows × up to 11,705 CollectionRecord cobros = estimated $14.265B COP in balance corrections.

---

## 2. Source-of-Truth Model

### Data hierarchy (from most to least authoritative)

```
SAG SQL Server (ultimate authority for balances and payments)
  └── v_pagosnew → CollectionRecord (payment receipts — immutable source)
  └── v_cl/MOVIMIENTOS → CustomerReceivable (invoice balances — ERP-authoritative)

Agentik (derived truth — computed from SAG sources)
  └── CollectionAllocation (audit trail of applied cobros)
  └── CustomerReceivable.paidAmount / balanceDue / status (computed fields)
  └── CustomerProfile.totalReceivable / overdueReceivable (aggregated from above)
```

### What Agentik owns vs. what SAG owns

| Field | Owner | Write authority |
|-------|-------|----------------|
| CollectionRecord.amount | SAG (read-only) | Never overwrite |
| CollectionRecord.rawJson | SAG (read-only) | Never overwrite |
| CustomerReceivable.originalAmount | SAG (read-only) | Never overwrite |
| CustomerReceivable.rawErpJson | SAG (read-only) | Never overwrite |
| CustomerReceivable.paidAmount | Agentik (computed) | Reconciliation engine only |
| CustomerReceivable.balanceDue | Agentik (computed) | Reconciliation engine only |
| CustomerReceivable.status | Agentik (computed) | Reconciliation engine only |
| CustomerReceivable.paidAt | Agentik (computed) | Set when status → PAID |
| CollectionRecord.appliedStatus | Agentik (lifecycle) | Engine marks APPLIED |
| CollectionAllocation (new) | Agentik (audit trail) | Created once, never updated |

### Principle: Agentik is a ledger overlay, not the accounting system

- Agentik NEVER creates or invents payment data
- Agentik ONLY reflects what SAG data implies
- If SAG data contradicts Agentik balance, SAG wins
- A full receivables re-sync overwrites `originalAmount` (SAG-authoritative)
- `paidAmount` and `balanceDue` are re-derived from CollectionAllocation after re-sync

---

## 3. Required Schema Migration

**Justification for migration:** The Sprint S3 write engine cannot be idempotent without an immutable audit table. Without `CollectionAllocation`:
1. Re-running the engine would double-apply cobros to balances
2. Rollback would require full balance reset with no way to reconstruct the correct state
3. Human review cannot identify what has already been applied

**Migration: `20260506000000_collection_allocation`**

Adds one new table (`CollectionAllocation`) and three back-relation fields (on `CollectionRecord`, `CustomerReceivable`, `Organization`). All changes are **purely additive** — zero impact on existing queries.

### New model: `CollectionAllocation`

```prisma
/// Audit trail record for each SAG cobro applied to a CustomerReceivable.
/// Created by the auto-reconciliation engine (Sprint S3, Phase 1).
/// IMMUTABLE after creation — never updated, only created or (in rollback) deleted.
model CollectionAllocation {
  id                 String   @id @default(cuid())
  organizationId     String

  collectionRecordId String   // FK → CollectionRecord (the cobro applied)
  receivableId       String   // FK → CustomerReceivable (the invoice credited)

  amountApplied      Decimal  @db.Decimal(18, 2)  // amount credited to this invoice

  // Pre-application snapshot (frozen at creation — enables rollback and audit)
  balanceBefore      Decimal  @db.Decimal(18, 2)
  balanceAfter       Decimal  @db.Decimal(18, 2)
  paidBefore         Decimal  @db.Decimal(18, 2)
  paidAfter          Decimal  @db.Decimal(18, 2)
  statusBefore       String   // snapshot of CustomerReceivable.status before application
  statusAfter        String   // snapshot of CustomerReceivable.status after application

  // Reconciliation metadata
  ruleUsed           String   // which rule applied this: "MOV_EXACT_MATCH" for Phase 1
  confidence         String   // "HIGH" — Phase 1 only applies HIGH confidence
  appliedBy          String   @default("AUTO")  // "AUTO" or userId for manual overrides

  createdAt          DateTime @default(now())

  // Dedup: each (cobro, invoice) pair is applied exactly once
  @@unique([collectionRecordId, receivableId])
  @@index([organizationId])
  @@index([receivableId])
  @@index([collectionRecordId])
  @@index([organizationId, createdAt])
}
```

---

## 4. Reconciliation Rules (Phase 1)

### Rule: `MOV_EXACT_MATCH`

**Confidence: HIGH**

Triggers when:
1. `CollectionRecord.rawJson.raw.Documento_pagado` is a positive integer N
2. `CustomerReceivable.erpId = "MOV-" + N` exists in the same organization
3. `CollectionRecord.amount > 0`
4. `CustomerReceivable.originalAmount > 0`
5. No `CollectionAllocation` exists with `(collectionRecordId, receivableId)` this pair

This is the ONLY rule for Phase 1.

**What this rule does NOT cover (deferred to Phase 2+):**
- NDs (nota débito): not in CollectionRecord dataset
- NCs (nota crédito): not in CollectionRecord dataset
- Amount proximity matching (e.g., cobro ≈ balance ± 5%)
- Name-based matching
- Date range matching
- AI inference

### Confidence scoring

```
HIGH:
  - Documento_pagado present in rawJson
  - Numeric, positive, non-zero
  - Matched CustomerReceivable.erpId exists
  - CollectionRecord.amount > 0
  - (All Phase 1 applications are HIGH by definition)

MEDIUM (deferred — not applied in Phase 1):
  - Documento_pagado present but no CustomerReceivable match
  - Could mean: payment for MOV outside sync range

LOW (never applied):
  - No Documento_pagado
  - Zero or null Documento_pagado
  - Structural rows (AN code, zero amount)
```

---

## 5. Amount Application Logic

### Single cobro → single receivable

```
cobro.amount = C
receivable.originalAmount = O
receivable.paidAmount (before) = P  // = 0 initially

amountApplied = MIN(C, O - P)       // never exceed remaining balance
newPaidAmount = P + amountApplied   // accumulate payments
newBalanceDue = O - newPaidAmount   // always >= 0

if newBalanceDue == 0:   status = "PAID",    paidAt = now()
elif newPaidAmount > 0:  status = "PARTIAL"
else:                    status = "OPEN"
```

### Multiple cobros → same receivable (partial payments)

Processing order: `collectionDate ASC` (oldest payment first, chronologically correct).

```
Cobro 1 (2020-06-08): amount=$100K  → paidAmount=$100K, balance=$900K, PARTIAL
Cobro 2 (2021-03-15): amount=$400K  → paidAmount=$500K, balance=$500K, PARTIAL
Cobro 3 (2022-11-01): amount=$500K  → paidAmount=$1M,   balance=$0,    PAID
```

Each cobro creates one `CollectionAllocation`. `CustomerReceivable.paidAmount` accumulates.

### Over-application protection

If `SUM(all cobro amounts) > originalAmount`:
- `paidAmount` is capped at `originalAmount`
- `balanceDue` = 0 (never negative)
- `status` = "PAID"
- Excess is logged in `CollectionAllocation.amountApplied` with a note: the `balanceAfter` = 0 even if `paidBefore + amountApplied > originalAmount`

This can happen when cobros in the database represent payments for an invoice that SAG has since modified or cancelled. SAG saldo remains authoritative; re-sync will correct `originalAmount`.

---

## 6. ND (Nota Débito) Application Logic

**Phase 1 status: NOT APPLICABLE**

NDs increase the receivable balance (debit notes). They are NOT captured in the current `CollectionRecord` dataset from `v_pagosnew`. The `Codigo_Fuente_Comprobante` values captured are: `R1, R2, RS, RC, RG, RA, SI, AN` — none of these are ND codes.

If future SAG view expansion includes ND codes, Phase 2 will handle them as:
```
If relationType == "ND":
  newBalanceDue = currentBalanceDue + ND.amount
  newStatus = "OPEN"  // an ND never marks an invoice as PAID
```

---

## 7. Idempotency Rules

The engine is fully idempotent. Running it N times produces the same result as running it once.

### Mechanism 1: CollectionAllocation unique constraint

```prisma
@@unique([collectionRecordId, receivableId])
```

If the engine attempts to create a `CollectionAllocation` for a pair that already exists, the DB will reject the insert. The engine catches this and skips the pair — no double-application.

### Mechanism 2: CollectionRecord.appliedStatus filter

After applying a cobro, `appliedStatus` is set to `APPLIED` (or `PARTIALLY_APPLIED` if only partial amount was used). The engine's default query filters `WHERE appliedStatus = AVAILABLE`, naturally skipping already-processed cobros.

### Mechanism 3: CustomerReceivable state validation

Before updating, the engine checks: if `receivable.paidAmount >= receivable.originalAmount`, the invoice is already fully paid → skip without error.

---

## 8. Audit Trail Strategy

### CollectionAllocation (primary audit trail)

Every application creates one immutable `CollectionAllocation` row with:
- Exact amounts applied
- Before/after snapshots of `balanceDue` and `paidAmount`
- Before/after status snapshots
- Rule used and confidence level
- Timestamp

### Reconstructability

Given only `CollectionAllocation` rows, the full history of how a receivable reached its current balance can be reconstructed:
```
SELECT * FROM CollectionAllocation WHERE receivableId = ?
ORDER BY createdAt ASC
```

### Complete audit query

```sql
SELECT
  cr.erpId,
  cr.customerName,
  cr.originalAmount,
  cr.paidAmount,
  cr.balanceDue,
  cr.status,
  ca.amountApplied,
  ca.balanceBefore,
  ca.balanceAfter,
  ca.ruleUsed,
  ca.confidence,
  ca.createdAt,
  col.amount AS cobroAmount,
  col.comprobanteCode,
  col.collectionDate
FROM CustomerReceivable cr
JOIN CollectionAllocation ca ON ca.receivableId = cr.id
JOIN CollectionRecord col ON col.id = ca.collectionRecordId
WHERE cr.organizationId = $1
ORDER BY cr.erpId, ca.createdAt ASC
```

---

## 9. Safe Rollback Strategy

### Level 1: Rollback a single (cobro, receivable) pair

```typescript
await prisma.$transaction(async (tx) => {
  const alloc = await tx.collectionAllocation.findUnique({
    where: { collectionRecordId_receivableId: { collectionRecordId, receivableId } }
  });
  if (!alloc) throw new Error("Allocation not found");

  // Restore receivable to pre-application state
  await tx.customerReceivable.update({
    where: { id: receivableId },
    data: {
      paidAmount: alloc.paidBefore,
      balanceDue: alloc.balanceBefore,
      status:     alloc.statusBefore,
      paidAt:     alloc.statusBefore !== "PAID" ? null : undefined,
    },
  });

  // Mark cobro as available again
  await tx.collectionRecord.update({
    where: { id: collectionRecordId },
    data:  { appliedStatus: "AVAILABLE", appliedAt: null, appliedBy: null },
  });

  // Delete the allocation record
  await tx.collectionAllocation.delete({
    where: { collectionRecordId_receivableId: { collectionRecordId, receivableId } }
  });
});
```

### Level 2: Rollback all Phase 1 auto-applications for an org

```typescript
// Delete all CollectionAllocation rows created by "AUTO" for this org
// Restore CustomerReceivable to paidAmount=0, balanceDue=originalAmount, status="OPEN"
// Reset CollectionRecord.appliedStatus to AVAILABLE
```

This is a last-resort operation. It should only be performed by engineering.

### Level 3: What re-sync does (not a rollback but a correction)

When `v_pagosnew` is expanded and a full collections re-sync runs, new `CollectionRecord` rows appear. The next reconciliation engine run processes them. `CustomerReceivable` balances accumulate further.

When a full receivables re-sync runs, `CustomerReceivable.originalAmount` is refreshed from SAG. This may change the balance. The engine does NOT automatically re-run after a receivables sync — it must be triggered explicitly.

---

## 10. Edge Cases

| Case | Detection | Handling |
|------|-----------|---------|
| Cobro references non-existent receivable | `erpId` not found | Skip, log as MEDIUM (no match) |
| Cobro amount > receivable original balance | `C > O` | Cap at O, flag in allocation |
| Multiple cobros sum > original balance | cumulative check | Cap at O, status = PAID |
| Receivable already at paidAmount = originalAmount | check before update | Skip, log "ALREADY_PAID" |
| `originalAmount <= 0` (SISTECREDITO zero rows) | `O <= 0` check | Skip entirely |
| `Documento_pagado = 0` | zero guard in parser | Skip (EMPTY strategy) |
| CollectionRecord with `amount = 0` | amount guard | Skip (excluded by COLLECTIONS_QUERY filter) |
| Same `CollectionAllocation` attempted twice | DB unique constraint | Error caught → skip |
| Receivable status is "WRITTEN_OFF" | status check | Skip (written-off balance not recoverable) |
| Missing customer linkage (`customerId = null`) | no block | Proceed — customerId not required for reconciliation |
| Receivable currency ≠ COP | currency check | Skip for Phase 1 (all current data is COP) |

---

## 11. Downstream Impact After Engine Run

After the write engine updates `CustomerReceivable`, the following must be refreshed:

| Consumer | Stale field | Refresh action |
|----------|-------------|---------------|
| `CustomerProfile.totalReceivable` | Yes | `refreshAllCustomerFinancials(orgId)` |
| `CustomerProfile.overdueReceivable` | Yes | Same |
| Cartera KPIs (`cartera-kpis.ts`) | Yes | Reads live from CustomerReceivable — auto-fresh on next request |
| B1/B2 executive dashboard | Yes | Auto-fresh on next page load |
| Alert engine thresholds | Yes | `generateCarteraAlerts(orgId)` |
| CRM scoring (`churnRisk`) | Yes | `runScoringForOrg(orgId)` |

**Required post-engine hook:**
```typescript
await refreshAllCustomerFinancials(orgId);
// This is the same hook used after receivables sync — safe to reuse
```

---

## 12. Operational Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Cobro amount exceeds receivable → negative balance | HIGH | Cap at originalAmount; never allow negative balanceDue |
| Re-running engine after partial run → double-apply | HIGH | CollectionAllocation unique constraint prevents |
| SAG re-sync resets originalAmount → mismatched balance | MEDIUM | Log variance; reconciliation engine can detect mismatch on next run |
| Customer profile not linked → reconciliation skipped | LOW | Not a blocker; works by erpId join, not customerId |
| v_pagosnew returns duplicate rows → duplicate cobros | LOW | CollectionRecord naturalKey dedup prevents duplicate rows |
| Finance team disputes automated application | MEDIUM | Rollback at Level 1 available; audit trail shows exact amounts and rules |

---

## 13. File Structure

```
lib/reconciliation/
  applied-facts-parser.ts     ← EXISTING (S2.1) — unchanged
  shadow-reconciliation.ts    ← EXISTING (S2.1) — unchanged
  reconciliation-rules.ts     ← NEW (S3) — rule definitions and validators
  reconciliation-engine.ts    ← NEW (S3) — core reconciliation logic
  reconciliation-audit.ts     ← NEW (S3) — audit queries and reporting

scripts/
  _dry_run_auto_reconciliation.ts  ← NEW (S3) — no mutations, full simulation
  _apply_auto_reconciliation.ts    ← NEW (S3) — safe execution with transactions

prisma/
  schema.prisma               ← MODIFIED: + CollectionAllocation model
  migrations/20260506000000_collection_allocation/migration.sql ← NEW
```

---

## 14. Phase 2 Preview (Not This Sprint)

Phase 2 will add:
- MEDIUM confidence matching (human review queue)
- ND (nota débito) balance increases when SAG view expands
- NC (nota crédito) balance reductions
- Human review UI for disputed applications
- Scheduled reconciliation cron (weekly)
- Reconciliation quality dashboard
- SAG saldo cross-validation (compare Agentik-computed balance to SAG cartera saldo)
