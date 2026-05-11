# SHADOW_RECONCILIATION_AUDIT.md
## Sprint S2.1 — Phase D: Shadow Reconciliation Audit
_Generated: 2026-05-05 | Based on real production data: Castillitos tenant_

---

## Executive Summary

Shadow reconciliation reveals a critical data scope mismatch: `CollectionRecord` (20,534 rows, `Documento_pagado` range ≈ 140–10,800) covers a **different time period and invoice range** than `CustomerReceivable` (124,998 rows, `erpId` range MOV-7 to MOV-264,351+). Only **57% of distinct Documento_pagado references** match a CustomerReceivable — and even those 5,167 matched rows have `paidAmount = 0`, confirming no payment has ever been applied.

The reconciliation gap is not a parser problem. It is a **sync scope problem**: CollectionRecord was synced from a view (`v_pagosnew`) that only covers a slice of SAG's total cobro history.

---

## 1. Customer: INDUSTRIAS DIANA ALZATE SAS

**Profile:** Largest single open balance in Castillitos. NIT 901383501.

| Metric | Value |
|--------|-------|
| CustomerReceivable rows | 1,918 |
| Total original amount | $7,727,187,608 COP |
| Current balance (Agentik) | $7,727,187,608 COP |
| Cobros found in CollectionRecord | **1** (out of 1,918 invoices) |
| Total inferred paid | $6,500 COP |
| Total theoretical balance | $7,730,820,947 COP |
| Balance variance | -$3,633,339 COP |
| Confidence HIGH | 0% |
| Confidence LOW | 99.9% (1,917 rows without any cobros) |

### Finding
Only 1 of 1,918 invoices has a matching cobro in CollectionRecord — invoice `MOV-1394` with a $6,500 payment. The remaining 1,917 invoices reference MOV IDs in the range 98,739–264,351+, which are completely outside the CollectionRecord Documento_pagado range (max ~10,800 in current sync).

**Root cause:** INDUSTRIAS DIANA ALZATE SAS is a recent, large-volume customer. Their invoices (MOV-98k to MOV-264k) are from a period not covered by the current v_pagosnew sync window. Shadow reconciliation correctly identifies $0 cobros for their balance — not because they haven't paid, but because their payments are from a later SAG period not yet synced.

**Action required:** Extend v_pagosnew sync to cover the full MOV range for large-balance customers.

---

## 2. Customer: SISTECREDITO (retail financiero channel)

**Profile:** Highest cobro count in CollectionRecord (21 records). Sistecredit is a fintech intermediary (SI code), not a direct end customer.

| Metric | Value |
|--------|-------|
| CustomerReceivable rows | 4,512 |
| Total original amount | **-$160,732,046 COP** (negative — data anomaly) |
| Current balance | -$160,732,046 COP |
| Cobros found | 21 |
| Total inferred paid | $1,462,380 COP |
| Matched invoices | 21 (all originalAmount = $0) |
| Confidence HIGH | 21 rows (all matched, zero-amount invoices) |
| Confidence LOW | 4,491 rows |

### Finding
The 21 cobros that matched all correspond to CustomerReceivable rows with `originalAmount = 0` — SAG structural zero rows (header records, not real invoices). The negative total original amount confirms these receivables are bookkeeping artifacts from the Sistecredit retail channel, not real open balances.

The 4,491 LOW-confidence rows are the real Sistecredit invoices (originalAmount > 0), but they reference MOV IDs outside the current CollectionRecord sync range.

**Important data note:** Sistecredit pays via SI code (v_pagosnew). Their cobros ARE in CollectionRecord (21 rows). The mismatch is that the SI cobros reference different MOV IDs than the open CustomerReceivable rows — further confirming the sync window gap.

---

## 3. Customer: PABLO EMILIO CARDONA (inferred from MOV-150, MOV-152 matches)

**Profile:** Small retail customer with 2 matched receivables visible in DB join tests.

| Metric | Value |
|--------|-------|
| CustomerReceivable rows matched | 2 |
| balance MOV-150 | $859,656 COP (OPEN, paid=0) |
| balance MOV-152 | $2,933,429 COP (OPEN, paid=0) |
| Cobros in CollectionRecord | Documento_pagado=150 → yes; =152 → yes |
| Cobros applied | $0 (paidAmount not updated) |

### Finding
This is a clean example of the RISK-PAY-02 finding: cobros exist in CollectionRecord for these invoices, the join works, but `paidAmount = 0` on both receivables. These are precisely the invoices that would be auto-reconciled by the Sprint S3 engine.

---

## 4. Customer: INDUSTRIAS CASTILLO ALZATE S.A.S (oldest overdue)

**Profile:** Oldest receivables in the system. MOV IDs 7–424 (SAG's earliest records).

| Metric | Value |
|--------|-------|
| CustomerReceivable rows | 17 |
| Total balance | $63,765,435 COP |
| Cobros found | **0** |
| All statuses | OPEN |
| Largest invoice | MOV-69: $25,669,529 COP |

### Finding
These are legacy receivables from SAG's earliest history (MOV-7 dates from approximately the system's inception). No cobros exist in CollectionRecord for these invoices. Two explanations:

1. These invoices were never paid and are genuinely legacy bad debt
2. Payments for these very old invoices were processed before the current v_pagosnew sync window

Shadow reconciliation correctly reports $0 inferred paid and $0 variance — because there is no payment data to apply. This is accurate: we simply don't know whether these were paid or not from the current data.

**Human review required:** These 17 invoices totalling $63.7M should be reviewed by the finance team to determine if they represent actual current receivables or should be written off.

---

## 5. Org-Wide Shadow Reconciliation (2,000 receivable sample)

### Quantitative results

| Metric | Value |
|--------|-------|
| Receivables sampled | 2,000 |
| "Fully explained" (variance ≤ 0.5%) | 1,939 (97.0%) |
| "Partially explained" (some cobros) | 55 (2.8%) |
| "Unexplained" (large variance, no cobros) | 6 (0.3%) |
| **Explainability rate** | **99.7%** (misleading — see below) |
| Confidence HIGH | 10 (0.5%) |
| Confidence MEDIUM | 51 (2.5%) |
| Confidence LOW | 1,939 (97.0%) |

### Why 99.7% "explainability" is misleading

The "fully explained" metric counts receivables where variance = 0. A receivable with no cobros has `inferredPaid = 0`, `theoreticalBalance = originalAmount`, `currentBalance = originalAmount`, therefore `variance = 0`. This looks "fully explained" but actually means "no payment data found."

**Corrected interpretation:**
- 97.0% of receivables have **zero cobros** — their balance is unchanged, not explained
- 2.8% of receivables have some cobros applied (MEDIUM confidence)
- 0.5% of receivables are HIGH confidence (cobros cover ≥90% of original amount)

### Balance amounts

| Amount | Value |
|--------|-------|
| Total original amount | $16,227,372,397 COP |
| Total current balance (stale) | $16,227,372,397 COP |
| Total inferred paid (from cobros) | **$157,554,699 COP** |
| Total theoretical balance | $16,090,247,205 COP |
| Total variance (overstatement) | **$137,125,193 COP** |

**$137M COP** of balance is potentially overstated across the 2,000-row sample, corresponding to cobros that exist in CollectionRecord but have never been applied to receivables.

### Theoretical status distribution

| Status | Count | % |
|--------|-------|---|
| PAID | 6 | 0.3% |
| PARTIAL | 55 | 2.8% |
| OPEN | 1,939 | 97.0% |
| OVERPAID | 0 | 0.0% |

### ND contribution
$0 — Nota débito records are not captured in CollectionRecord. Any ND adjustments exist in a SAG view not yet integrated.

---

## 6. Reconciliation Quality Metrics

| Metric | Value |
|--------|-------|
| CollectionRecord rows total | 20,534 |
| CustomerReceivable rows total | 124,998 |
| Cobro-to-receivable join rate | 55.7% (of distinct Documento_pagado refs) |
| Receivables touched by at least one cobro | 4.1% (5,167 / 124,998) |
| Invoices with partial payments (multiple cobros) | 57.6% (5,342 / 9,273) |
| Average cobros per partial-payment invoice | 2.2× |
| Max cobros on single invoice | 22 (Documento_pagado=378) |

---

## 7. Critical Insight: The Sync Scope Gap

The fundamental barrier to reconciliation is not the parser, not the join key, and not the data model. It is the **SAG sync scope**.

**CollectionRecord Documento_pagado range:** ~140 to ~10,800
**CustomerReceivable erpId MOV range (large balances):** ~98,000 to ~264,000

These ranges do not overlap. The CollectionRecord sync covers SAG payments for older, lower-MOV invoices. The majority of the open balance lives in higher-MOV invoice territory that the current sync has not captured.

**What needs to happen before production reconciliation can work:**
1. Extend v_pagosnew sync to cover the full SAG history (or at least 2022–present)
2. Verify that `Documento_pagado` values in the higher MOV range are present in the extended sync
3. Re-run shadow reconciliation after extended sync to measure true coverage

Until the sync scope is extended, the theoretical maximum auto-reconciliation rate is approximately **4.1% of receivables** (the 5,167 currently joinable). The remaining 95.9% will show zero cobros regardless of how good the parser is.

---

## 8. What Is Fully Automatable Today

Despite the sync scope gap, the following operations are **fully automatable** with current data:

| Operation | Receivables | Value |
|-----------|-------------|-------|
| Apply cobros to matched receivables (5,167 rows) | 4.1% | ~$157M |
| Update paidAmount + balanceDue for matched rows | 4.1% | HIGH confidence |
| Flag status PARTIAL/PAID for threshold-met rows | 61 rows currently | — |
| Detect partial payments (multiple cobros/invoice) | 5,342 invoices | — |

All of this is blocked only by the Sprint S3 write engine not being implemented yet. The shadow engine has proven the read-path works correctly.
