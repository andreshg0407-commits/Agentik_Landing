# APPLIED_FACTS_DISCOVERY.md
## Sprint S2.1 — Phase A: appliedFacts Raw Discovery
_Generated: 2026-05-05 | Based on real production data: Castillitos tenant_

---

## Executive Finding

**`CollectionRecord.appliedFacts` is NULL for 100% of production rows.** This is not a data gap — it is a mapper bug. The actual invoice association data is present in every row via `rawJson.raw.Documento_pagado`, a field the current mapper does not read.

The reconciliation foundation must be rebuilt on `Documento_pagado`, not `appliedFacts`.

---

## 1. Dataset Summary

| Metric | Value |
|--------|-------|
| Total CollectionRecord rows | 20,534 |
| Rows with `appliedFacts != NULL` | **0 (0.0%)** |
| Rows with `rawJson.raw.Documento_pagado` populated | **20,534 (100%)** |
| Date range covered | 2020 – 2026 |
| Distinct comprobanteCode values | R1, R2, RS, RC, RG, RA, SI |

### Distribution by comprobanteCode
| Code | Rows | Description |
|------|------|-------------|
| R1 | 12,693 | Cobros empresa Fuente 1 (official invoices) |
| R2 | 5,972 | Cobros empresa Fuente 2 / remisiones |
| RS | 1,099 | Recaudos almacén (POS) |
| RA | 499 | Recaudos almacén (POS) |
| RG | 180 | Recaudos almacén (POS) |
| RC | 90 | Recaudos almacén (POS) |
| SI | 1 | Retail financiero (Sistecredit) |

---

## 2. Root Cause: Why appliedFacts is Always NULL

### Mapper code (lib/connectors/adapters/sag-pya-soap/mappers.ts, lines 606-611):
```typescript
// CURRENT (broken):
const invoiceRef =
  str(row, "Numero_Factura") ?? str(row, "numero_factura") ??
  str(row, "Factura")        ?? str(row, "factura");
const appliedFacts = invoiceRef
  ? [{ invoiceNumber: invoiceRef, amount }]
  : undefined;
```

### SAG v_pagosnew actual fields (confirmed from rawJson.raw):
| Field | Present | Value format | Example |
|-------|---------|-------------|---------|
| `Documento_pagado` | 100% | Numeric integer | `10329`, `1478`, `8145` |
| `Numero_Factura` | 0% | — | Not in view |
| `Numero_Documento` | 100% | Numeric integer | Payment receipt number |
| `Valor_Pagado` | 100% | Positive decimal | `391913`, `2560800` |
| `Fecha_Documento` | 100% | ISO datetime | `2026-03-15T00:00:00` |
| `Codigo_Fuente_Comprobante` | 100% | Short code | `R1`, `R2`, `RS` |
| `Ka_Nl_Tercero` | 100% | Numeric SAG FK | `526`, `1204` |
| `Nit_Tercero` | 100% | Numeric NIT | `800123456` |
| `Nombre_Tercero` | 100% | String | `MYRIAM BARREIRO GONZALEZ` |

**The mapper reads `Numero_Factura` which does not exist in this SAG view. `Documento_pagado` is the correct invoice reference field and is present in every row.**

---

## 3. appliedFacts Format Classification

Since `appliedFacts` is universally NULL, format classification applies to the field's _design intent_ vs actual state:

| Format | Count | Notes |
|--------|-------|-------|
| `null` (SQL NULL) | 20,534 (100%) | Mapper never populates it |
| `[{ invoiceNumber, amount }]` (intended) | 0 | Would be populated if `Numero_Factura` existed |
| Empty array `[]` | 0 | — |
| String blob | 0 | — |
| Malformed | 0 | — |

**% parseable:** 0% (nothing to parse)
**% empty/null:** 100%

---

## 4. Documento_pagado — The Real Invoice Association Signal

### Value characteristics (n=20,534):
- **Format:** Numeric integer, always positive, never zero
- **Range:** ~140 to ~10,800 (SAG MOVIMIENTOS PK range)
- **Presence:** 100% of rows
- **Distinct values:** 9,273 unique invoice references from 20,534 cobros
- **Numeric only:** 100% (no alphanumeric, no prefixes)

### Samples (real data, recent records):
```
[R1] Documento_pagado=10329  Valor_Pagado=391913   customer="JULIANA GIRALDIO"
[R1] Documento_pagado=10602  Valor_Pagado=1114383  customer="MYRIAM BARREIRO GONZALEZ"
[R1] Documento_pagado=1478   Valor_Pagado=160010   customer="JENIFFER GAMARRA DIAZ"
[R1] Documento_pagado=1478   Valor_Pagado=30000    customer="JENIFFER GAMARRA DIAZ"  ← partial payment
[R2] Documento_pagado=8145   Valor_Pagado=2560800  customer="Arlex de Jesús Giraldo"
[R1] Documento_pagado=10501  Valor_Pagado=7577552  customer="MUNDO SWEET SAS"
```

---

## 5. Invoice Reference Cross-Check: Documento_pagado → CustomerReceivable

The join key is: `"MOV-" + Documento_pagado` → `CustomerReceivable.erpId`

(CustomerReceivable.erpId is stored as `"MOV-{ka_nl_movimiento}"`)

### Coverage metrics:

| Metric | Value |
|--------|-------|
| Unique Documento_pagado values (all time) | 9,273 |
| CustomerReceivable rows (total) | 124,998 |
| CustomerReceivable rows matched via erpId | 5,167 |
| **Cobro-to-invoice join rate** | **55.7%** |
| Receivable rows touched by at least one cobro | 4.1% of all receivables |

### Why 55.7%, not higher?
- 44.3% of cobros reference invoices NOT in `CustomerReceivable` table
- Likely reasons: invoices were already archived/closed before current sync window; historical invoices not yet backfilled; RS/RC/RG/RA POS codes reference POS receipts, not formal invoices

### Confirmed: All matched receivables have `paidAmount = 0`
Every CustomerReceivable matched via this join has `paid = 0` in Agentik. This confirms RISK-PAY-02 from the architecture audit: SAG cobros have never been applied to receivable balances.

---

## 6. Partial Payment Detection

SAG encodes partial payments as multiple `CollectionRecord` rows referencing the same `Documento_pagado`.

| Metric | Value |
|--------|-------|
| Invoices with multiple cobro rows | **5,342** |
| % of distinct invoices with partial payments | **57.6%** (5,342 / 9,273) |
| Maximum cobros on a single invoice | 22 (Documento_pagado=378) |

### Top partial-payment invoices:
| Invoice | Cobro count | Implication |
|---------|-------------|-------------|
| 378 | 22 | Very long payment history |
| 7105 | 15 | 15 partial payments |
| 180 | 14 | Long-standing account |
| 643 | 14 | Frequent partial payer |
| 5994 | 14 | Large invoice, installments |

**Implication for reconciliation:** Any engine must SUM all cobros for a given `Documento_pagado` to compute total applied amount. A single-match strategy will undercount payments by an average of 2.2× for partially-paid invoices.

---

## 7. ND / Note Detection

No `ND` (nota débito) records were found in the 20,534 CollectionRecord rows. All records carry final cobro codes (R1/R2/RS/RC/RG/RA/SI). ND records likely arrive via a different SAG view (`v_notas_debito` or similar) not yet integrated.

**Impact on reconciliation:** ND amounts are not captured in CollectionRecord. Discount applications (notas crédito) are also absent. Shadow reconciliation will show variance equal to any NC/ND amounts not in this dataset.

---

## 8. saldo Logic

SAG `v_pagosnew` does not provide a running `saldo` (remaining balance) field. The balance after each cobro must be computed by Agentik:

```
remaining_balance = CustomerReceivable.originalAmount
                  − SUM(CollectionRecord.amount WHERE rawJson.Documento_pagado = invoice_erpId_suffix)
```

This computation is only valid when all cobros for an invoice are present in CollectionRecord. Historical completeness must be verified via temporal coverage analysis.

---

## 9. Mapper Fix Required (Sprint S2.2)

**File:** `lib/connectors/adapters/sag-pya-soap/mappers.ts`, lines 606-611

**Before (broken):**
```typescript
const invoiceRef =
  str(row, "Numero_Factura") ?? str(row, "numero_factura") ??
  str(row, "Factura")        ?? str(row, "factura");
const appliedFacts = invoiceRef
  ? [{ invoiceNumber: invoiceRef, amount }]
  : undefined;
```

**After (fixed):**
```typescript
const invoiceRef =
  str(row, "Documento_pagado") ?? str(row, "documento_pagado") ??
  str(row, "DOCUMENTO_PAGADO") ??
  // Legacy fallback: Numero_Factura (absent in v_pagosnew but may exist in other views)
  str(row, "Numero_Factura")   ?? str(row, "numero_factura")   ??
  str(row, "Factura")          ?? str(row, "factura");
const appliedFacts = invoiceRef && invoiceRef !== "0"
  ? [{ invoiceNumber: invoiceRef, amount }]
  : undefined;
```

**Note:** Fixing the mapper will populate `appliedFacts` for all future syncs. Historical records will need a re-sync or a backfill script to populate `appliedFacts` retroactively. Until then, the parser must read from `rawJson.raw.Documento_pagado` directly.

---

## 10. Confidence Assessment

| Reconciliation signal | Availability | Confidence |
|----------------------|-------------|-----------|
| `rawJson.raw.Documento_pagado` | 100% of rows | HIGH — SAG-authoritative |
| `rawJson.raw.Valor_Pagado` | 100% of rows | HIGH — confirmed real amount field |
| `rawJson.raw.Nit_Tercero` | 100% of rows | HIGH — real NIT |
| `rawJson.raw.Ka_Nl_Tercero` | 100% of rows | HIGH — SAG internal PK |
| `CollectionRecord.appliedFacts` | 0% of rows | N/A — always NULL |
| `CustomerReceivable.erpId` join | 55.7% coverage | HIGH for matched, gap for unmatched |

---

## 11. Recommendations for Parser Design

1. **Primary signal:** Read `Documento_pagado` from `rawJson.raw` (not from `appliedFacts`)
2. **Join key:** `"MOV-" + Documento_pagado` → `CustomerReceivable.erpId`
3. **Aggregation:** SUM all cobros per `Documento_pagado` to handle partial payments
4. **Exclusion:** Skip cobros where `Documento_pagado = 0` (structural zero — no associated invoice)
5. **Fallback:** When no CustomerReceivable match found, classify as `UNMATCHED` with `LOW` confidence
6. **Future:** Fix mapper to populate `appliedFacts.invoiceNumber = Documento_pagado` on next sync
