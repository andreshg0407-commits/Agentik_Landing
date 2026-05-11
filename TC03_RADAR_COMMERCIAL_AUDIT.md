# TC-03 — Radar Comercial Executive Audit
## Torre de Control · Ejecutivo · Bloque 4 — Radar Comercial Ejecutivo

**Sprint:** TC-03
**Date:** 2026-05-07
**Author:** Agentik Engineering
**Status:** AUDIT COMPLETE — REMEDIATION RECOMMENDATIONS ATTACHED

---

## 0. SCOPE

This audit covers all KPIs, signals, and cards inside **Bloque 4 — Radar Comercial Ejecutivo**
in `app/(app)/[orgSlug]/executive/page.tsx`, plus their data sources across:

- `lib/commercial-ledger/service.ts` — `getUnifiedCommercialKpis()`
- `lib/sales/reports.ts` — `getVentasHoyPorCanal()`
- `lib/finance/fpa-queries.ts` — `getFpaRevenueForecast()`, `getCashFlow()`
- `lib/connectors/adapters/sag-pya-soap/mappers.ts` — SAG PYA receivable mapper
- `lib/sag/source-semantics.ts` — F1/F2 semantic model
- `lib/sales/source-rules.ts` — truth-layer module rules
- `lib/castillitos/source-rules.ts` + `lib/sag/master-data/source-semantic-rules.ts` — channel segmentation
- `prisma/schema.prisma` — CustomerReceivable, SaleRecord, CollectionRecord

---

## 1. KPI AUDIT TABLE

| # | KPI | Source Table | Query Logic | Business Meaning | Risk | Status |
|---|-----|-------------|-------------|-----------------|------|--------|
| 1 | **Empresa** (ventas hoy) | `SaleRecord` | comprobanteCode IN CODIGOS_EMPRESA_ACTIVOS · sagSourceType='OFICIAL' · ARKETOPS excluded | Ventas F1 empresa en el último día operativo SAG | LOW — relies on comprobanteCode being populated | VALID |
| 2 | **Almacenes** (ventas hoy) | `SaleRecord` | comprobanteCode IN CODIGOS_ALMACEN_ACTIVOS · sagSourceType='OFICIAL' · ARKETOPS excluded | Ventas F1 almacenes (tiendas retail POS) en el último día operativo | LOW — same risk as #1 | VALID |
| 3 | **Web** (ventas hoy) | `SaleRecord` | comprobanteCode IN CODIGOS_WEB_ACTIVOS · sagSourceType='OFICIAL' · ARKETOPS excluded | Ventas F1 canal digital en el último día operativo | MEDIUM — web channel sparsely populated in SAG | PARTIAL |
| 4 | **Facturado acumulado** | `CustomerReceivable` | SUM(originalAmount) · no status filter · no fiscal window · all history | Total invoiced (face value) across ALL historical periods and ALL statuses | MEDIUM — no period scope, includes PAID + WRITTEN_OFF | PARTIAL |
| 5 | **Cobrado acumulado** | `CustomerReceivable` | SUM(paidAmount) · no filter | Total collected as tracked by payment reconciliation | CRITICAL — paidAmount=0 for all SAG-synced AR; reconciliation not run | MISLEADING |
| 6 | **Eficiencia de cobro %** | `CustomerReceivable` | paidAmount / originalAmount × 100 | Collection efficiency ratio for the period | CRITICAL — numerator is 0 → shows 0% → panic signal with no business basis | MISLEADING |
| 7 | **F1 / F2 badge** on Líneas | `SaleRecord` | sagSourceType = 'OFICIAL' → "F1" / 'REMISION' → "F2" | Document source classification | NONE — correct per semantic model | VALID |
| 8 | **Facturado MTD** (mobileKpi) | `SaleRecord` | sagSourceType='OFICIAL', ARKETOPS excl., saleDate in current month | Month-to-date recognized revenue (F1 only) | LOW — aligned with revenue_executive module rule | VALID |

---

## 2. DETAILED FINDINGS

---

### 2.1 EMPRESA / ALMACENES / WEB

**Source:** `getVentasHoyPorCanal()` → `SaleRecord` grouped by `comprobanteCode`

