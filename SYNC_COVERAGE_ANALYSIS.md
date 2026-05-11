# SYNC_COVERAGE_ANALYSIS.md
## Sprint S2.2 — Phase B: SAG Sync Coverage Analysis
_Generated: 2026-05-06 | Based on real production data: Castillitos tenant_

---

## Executive Summary

CollectionRecord (`v_pagosnew`) contains **20,534 cobros** spanning Documento_pagado values 1–2,000,346. Of those, **97.5% are for Documento_pagado ≤ 10,000** (low MOV range). CustomerReceivable has **124,998 invoices** with erpId MOV-7 to MOV-269,337. Only **5,167 receivables (4.1%) can be matched** to a cobro today. The remaining **119,433 receivables ($31.1B COP)** have no accessible cobro data.

The connector cursor is currently in `date:` incremental mode. The last full sync (2026-05-02, cursorBefore=null) fetched all 27,850 SAG rows in one SOAP call — confirming no Agentik-side truncation. The coverage gap is structural: `v_pagosnew` on SAG's SQL Server simply does not expose cobros for Documento_pagado values 10,001–269,337+ at significant volume.

---

## 1. Connector State at Time of Analysis

| Field | Value |
|-------|-------|
| Connector ID | `cmnhu4hky0000n4y50jlhkfib` |
| Source | `sag_pya_soap` |
| Status | ACTIVE |
| Modules | `["customers","receivables","movements"]` |
| Collections cursor | `date:2026-04-30T05:00:00.000Z` |
| Cursor mode | INCREMENTAL — only new cobros since 2026-04-30 |
| Cursor last updated | 2026-05-02 |

**Note:** `collections` does not appear in the `modules` array, yet sync runs exist and the cursor is persisted. This indicates collections was manually synced via the API or was part of a broader sync operation outside the regular module list.

---

## 2. Last Collections Sync Run (2026-05-02)

| Metric | Value |
|--------|-------|
| Run date | 2026-05-02 |
| cursorBefore | `(null)` — **full sync from scratch** |
| cursorAfter | `date:2026-04-30T05:00:00.000Z` |
| Rows read from SAG | 27,850 |
| Rows imported | 20,554 |
| Rows skipped | 7,296 |
| Rows errored | 0 |
| Status | SUCCESS |

**Critical finding:** `cursorBefore = null` means this was a full sync — ALL of v_pagosnew was fetched in one SOAP call. SAG returned 27,850 raw rows. After Agentik filtering (`Valor_Pagado > 0`, 8 comprobante codes), 20,554 rows were imported. **This is the full extent of what v_pagosnew exposes.**

**Prior failed run (2026-04-30):** `PYA_SAG_ERROR [FALLIDO]: Invalid column name 'Fecha_Pago'. Invalid column name 'Nro_Comprobante'.`
This was the old query before the column name correction. No data was imported on that run.

---

## 3. CollectionRecord Coverage

### Volume and date range

| Metric | Value |
|--------|-------|
| Total rows | 20,534 |
| Date range (collectionDate) | 2020-06-08 → 2026-04-30 |
| Total cobro amount (COP) | **$25,430,149,477** |
| Rows with valid Documento_pagado | 20,534 (100%) |

### Documento_pagado numeric distribution

| Documento_pagado Range | Count | % of Total |
|------------------------|-------|-----------|
| 1 – 1,000 | 4,806 | 23.4% |
| 1,001 – 5,000 | 8,479 | 41.3% |
| 5,001 – 10,000 | 6,729 | 32.8% |
| 10,001 – 20,000 | 517 | 2.5% |
| 100,001+ | 3 | 0.01% |
| **Total** | **20,534** | **100%** |

**97.5% of all cobros reference Documento_pagado ≤ 10,000.** Only 520 cobros reference higher MOV ranges.

### Exact Documento_pagado range

- Minimum: **1**
- Maximum: **2,000,346**

The max value of 2,000,346 likely represents a different SAG document type or a data anomaly (3 rows). The effective meaningful range is 1–10,761.

### By comprobante code

| Code | Count | Amount (COP) |
|------|-------|-------------|
| R1 | 12,693 | $17,737,058,946 |
| R2 | 5,972 | $7,560,846,384 |
| RS | 1,099 | $78,242,505 |
| RA | 499 | $33,998,451 |
| RG | 180 | $14,444,976 |
| RC | 90 | $5,525,125 |
| SI | 1 | $33,090 |

