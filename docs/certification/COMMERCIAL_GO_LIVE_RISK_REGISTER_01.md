# COMMERCIAL GO LIVE RISK REGISTER 01

**Date:** 2026-07-14
**Tenant:** Castillitos

---

## P0 -- Blocks Operation

**NONE.** No P0 risks identified that would prevent daily commercial operations.

---

## P1 -- Affects Operation

### P1-001: Order Policy Pack Not Wired to Pedidos UI

- **Description:** The Order Policy Pack (6 policies: branch selection, credit validation, size distribution, partial delivery, discount override, order readiness) exists and produces BusinessDecision objects, but the Pedidos UI page does not consume them.
- **Impact:** Users creating orders will not see inline readiness checks, credit warnings, or size distribution suggestions. Orders can still be created and managed.
- **Probability:** CERTAIN (known gap)
- **Mitigation:** Engine results flow to `/comercial/decisions` API and Control dashboard `decisionsSummary`. Full inline integration requires 1 sprint.
- **Owner:** Commercial team
- **Target Fix:** POST-001

### P1-002: SaleRecord.productCode Always NULL

- **Description:** SAG MOVIMIENTOS query returns document headers only (invoice number, total, date), not line items. The `productCode` field on SaleRecord is always NULL.
- **Impact:** Cannot use SaleRecord for product-level sales analysis. Does NOT affect domain engines because they use CustomerOrderLine (populated from CRM quote lines) instead.
- **Probability:** CERTAIN (known data gap)
- **Mitigation:** CustomerOrderLine provides product-level data. For true SAG product sales, requires MOVIMIENTOS_DETALLE query and SaleRecordLine model.
- **Owner:** SAG adapter team
- **Target Fix:** POST-005

### P1-003: CRMQuote.customerId Always NULL

- **Description:** CRM adapter stores `billing_account_id` in `rawCrmJson` but does not extract it to the `customerId` FK column.
- **Impact:** Cannot directly join CRMQuote to CustomerProfile via FK. Cliente 360 uses workaround: `rawCrmJson.raw.billing_account_id` -> `CustomerProfile.crmId`.
- **Probability:** CERTAIN (known data gap)
- **Mitigation:** Workaround functional in Cliente 360. FK backfill requires CRM adapter change.
- **Owner:** CRM adapter team
- **Target Fix:** POST-006

### P1-004: Payment History Not Synced

- **Description:** SAG ABONOS (payment records) query is not implemented. Cannot show customer payment history or calculate payment patterns.
- **Impact:** Receivable analysis shows balances and due dates but not payment events. Cannot evaluate if a customer pays late but pays.
- **Probability:** CERTAIN (known missing query)
- **Mitigation:** CustomerReceivable provides current balance and overdue amounts. Payment pattern analysis deferred.
- **Owner:** SAG adapter team
- **Target Fix:** POST-007

---

## P2 -- Improvement

### P2-001: BusinessDecision Not Surfaced Inline in Module UIs

- **Description:** Module pages (Maletas, Tiendas, Vendedores, Importaciones) show operational data but do not display BusinessDecision recommendations inline.
- **Impact:** Users must go to Control dashboard or Decisions API to see engine recommendations. Not ideal UX but does not block operations.
- **Mitigation:** POST-004 sprint to add inline decision cards to module pages.

### P2-002: Production CN Raw Material Tracing Missing

- **Description:** Production module syncs OP (orders) and ET (events) but does not trace CN (consumption notes) back to OP via raw materials.
- **Impact:** Cannot answer "what raw materials were consumed for this production order" at material level.
- **Mitigation:** CN header data exists (7,890 headers, 81,367 lines in SAG). Requires mapping logic.

### P2-003: SAG ZONA Mapping Incomplete

- **Description:** SAG ZONA code is not mapped to seller identity. Cannot auto-assign geographic territory.
- **Impact:** Seller territory analysis requires manual knowledge.
- **Mitigation:** Documented for future sprint.

### P2-004: Monthly Sales Approximated

- **Description:** Import engine uses `sales6m / 6` instead of real monthly breakdown.
- **Impact:** Seasonal patterns may not be detected. Good enough for reorder decisions.
- **Mitigation:** Detail endpoint has real monthly data if needed.

---

## P3 -- Desirable

### P3-001: Decision Feed UI

- Dedicated view showing all BusinessDecisions with filtering by domain, priority, status.
- Enables daily review workflow.

### P3-002: Commercial Copilot Integration

- David agent consuming BusinessDecision for conversational Q&A.
- "David, que debo producir hoy?" answered with evidence.

### P3-003: Analytics Dashboard

- Historical trends, comparative analysis, seasonal forecasting.
- Based on SaleRecord and CustomerOrderLine data.

### P3-004: Control Tower Real-Time

- Live operational map with real-time sync status, alert streaming.

### P3-005: One-Click Order from Recommendations

- Production/import decisions with "Create Order" action button.

---

## Risk Summary

| Priority | Count | Status |
|---|---|---|
| P0 | 0 | No blockers |
| P1 | 4 | All documented with workarounds |
| P2 | 4 | Improvements for next phase |
| P3 | 5 | Desirable future features |
| **Total** | **13** | |