```sql
CASE
  WHEN comprobanteCode IN (CODIGOS_EMPRESA_ACTIVOS)  THEN 'EMPRESA'
  WHEN comprobanteCode IN (CODIGOS_ALMACEN_ACTIVOS)  THEN 'ALMACEN'
  WHEN comprobanteCode IN (CODIGOS_WEB_ACTIVOS)      THEN 'WEB'
  ELSE 'OTROS'
END
WHERE sagSourceType = 'OFICIAL'
  AND sagDocumentFamily IN ('OFFICIAL_INVOICE', 'OTHER')
  AND [ARKETOPS EXCLUDED]
```

**Code lists (from FUENTES.xlsx 2026-04-20):**
- Empresa: derived from `canalOperacion = 'EMPRESA' AND estadoUso = 'ACTIVE'`
- Almacenes: derived from `canalOperacion = 'ALMACEN' AND estadoUso = 'ACTIVE'`
- Web: derived from `canalOperacion = 'WEB' AND estadoUso = 'ACTIVE'`

**Assessment: VALID**

The segmentation is correctly based on `comprobanteCode` — the field that comes directly from SAG and is authoritative for channel classification. It does NOT rely on `SaleRecord.channel` (which could drift during CSV import). F2/REMISION documents are excluded at the source type level. ARKETOPS is excluded via `SQL_FILTER_EXCLUIR_ARKETOPS`.

**Residual risk:**

| Risk | Severity | Explanation |
|------|----------|-------------|
| comprobanteCode NULL | LOW | If CSV import omits cod_comprobante column, rows land in 'OTROS' → invisible in signals. Not a silent error — amounts just disappear from the 3-channel view. |
| FUENTES.xlsx staleness | LOW | If Castillitos adds new comprobante codes and FUENTES.xlsx is not updated, new documents won't be classified. reviewStatus guards exist. |
| Web channel sparse | MEDIUM | FW (web) is listed in CODIGOS_WEB_ACTIVOS but historically Castillitos may have low e-commerce volume. Show-zero is correct, not broken. |
| sagDocumentFamily filter | LOW | Filter `IN ('OFFICIAL_INVOICE', 'OTHER')` could silently exclude future document families if a new family type is added to the enum. Low risk now. |

**Reconciliation safety:** This KPI does NOT depend on reconciliation. It reads SaleRecord directly. Future reconciliation cannot break it.

---

### 2.2 FACTURADO ACUMULADO

**Source:** `getUnifiedCommercialKpis()` → `CustomerReceivable`

```typescript
prisma.customerReceivable.aggregate({
  where: { organizationId: orgId },  // ← NO status filter, NO fiscal window
  _sum: { originalAmount: true, paidAmount: true, balanceDue: true },
})
```

**Assessment: PARTIAL**

`originalAmount` is the correct field for "facturado" — it is the face value of the invoice at issuance, set at SAG sync time and never changed.