R1 + R2 account for **98.7%** of cobros by count and **99.5%** by value.

---

## 4. CustomerReceivable Coverage

### Volume and range

| Metric | Value |
|--------|-------|
| Total rows | 124,998 |
| erpId range (numeric) | MOV-7 → MOV-269,337 |
| Total original amount (COP) | $32,679,885,952 |
| Total balance due (COP) | $32,679,885,952 (100% stale — balanceDue never updated) |
| All statuses | OPEN (124,998 rows = 100%) |

### CustomerReceivable distribution by MOV range

| MOV Range | Count | Balance Due (COP) | Cobro Data? |
|-----------|-------|-------------------|-------------|
| MOV 1–1,000 | 605 | $253,918,020 | YES |
| MOV 1,001–5,000 | 2,357 | $612,485,283 | YES |
| MOV 5,001–10,000 | 2,603 | $715,328,027 | YES |
| MOV 10,001–20,000 | 4,579 | $810,853,172 | NO (517 cobros in this range) |
| MOV 20,001–50,000 | 11,494 | $4,344,030,646 | NO |
| MOV 50,001–100,000 | 19,582 | $5,809,217,252 | NO |
| MOV 100,001–200,000 | 49,843 | $13,558,779,238 | NO |
| MOV 200,001+ | 33,935 | $6,575,274,314 | NO |

### Summary

| Category | Count | Balance (COP) |
|----------|-------|--------------|
| In cobro coverage zone (MOV 1–10,800) | 5,565 | $1,581,731,331 |
| Outside coverage (MOV 10,801+) | 119,433 | $31,098,154,622 |
| **Coverage rate (by count)** | **4.5%** | — |
| **Coverage rate (by balance)** | **4.8%** | — |

---

## 5. The Coverage Gap

### Quantified gap

| Metric | Value |
|--------|-------|
| CollectionRecord max Documento_pagado | 2,000,346 (3 extreme outliers; effective max = ~10,761) |
| CustomerReceivable max erpId | MOV-269,337 |
| Receivables without ANY cobro data | 119,433 (95.5%) |
| Balance without cobro data | **$31,098,154,622 COP** (~$31.1B) |
| Receivables WITH cobro data | 5,565 (4.5%) |
| Balance with cobro data | $1,581,731,331 COP (~$1.6B) |

### What the gap means in practice

The 119,433 receivables in MOV range 10,801–269,337 hold **$31.1B in open balance**. Agentik cannot determine which of these invoices have been partially or fully paid, because v_pagosnew does not expose payment records for those MOVIMIENTO IDs.

This is not a stale-data problem or a code bug — it is a **structural SAG data access boundary**.

---

## 6. Immediately Reconcilable Receivables (Today)

| Metric | Value |
|--------|-------|
| CustomerReceivable rows with ≥1 matching cobro | **5,167** |
| Total cobros matched | 11,705 |
| Total matched cobro amount (COP) | $14,265,019,748 |
| Match rate (% of all receivables) | **4.1%** |

These 5,167 receivables are ready for the Sprint S3 write engine **today** — the join key is proven, the cobros exist, no additional sync is required.

### Partial payment statistics

| Metric | Value |
|--------|-------|
| Invoices with > 1 cobro (partial payments) | 5,342 |
| Total cobros on partial-payment invoices | 16,603 |
| Average cobros per partial-payment invoice | 3.1× |
| Maximum cobros on one invoice | 22 (Documento_pagado = 378) |

Top partial-payment invoices (by cobro count):

| Invoice | # Cobros | Total Paid (COP) |
|---------|----------|-----------------|
| MOV-378 | 22 | $4,439,390 |
| MOV-7105 | 15 | $3,616,118 |
| MOV-643 | 14 | $8,285,490 |
| MOV-180 | 14 | $12,198,135 |
| MOV-5994 | 14 | $9,880,576 |

---

## 7. Sync Architecture Confirmation

From Phase A + Phase B combined evidence:

| Component | Status | Evidence |
|-----------|--------|---------|
| COLLECTIONS_QUERY (Agentik) | No date filter, no TOP/LIMIT | Code analysis |
| Full sync completion | YES — all v_pagosnew rows fetched | cursorBefore=null on 2026-05-02 run |
| SAG rows returned | 27,850 | Run log: rowsRead=27850 |
| Rows after dedup/filter | 20,534 | Current CollectionRecord count |
| maxPages constraint | None (Infinity) | sync/route.ts: only receivables get maxPages:20 |
| Cursor state | Incremental (date-based) | `date:2026-04-30T05:00:00.000Z` |
| v_pagosnew scope on SAG side | LIMITED to Documento_pagado ≈ 1–10,761 (97.5%) | Observable from data |

