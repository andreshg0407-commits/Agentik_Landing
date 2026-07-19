# ORDER TRACEABILITY AUDIT

**Sprint:** COMMERCIAL-DATA-FOUNDATION-01 Phase 4
**Generated:** 2026-07-03
**Tenant:** Castillitos

---

## Objective

Determine if CRM quotes can be reliably traced to SAG orders, establishing
the CRM→SAG order lifecycle as a confirmed data path.

---

## Methodology

1. Extract `rawCrmJson.raw.id_sag_c` from all CRMQuotes
2. Match against `CustomerOrderRecord.erpMovId`
3. Verify stage distribution from `rawCrmJson.raw.stage`
4. Assess reverse lookup (SAG→CRM)

---

## Results

### CRM→SAG Forward Traceability

| Metric | Value | Percentage |
|---|---|---|
| Total CRM Quotes | 285 | 100% |
| Quotes with id_sag_c field | 272 | **95.4%** |
| id_sag_c matches a SAG order | 272 | **100% of those with id_sag_c** |
| Quotes WITHOUT id_sag_c | 13 | 4.6% |

**VERDICT: CONFIRMED.** CRM quotes become SAG orders with 95.4% traceability.
The 13 unmatched quotes are likely Anulado/Pendiente (never reached SAG).

### SAG→CRM Reverse Traceability

| Metric | Value | Percentage |
|---|---|---|
| Total SAG Orders | 9,522 | 100% |
| SAG orders with CRM match | 272 | 2.9% |
| SAG orders without CRM | 9,250 | 97.1% |

This is expected: SAG has 6+ years of order history (2020-2026), while CRM sync
only covers Jan-Mar 2026.

### CRM Stage Distribution (Real Lifecycle)

| Stage | Count | Percentage |
|---|---|---|
| Facturado | 142 | 49.8% |
| Gestionado_Parcialmente | 48 | 16.8% |
| No_Gestionado | 46 | 16.1% |
| Remisionado | 31 | 10.9% |
| Anulado | 12 | 4.2% |
| Pendiente | 5 | 1.8% |
| Confirmado | 1 | 0.4% |

**Note:** The Prisma `CRMQuote.status` enum field shows all DRAFT — it is dead.
The real stage lives in `rawCrmJson.raw.stage`.

### Customer Traceability Through Orders

| Metric | Value |
|---|---|
| CRM quotes with billing_account_id | 281/285 (98.6%) |
| billing_account_id → CustomerProfile.crmId match | 281/281 (100%) |
| Unique customers with CRM orders | ~180 |

---

## Lifecycle Flow (Confirmed)

```
CRM Quote Created
  ↓ (sellerName, billing_account_id, amount)
CRM Quote → SAG Order (via id_sag_c → erpMovId)
  ↓ (95.4% traceability)
SAG Order Processed
  ↓ (status progression in CRM: Pendiente → Gestionado → Remisionado → Facturado)
CRM Stage Updated (rawCrmJson.raw.stage)
```

---

## Implications for Module Development

| Module | Implication |
|---|---|
| **Pedidos** | Can show CRM→SAG traceability badge per order |
| **Vendedores** | CRM sellerName is the reliable seller source (8 sellers) |
| **Control Comercial** | Order traceability = ALTA trust level |
| **Clientes 360** | Can link customers to orders via billing_account_id→crmId |

---

## Blockers

1. **CRM sync stopped since March 2026** — no new quotes being imported
2. **SAG rawJson is empty** — no seller info available in SAG order records
3. **CRM quote lines** — AOS_Products_Quotes endpoint exists but sync never wired
   (see SAG-ORDER-LINES-SYNC-01 for details)
