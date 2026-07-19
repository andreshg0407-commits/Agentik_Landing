# PEDIDOS-CUSTOMER-HISTORY-SAG-AUDIT-01

**Sprint:** Diagnostic-only audit
**Date:** 2026-07-07
**Scope:** Verify whether customer history shown in Pedidos drawer matches real SAG data
**Result:** COVERAGE IS COMPLETE. No missing orders.

---

## Executive Summary

The customer order history shown in the Pedidos drawer is **100% accurate**. Every active PD (Pedido de Cliente) document in SAG is present in Agentik's `CustomerOrderRecord` table. If a customer shows "1 pedido", they genuinely have 1 active order in SAG.

---

## Methodology

1. Sampled 7 customers with varying order counts (1 to 33 orders)
2. Queried SAG directly via SOAP (`consultaSagJson`) for PD documents per customer NIT
3. Compared SAG counts with Agentik `CustomerOrderRecord` counts
4. Investigated global totals and any gaps
5. Validated NIT format consistency

---

## Findings

### 1. Global Coverage: EXACT MATCH

| Source | PD Documents | Unique Customers | Date Range |
|--------|-------------|------------------|------------|
| SAG (active, fuente=40) | 9,592 | 1,641 | 2020-06-11 -> 2026-07-06 |
| Agentik COR | 9,592 | 1,641 | 2020-06-11 -> 2026-07-06 |
| **Gap** | **0** | **0** | **identical** |

### 2. Apparent Discrepancy Explained

Initial SAG query (without filters) returned 9,903 documents vs Agentik's 9,592 (311 gap). Root causes:

| Filter | Documents Excluded | Reason |
|--------|--------------------|--------|
| `sc_anulado != 'N'` | 293 | Cancelled orders in SAG, correctly excluded by sync |
| `ka_ni_fuente != 40` | 18 | 17 "PRUEBAS PEDIDOS" (test), 1 "ORDEN DE COMPRA" (purchase order) |
| **Total excluded** | **311** | **All legitimate exclusions** |

### 3. Per-Customer Validation: 7/7 MATCH

| NIT | Customer | Agentik | SAG (filtered) | Match |
|-----|----------|---------|----------------|-------|
| 40918 | DANIELA SALDARRIAGA | 1 | 1 | OK |
| 26545 | IRMA LUCIA VARGAS LOPEZ | 5 | 5 | OK |
| 40921 | MARIA CAMILA CORTES MORALES | 1 | 1 | OK |
| 9586 | MUNDO MATERNO SAS | 33 | 33 | OK |
| 40920 | (recent customer) | 1 | 1 | OK |
| 1324 | (high-volume customer) | 15 | 15 | OK |
| 26055 | (medium-volume customer) | 32 | 32 | OK |

### 4. NIT Format Note

- Agentik `customerNit` stores SAG's `ka_nl_tercero` (internal FK), not `TERCEROS.n_nit` (real Colombian NIT)
- Example: customer 1324 has real NIT 15457278
- This is consistent across the entire dataset and doesn't affect history accuracy
- If real NITs are needed for DIAN/tax purposes, a mapping layer would be required

### 5. SAG Document Type Distribution (FUENTES with k_n_clase_fuente=4)

| ka_ni_fuente | Code | Name | Count | Status |
|-------------|------|------|-------|--------|
| 40 | PD | PEDIDOS CLIENTES | 9,885 (293 cancelled) | Synced |
| 136 | PP | PRUEBAS PEDIDOS | 17 | Excluded (test data) |
| 53 | OC | ORDEN DE COMPRA | 1 | Excluded (purchase, not sale) |

---

## Sync Pipeline Verification

The sync pipeline correctly applies these filters:

1. **`sc_anulado = 'N'`** in the SQL query (DEFAULT_RECEIVABLE_QUERY, line 146 of index.ts)
2. **`k_n_clase_fuente = 4`** checked in `mapSagOrder()` (mappers.ts line 667)
3. **`fuenteToCode(fuenteId) === "PD"`** checked in `mapSagOrder()` (mappers.ts line 671)
4. **`cobrarPagar !== "P"`** checked in `mapSagOrder()` (mappers.ts line 667)

All four filters are correct and produce the exact expected dataset.

---

## Conclusion

No action required. The customer history data in Agentik is a complete and accurate mirror of SAG's active PD documents. Customers showing low order counts genuinely have that many orders in SAG.