**Conclusion:** Agentik correctly imported everything v_pagosnew exposed. The limitation is the SAG view definition.

---

## 8. Historical Coverage Gap — Root Cause Scenarios

### Scenario A: v_pagosnew is date-bounded on SAG side (HIGH probability)
The view may only expose cobros for invoices created before a certain date. MOVIMIENTOS 1–10,761 correspond to invoices from an earlier SAG operating period. Newer invoices (10,762+) generate cobros in the live SAG system that a different view or table exposes.

**Test:** Ask SAG team if v_pagosnew has a WHERE clause restricting by Fecha_Documento or ka_nl_movimiento range.

### Scenario B: v_pagosnew was created for a legacy migration (MEDIUM probability)
The "new" in v_pagosnew may refer to a migration event (e.g., "new SAG instance cobros"). A separate view (`v_pagos`, `v_pagosnew2`, or `v_cobros`) may cover the modern period.

**Test:** Request SAG to run `SELECT COUNT(*) FROM v_pagos` or similar view names.

### Scenario C: MOVIMIENTOS 10,762–269,337 are genuinely unpaid (LOW probability)
The $31.1B in receivables at those MOV IDs may truly represent zero cobros — open balances with no payment history. This would imply Castillitos has massive uncollected debt.

**Evidence against:** INDUSTRIAS DIANA ALZATE SAS holds $7.7B of this balance and is an active customer. Industry-normal collection patterns make it implausible they have zero payments in 6+ years.

---

## 9. What a v_pagosnew Scope Expansion Would Unlock

If SAG expands v_pagosnew (or provides an additional view) to cover Documento_pagado values 10,762–269,337:

| Metric | Current | After Expansion (est.) |
|--------|---------|----------------------|
| Reconcilable receivables | 5,167 (4.1%) | 55,000–90,000 (44–72%) |
| Reconcilable balance | $1.6B | $15B–$25B |
| Uncovered receivables | 119,433 | 35,000–70,000 |
| Auto-reconciliation rate | 4.1% | 55–75% |

These estimates assume the expanded view follows the same structural pattern and that cobros exist for the higher MOV range.

---

## 10. Immediate Actions (Prioritized)

### 1. SAG team inquiry (required — no code change needed)
Send request to SAG team:
> "La vista `v_pagosnew` retorna pagos con `Documento_pagado` máximo ≈ 10,761.
> Tenemos facturas (`MOVIMIENTOS`) hasta ka_nl_movimiento = 269,337.
> Por favor, ¿pueden ampliar `v_pagosnew` para incluir todos los cobros históricos,
> o indicarnos qué vista o tabla contiene los pagos para `ka_nl_movimiento > 10,761`?"

### 2. Cursor reset protocol (ready when SAG expands view)
```
cursorStore.clear(connectorId, "collections")
→ next sync will re-fetch all rows from expanded v_pagosnew
→ new rows upserted via naturalKey dedup (no duplicates)
→ expect 10x–30x more rows after expansion
```

### 3. Sprint S3 write engine (no expansion needed — start today)
The 5,167 matchable receivables can have cobros applied NOW. Don't wait for expansion to begin Sprint S3. See `S2_1_IMPLEMENTATION_DECISION.md` sections 1 and 8.

### 4. Mapper fix prerequisite (1-line change)
Fix `lib/connectors/adapters/sag-pya-soap/mappers.ts` to read `Documento_pagado` before `Numero_Factura`. Required for future syncs to populate `appliedFacts` correctly. See `S2_1_IMPLEMENTATION_DECISION.md` section 8.1.

---

## 11. Deliverables This Phase

| Deliverable | Status | Location |
|------------|--------|---------|
| Phase A: Connector audit | COMPLETE | `SAG_SYNC_AUDIT.md` |
| Phase B script 1: sync coverage | COMPLETE | `scripts/_analyze-sync-coverage.ts` |
| Phase B script 2: range audit | COMPLETE | `scripts/_movement-range-audit.ts` |
| Phase B: Coverage analysis | COMPLETE (this doc) | `SYNC_COVERAGE_ANALYSIS.md` |
