# S2_1_IMPLEMENTATION_DECISION.md
## Sprint S2.1 — Final Implementation Decision Report
_Generated: 2026-05-05 | Based on real production data_

---

## 1. Can Reconciliation Become Mostly Automatic?

**Yes — but not yet. The blocker is SAG sync scope, not code.**

The parser and shadow engine work correctly. The join key (`"MOV-" + Documento_pagado` → `CustomerReceivable.erpId`) is confirmed reliable at 57% coverage. The problem is that `CollectionRecord` only covers SAG invoice MOV IDs ~140–10,800, while the majority of open balance lives in MOV IDs 98,000–264,000+ — a completely different historical range.

**Current auto-reconciliation potential: ~4.1% of receivables ($157M COP)**
**After extended SAG sync: potentially 55-75% of receivables**

The path to mostly-automatic reconciliation requires:
1. Extended v_pagosnew sync (cover full SAG history, not just recent slice)
2. Sprint S3 write engine (apply the already-validated join to update balances)
3. Human review queue for the 44.3% of cobros with no matching receivable

---

## 2. How Reliable Is appliedFacts?

**`appliedFacts` is 0% populated. It does not exist as a data source.**

Root cause: mapper reads `Numero_Factura` (absent from v_pagosnew), SAG provides `Documento_pagado` (present in 100% of rows). The field was never populated.

The real invoice association signal is `rawJson.raw.Documento_pagado`, which is:
- Present: 100% of 20,534 CollectionRecord rows
- Format: pure numeric SAG MOVIMIENTOS PK (e.g. 10329)
- Join key: `"MOV-" + value` → `CustomerReceivable.erpId`
- Reliability: HIGH — SAG-authoritative

**Required mapper fix** (1-line change in `mappers.ts`):
```typescript
// Change:
const invoiceRef = str(row, "Numero_Factura") ?? ...
// To:
const invoiceRef = str(row, "Documento_pagado") ?? str(row, "documento_pagado") ?? str(row, "Numero_Factura") ?? ...
```
After this fix, all future syncs will populate `appliedFacts` correctly. Historical rows need a re-sync or backfill.

---

## 3. What % of Cartera Can Likely Self-Reconcile?

**Current state: 4.1% (5,167 of 124,998 receivables)**

| Scenario | % Reconcilable | Condition |
|----------|---------------|-----------|
| Today, no changes | 4.1% | Current CollectionRecord scope only |
| After mapper fix | 4.1% | Same historical data, appliedFacts now populated |
| After extended SAG sync | 55-75% est. | Depends on how much of SAG history is available in v_pagosnew |
| After full history backfill | 75-90% est. | All SAG cobros in system |

**Breakdown of why 45% is unreachable:**
- Some invoices have no corresponding cobro in SAG (may be paid via bank transfer before SAG capture, or genuinely unpaid)
- Some cobros reference SAG internal document types not in v_pagosnew
- Very old invoices (MOV-7 through MOV-~100) may predate digital cobro tracking in SAG

---

## 4. What Still Requires Humans?

| Scenario | Volume | Why Human Needed |
|----------|--------|-----------------|
| Multiple open receivables, one cobro | Unknown | Ambiguous split — business decides priority |
| Cobro amount ≠ receivable balance | 5,342 partial-payment cases | Human confirms if remainder stays open or is written off |
| No Documento_pagado match (44% of cobros) | ~9,000 cobros | Either wrong sync scope or genuinely orphan payments |
| Negative original amount receivables | SISTECREDITO type | Data integrity audit required |
| Very old legacy balances (MOV < 200) | 17+ receivables | Finance team decision: current debt or write-off |
| ND/NC adjustments | Unknown | Not captured in current CollectionRecord dataset |
| OVERPAID receivables | 0 today | Would indicate cobros exceeding invoice — review required |

---

## 5. Safest Rollout Strategy

### Phase 1: Dry-run (NOW — no schema changes)
**Status: COMPLETE via shadow engine**
- `shadow-reconciliation.ts` already implements this
- Run `_shadow-recon-audit.ts` after each sync to measure reconciliation quality
- No production mutations

### Phase 2: Shadow mode (Sprint S2.2 prerequisite)
**Preconditions:**
1. Fix mapper to read `Documento_pagado` (1-line change)
2. Re-run full SAG cobro sync to populate `appliedFacts` correctly
3. Extend v_pagosnew sync window to cover higher MOV ranges

**Actions:**
- Log reconciliation matches without writing
- Build audit trail: `ReconcileEvent` log (see RECONCILIATION_FLOW_ARCHITECTURE.md)
- Measure match quality daily via `_shadow-recon-audit.ts`

### Phase 3: Assisted mode (Sprint S3 — schema migration required)
**Preconditions:** Shadow mode running for 2+ weeks with stable match rates

**Actions:**
- Add `reconcileStatus` to `CollectionRecord`
- Write engine creates `PaymentAllocation` for HIGH-confidence matches only
- Human review UI for MEDIUM-confidence matches
- Finance team reviews output weekly

### Phase 4: Production mode (Sprint S4+)
**Preconditions:** Assisted mode stable for 2+ billing cycles