**What is correct:**
- Does NOT include REMISION (receivables only generated from OFICIAL per source-rules.ts)
- Does NOT double-count (CustomerReceivable has `@@unique([organizationId, erpId])`)
- Does NOT include SAG internal/ARKETOPS entries (these don't generate receivables)

**What is wrong:**

| Issue | Severity | Explanation |
|-------|----------|-------------|
| No period scope | MEDIUM | Includes ALL historical invoices (6 years of data). A CEO reading "$X Facturado" may assume it's "this year" or "this month". |
| No status filter | MEDIUM | Includes PAID + PARTIAL + WRITTEN_OFF + OPEN. "Facturado acumulado" should ideally mean "gross invoiced", but WRITTEN_OFF should logically be disclosed separately. |
| No credit note netting | MEDIUM | If notas crédito exist as negative-amount CustomerReceivable rows, they reduce the total silently. If they're excluded from AR, the total is gross-inflated. |
| Period label missing | HIGH | The UI card sub-label shows "X facturas abiertas · período" but the total shown is lifetime, not current period. This is semantically inconsistent. |

**Recommended relabeling:**
- Current: "Facturado acumulado"
- Better: "Facturado total (histórico)" or "Facturado acumulado · todos los períodos"

---

### 2.3 COBRADO ACUMULADO ← CRITICAL

**Source:** `getUnifiedCommercialKpis()` → `CustomerReceivable.paidAmount`

```typescript
const totalCollected = Number(receivableAgg._sum.paidAmount ?? 0);
```

**Assessment: MISLEADING**

**Root cause (confirmed in mappers.ts line 213–214):**

```typescript
// originalAmount = total_valor   (net line sum, ex-IVA)
// paidAmount     = 0             (no payment source found; PAGOS table is empty)
// balanceDue     = originalAmount (conservative — assumes nothing paid)
```

The SAG PYA SOAP connector explicitly sets `paidAmount = 0` at sync time with comment: *"PAGOS table is empty"*. The mapper additionally sets `paidAmountPending: true` in `rawErpJson`.

**What this means operationally:**

`CustomerReceivable.paidAmount` is **zero for every invoice** imported via the SAG connector. It only becomes non-zero when the reconciliation engine runs and creates `CollectionAllocation` records linking `CollectionRecord` → `CustomerReceivable`.

For Castillitos, as of this audit:
- `CollectionRecord` EXISTS and has real cobros data from SAG `v_pagosnew`
- `CollectionAllocation` may or may not exist — depends on whether reconciliation has been executed
- `CustomerReceivable.paidAmount` = 0 for all SAG-synced invoices

**Therefore:** `totalCollected = 0` → "Cobrado acumulado: $0" — a number that is provably false and dangerous to show.

**What cobros data DOES exist and is trustworthy:**

| Source | Model | Trustworthy | Reconciled |
|--------|-------|-------------|------------|
| SAG v_pagosnew | `CollectionRecord.amount` | YES — direct from SAG | NO — not invoice-matched |
| SAG MOVIMIENTOS (R1/R2/RS/RC) | `SaleRecord` comprobanteCode R1,R2,RS,RC... | YES — direct from SAG | YES — amount known, invoice unknown |
| Manual PaymentRecord | `PaymentRecord + PaymentAllocation` | YES | YES — invoice-matched |

`getCobrosBreakdown()` in `lib/finance/cobros-breakdown.ts` uses `SaleRecord` with cobro comprobante codes (R1, R2, RS, RC, RG, RA, SI, AN) and produces a trustworthy `totalCobros` that is already being fetched in the executive page (`cobrosBreakdown` variable).

**This is the correct source for "cobros" — not `paidAmount`.**

**Recommended action:** See Section 4 below.

---

### 2.4 EFICIENCIA DE COBRO % ← CRITICAL

**Source:** `getUnifiedCommercialKpis()`

```typescript
collectionRate: totalInvoiced > 0
  ? Math.round((totalCollected / totalInvoiced) * 10000) / 100
  : null,
```

**Assessment: MISLEADING**

Since `totalCollected = 0`, `collectionRate = 0%`. This is a false signal.

**Additional structural problems beyond the zero issue:**

| Problem | Severity | Explanation |
|---------|----------|-------------|
| Period mismatch | HIGH | Denominator (facturado) is all-time; numerator (cobrado) is reconciliation-dependent. Not a coherent period ratio. |
| No time alignment | HIGH | A meaningful collection efficiency compares cobros received in period T against invoices that WERE due in period T. This formula compares total-ever-paid against total-ever-invoiced. |
| Positive feedback illusion | MEDIUM | As reconciliation runs and paidAmount grows, the ratio will INCREASE over time even without new cobros activity — just from running the engine on historical data. A CEO could misread this as improving performance. |
| False urgency | HIGH | UI marks the card URGENT when collectionRate < 60%. Since it's 0%, the card appears RED/URGENT at all times. This is the most visible card in the Radar and it is emitting a permanent false alarm. |

**This KPI should NOT be shown in its current form.**

---

### 2.5 F1 / F2 LOGIC COHERENCE

**Assessment: VALID**

The F1/F2 semantic model is consistently applied across all modules:

| Module | Source Filter | Correct | Explanation |
|--------|--------------|---------|-------------|
| revenue_executive | OFICIAL only | YES | Only fiscal invoices count as recognized revenue |
| operational | OFICIAL + REMISION | YES | Full pipeline view |
| forecast | OFICIAL + REMISION | YES | F2 = demand signal |
| finance_dian | OFICIAL only | YES | DIAN only recognizes fiscal invoices |
| customer_360 | OFICIAL + REMISION | YES | Full history, visually separated |
| seller_productivity | OFICIAL + REMISION | YES | Weighted (F1=1.0, F2=0.7) |
| receivables | OFICIAL only | YES | AR only from fiscal invoices |

**The F1 badge on líneas table** (`sagSourceType === "OFICIAL" ? "F1" : "F2"`) is correct.

**The "F1 · Oficial" sub-label on MTD card** in the mobile KPI carousel is correct — `getFpaRevenueForecast()` uses `sagSourceType = "OFICIAL"` + ARKETOPS excluded.

**No issues found in F1/F2 logic.**

---

### 2.6 RECONCILIATION DEPENDENCY RISK MAP

```
                      ┌─────────────────────────────────────────┐
                      │  CustomerReceivable.paidAmount           │
                      │  UPDATED BY: reconciliation engine       │
                      │  SET TO 0 BY: SAG PYA mapper (always)   │
                      └─────────────────┬───────────────────────┘
                                        │
              ┌─────────────────────────┼──────────────────────┐
              │                         │                      │
              ▼                         ▼                      ▼
    totalCollected = 0       collectionRate = 0%      balanceDue = originalAmount
         │                         │                       (inflated)
         ▼                         ▼
  "Cobrado acumulado: $0"   "Eficiencia: 0%"
   [MISLEADING]              [FALSE ALARM]
```

**Future reconciliation risk:**
When reconciliation runs, `paidAmount` will increase and `collectionRate` will improve from 0%. A CEO who sees this change might interpret it as the business actually improving — when in reality it just means the system is catching up on historical matching. This is semantically confusing.

---

## 3. RISK SUMMARY

| KPI | Status | CEO Misread Risk | Action Required |
|-----|--------|-----------------|-----------------|
| Empresa (ventas hoy) | VALID | None | None |
| Almacenes (ventas hoy) | VALID | None | None |
| Web (ventas hoy) | PARTIAL | Low — zero shows correctly | Confirm FW codes with Castillitos |
| Facturado acumulado | PARTIAL | MEDIUM — no period label | Relabel to show historical scope |
| Cobrado acumulado | MISLEADING | CRITICAL — shows $0 = provably false | Replace source with CollectionRecord |
| Eficiencia de cobro % | MISLEADING | CRITICAL — shows 0%/RED = permanent false alarm | Hide or replace |
| F1/F2 badge on líneas | VALID | None | None |
| Facturado MTD | VALID | None | None |

---

## 4. REQUIRED REMEDIATIONS

### Priority 1 — IMMEDIATE (executive trust at stake)

#### 4.1 Replace "Cobrado acumulado" source

**Current source:** `CommercialKpis.totalCollected` = `CustomerReceivable.paidAmount` (= 0)

**Replace with:** `getCobrosBreakdown().totalCobros` — already fetched in `cobrosBreakdown` variable in executive page.

`getCobrosBreakdown().totalCobros` = SUM of CollectionRecord from SAG v_pagosnew, broken down as:
- R1 = cobros empresa F1
- R2 = cobros empresa F2
- RS, RC, RG, RA = recaudos POS almacenes
- SI, AN = retail financiero (Addi/Sistecredit)
- EXCLUDES CP/B1/B2/H1/H2 (consignaciones pendientes)

This is the real cash received from SAG — unmatched to invoices, but REAL.

**Relabeling:**
- Current: "Cobrado acumulado"
- Better: "Cobros identificados" or "Recaudo SAG identificado"
- Sub-label: "Cobros registrados en SAG · sin conciliar a facturas"

#### 4.2 Fix "Eficiencia de cobro" or hide it

**Option A (recommended):** Replace with a VALID ratio — cobrosBreakdown.totalCobros / facturadoAcumulado

This gives a real indicator: "of everything invoiced, how much has been physically received by the company (even if not yet matched to a specific invoice)."

**Option B:** Hide the card entirely until reconciliation is complete.
- Replace with a "Conciliación pendiente" card with CTA to `/reconciliation`

**Relabeling if Option A:**
- Current: "Eficiencia de cobro %"
- Better: "Tasa de recaudo estimada" with sub-label: "Cobros SAG / Facturado total · pendiente de conciliar"

#### 4.3 Add period qualifier to "Facturado acumulado"

The sub-label currently says `"X facturas abiertas · período"`. Change "período" to "histórico" or add year scope.

---

### Priority 2 — ADVISORY (semantic precision)

#### 4.4 Empresa/Almacenes/Web zero state

When a channel shows $0, the UI currently shows "0 documentos · sin ventas hoy". This is correct. No change needed, but confirm FW codes are in the active FUENTES.xlsx list for Castillitos.

#### 4.5 F1/F2 display on lineas

Consider adding a tooltip or legend explaining that F1 = factura oficial (revenue truth) and F2 = remisión (operational flow). Currently the badge is shown without explanation. Low priority.

#### 4.6 "Facturado acumulado" — credit note exposure

Verify whether notas crédito exist as CustomerReceivable rows with negative originalAmount. If yes, they already reduce the total silently (no separate display). If not, gross invoiced is over-stated vs net. Needs data query against Castillitos DB.

---

## 5. SAFE RELABELING TABLE

| Current Label | Safe Label | Note |
|--------------|------------|------|
| "Cobrado acumulado" | "Cobros identificados" | Source change + label change |
| "Pagos recibidos confirmados · período" | "Cobros registrados en SAG · sin conciliar a facturas" | Be explicit about reconciliation gap |
| "Eficiencia de cobro %" | "Tasa de recaudo estimada" | Only if using cobrosBreakdown as numerator |
| "Cobrado / Facturado · período" | "Recaudo SAG / Facturado histórico · estimado" | Be explicit that this is not reconciled |
| "Facturado acumulado" | "Facturado acumulado (histórico)" | Add scope |
| "X facturas abiertas · período" | "X facturas abiertas · histórico" | Correct the "período" label |

---

## 6. WHAT IS SAFE TO SHOW NOW

| KPI | Safe? | Why |
|-----|-------|-----|
| Empresa/Almacenes/Web | YES | Direct from SaleRecord, comprobanteCode-based, OFICIAL only |
| Facturado histórico | YES with relabel | Real invoice data, just needs period qualifier |
| Cobros identificados (from CollectionRecord/SaleRecord cobros) | YES with relabel | Real SAG data, just not yet invoice-matched |
| Cartera vencida | YES | From CustomerReceivable balanceDue — not paidAmount |
| Aging buckets | YES | From CustomerReceivable agingBucket — not paidAmount |
| F1/F2 badge | YES | Direct from sagSourceType |
| MTD Revenue | YES | SaleRecord OFICIAL only, correct source |
| Tasa de recaudo estimada (cobros/facturado) | YES with caveat | Real numerator, estimated ratio — not reconciliation-grade |

---

## 7. WHAT MUST NOT BE SHOWN UNTIL RECONCILIATION IS COMPLETE

| KPI | Reason |
|-----|--------|
| "Eficiencia de cobro" from paidAmount/originalAmount | paidAmount = 0 for all SAG invoices |
| "Cobrado acumulado" from paidAmount | paidAmount = 0 for all SAG invoices |
| Any KPI presented as "conciliado" | CollectionAllocation reconciliation not confirmed as run |

---

## 8. TECHNICAL DEPENDENCIES FOR FULL RESOLUTION

| Dependency | What It Unlocks | Sprint |
|------------|----------------|--------|
| CollectionRecord → CustomerReceivable reconciliation engine run | Real paidAmount values → real collectionRate | TC-04 |
| Fiscal window scoping on getUnifiedCommercialKpis | Period-accurate facturado | TC-04 |
| Credit note presence query in Castillitos data | Gross vs net facturado truth | TC-04 |
| Confirmation of FW code activity in Castillitos | Web channel reliability | TC-04 |

---

## 9. VERDICT

**Before this sprint:** The Radar Comercial Ejecutivo has two permanently misleading KPIs
("Cobrado acumulado: $0" and "Eficiencia: 0% RED") that are structurally broken due to
the SAG PYA connector not exporting payment facts. A CEO would see a red alarm on every
session with no basis in operational reality.

**After this sprint remediation (TC-03):** Replace both KPIs with safe alternatives using
data that IS real (CollectionRecord / SaleRecord cobros codes). The CEO sees real cash
flows with honest caveats instead of false alarms.

**The three-channel segmentation (Empresa/Almacenes/Web) is VALID and trustworthy.**
**The F1/F2 semantic model is VALID and consistently applied.**
**The cartera/aging KPIs are VALID — they do not depend on paidAmount.**

*End of Audit — Proceed to Remediation*