**Actions:**
- Extend to MEDIUM-confidence auto-apply
- Weekly reconciliation report to management
- Alert on new UNMATCHED cobros (no receivable found)

---

## 6. Should Agentik Trust SAG Balances, Recompute, or Dual-Layer?

**Recommendation: Dual-layer validation in the short term, then trust SAG balances.**

### Current state: Trust neither
- `CustomerReceivable.balanceDue` = originalAmount (never updated) → DO NOT TRUST
- `CollectionRecord` cobros = real SAG payments → TRUST as payment events
- SAG `saldo` from cartera sync = SAG's own calculation → TRUST as ground truth

### Short term (Sprints S2.2–S3): Dual-layer
```
Trust Layer 1 (SAG): CustomerReceivable.originalAmount from cartera sync
Trust Layer 2 (SAG): CollectionRecord cobros from v_pagosnew

Agentik computes:
  theoreticalBalance = originalAmount - SUM(cobro amounts for this invoice)

Compare against:
  Customer-facing display: show theoreticalBalance (not currentBalance)
  Audit: show variance between theoreticalBalance and SAG's cartera saldo
```

### Long term (Sprint S4+): Trust SAG cartera saldo
Once reconciliation engine is stable and cobros are being applied:
- Periodic re-sync of CustomerReceivable from SAG cartera (already implemented)
- SAG's `saldo` becomes the authoritative balance
- Agentik's `balanceDue` = SAG's `saldo` after each sync
- Agentik's `PaymentAllocation` = audit trail only (not the source of truth for balance)

### Never do:
- Override SAG `saldo` with Agentik-computed balance (Agentik is not the accounting system)
- Treat manual `PaymentRecord` entries as more authoritative than SAG cobros
- Apply cobros from CP/B1/B2/H1/H2 pending consignaciones to receivable balances

---

## 7. Deliverables Summary

| Deliverable | Status | Location |
|------------|--------|---------|
| Phase A: Raw discovery | COMPLETE | `APPLIED_FACTS_DISCOVERY.md` |
| Phase B: Canonical parser | COMPLETE | `lib/reconciliation/applied-facts-parser.ts` |
| Validation script | COMPLETE | `scripts/_validate-applied-facts.ts` |
| Phase C: Shadow engine | COMPLETE | `lib/reconciliation/shadow-reconciliation.ts` |
| Phase D: Customer audit | COMPLETE | `SHADOW_RECONCILIATION_AUDIT.md` |
| Phase E: Decision report | COMPLETE (this doc) | `S2_1_IMPLEMENTATION_DECISION.md` |

### Discovery scripts (temporary, can be deleted after review):
- `scripts/_discover-applied-facts.ts` — Phase A data gathering
- `scripts/_cross-check-doc-pagado.ts` — Documento_pagado × CustomerReceivable
- `scripts/_verify-mov-join.ts` — MOV- prefix join verification
- `scripts/_shadow-recon-audit.ts` — Phase D audit runner

---

## 8. Immediate Next Actions (Priority Order)

### 1. Fix the mapper (1 line, zero risk)
**File:** `lib/connectors/adapters/sag-pya-soap/mappers.ts` line ~607
```typescript
// Add Documento_pagado as primary field before Numero_Factura
const invoiceRef =
  str(row, "Documento_pagado") ?? str(row, "documento_pagado") ??
  str(row, "Numero_Factura")  ?? str(row, "numero_factura")  ??
  str(row, "Factura")         ?? str(row, "factura");
```
**Effect:** All future syncs populate `appliedFacts`. The parser immediately upgrades to `APPLIED_FACTS_ARRAY` strategy (HIGH confidence).

### 2. Re-run full cobro sync (operational, no code change)
After mapper fix, trigger a full re-sync of all CollectionRecord rows to populate `appliedFacts` retroactively. This is a data-only operation.

### 3. Extend v_pagosnew sync window (SAG coordination required)
Request from SAG team: extend the query date range in `v_pagosnew` to include cobros for MOV IDs 10,000–300,000. This is the single biggest unlock for reconciliation coverage.

### 4. Merge shadow engine into reconciliation infrastructure
- `lib/reconciliation/applied-facts-parser.ts` → production-ready (no changes needed)
- `lib/reconciliation/shadow-reconciliation.ts` → run weekly as reporting job
- Add `_shadow-recon-audit.ts` to scheduled diagnostic scripts

### 5. Schedule Sprint S3 write engine
Only after steps 1-3 are complete and shadow mode shows stable ≥50% match rate.

---

## 9. Risk Registry Update

| Risk | Before S2.1 | After S2.1 |
|------|-------------|-----------|
| appliedFacts never read | CRITICAL | RESOLVED — parser built |
| Invoice join key unknown | HIGH | RESOLVED — "MOV-" + Documento_pagado confirmed |
| Mapper reads wrong field | UNKNOWN | IDENTIFIED — fix specified (step 1) |
| SAG sync scope gap | UNKNOWN | IDENTIFIED — main blocker for reconciliation |
| Double-counting risk | HIGH | Unchanged — Sprint S3 dedup guard required |
| CustomerReceivable.balanceDue stale | CRITICAL | Unchanged — Sprint S3 will resolve |
| Partial payments invisible | HIGH | RESOLVED — 5,342 detected and modeled |
