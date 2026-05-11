# FINANCIAL_SOURCE_RELATIONSHIPS.md
## Agentik Financial Flow Architecture — Source Relationship Model
## DATE: 2026-05-07
## STATUS: V1 CANONICAL

---

## Purpose

This document defines how SAG/PYA sources relate to each other as financial flows.
It answers: "When source X fires, what financial state changes, and how does it connect to other sources?"

This is the semantic wiring layer. Every AR balance, cobros KPI, CxP card, and
reconciliation chain must be traceable to the flow relationships defined here.

---

## Core Financial Principle

```
Revenue  ≠  Cash Collection
Expense  ≠  Accounts Payable disbursement
Treasury Movement  ≠  Accounting Adjustment
Pending Deposit  ≠  Confirmed Cobro
```

These distinctions are why the source map exists. SAG stores all events in the same
MOVIMIENTOS table with only the fuente code differentiating their financial nature.

---

## 1. ACCOUNTS RECEIVABLE FLOW

### 1.1 AR Creation

```
FE / FD / FC / FG / FA / FW
    |
    +-- Creates: CustomerReceivable record
    |   (document_number, amount, issue_date, due_date, client)
    |
    +-- Creates: SaleRecord (OFICIAL / F1 track)
    |
    +-- Increments: Cartera total
    |
    +-- Starts: Aging clock (DPD = 0 on issue_date)
```

**F2 parallel track:**
```
F2 (Remisión)
    |
    +-- Creates: SaleRecord (REMISION / F2 track)
    |
    +-- Creates: AR F2 (separate from CustomerReceivable F1)
    |
    +-- Does NOT feed: Official cartera aging
    |
    +-- Feeds: F2 revenue KPI (separate display band)
```

### 1.2 AR Reduction via Payment

```
R1 / RS / RC / RG / RA
    |
    +-- Reduces: CustomerReceivable (match by document or client)
    |
    +-- Creates: CollectionRecord (amount, date, comprobanteCode, client)
    |
    +-- Increments: Cobros identificados KPI
    |
    +-- PENDING until: Reconciled against bank statement
    |
    +-- After reconciliation → status: RECONCILED
```

**Sistecredit flow (RC, RG, RA, AN):**
```
RC / RG / RA / AN (Recibos Sistecredit en tiendas)
    |
    +-- Registered: At moment of retail collection (POS event)
    |
    +-- State: INFORMATIVO — efectivo en tienda
    |
    +-- Monthly reconciliation: Cruzar contra liquidación Sistecredit
    |
    +-- After reconciliation: Confirms which CustomerReceivable records cleared
    |
    +-- WARNING: Do not count as VERIFIED cobro until monthly Sistecredit settlement
```

**Client advance flow (A1, AN, A2):**
```
A1 / AN / A2 (Anticipos)
    |
    +-- Creates: Advance liability (not AR reduction yet)
    |
    +-- Reduces: CustomerReceivable ONLY when applied to specific invoice
    |
    +-- Application: Manual or via AA (Aplicación de Anticipos — HISTORICAL)
    |
    +-- Treasury impact: +Cash immediately
    |
    +-- AR impact: Deferred until invoice application
```

### 1.3 AR Modification (Adjustments)

```
NC / NE (Notas Crédito Empresa)
    |
    +-- Reduces: AR (F1) — partially or fully cancels invoice
    |
    +-- Reduces: Revenue (F1) — NC is IMPACTA VENTAS=SI(-)
    |
    +-- Does NOT: Generate cash collection
    |
    +-- Requires: Matching to original FE invoice for proper AR netting
```

```
ND (Descuentos Financieros — Nota Crédito)
    |
    +-- Reduces: AR (the discount applied at payment time)
    |
    +-- Reduces: Revenue (financial discount recognized)
    |
    +-- Context: Applied at the moment client pays — "descuentos financieros
    |            que aplican los clientes a la hora del pago de facturas"
    |
    +-- Reconciliation: Pair with R1/RS/etc. on same payment date
    |
    +-- WARNING: ND reduces AR but is NOT a cash receipt
    |            Cobros KPI must exclude ND from cash totals
```

```
NF / NA / NG / NS / NT / NW (Devoluciones por almacén)
    |
    +-- Reduces: AR (F1, by store)
    |
    +-- Reduces: Revenue (F1, by store)
    |
    +-- Increases: Inventory (+units returned to stock)
    |
    +-- Requires: Matching to original FD/FC/FG/FA/FW invoice
```

```
D2 (Devolución Ventas F2)
    |
    +-- Reduces: AR (F2 track)
    |
    +-- Increases: Inventory
    |
    +-- Does NOT affect: F1 cartera
```

---

## 2. ACCOUNTS PAYABLE FLOW

### 2.1 AP Creation

```
C1 (Factura de Compra F1)
    |
    +-- Creates: Supplier obligation (CxP)
    |
    +-- Sets: Due date, payment terms
    |
    +-- Feeds: B3 Cuentas por pagar card
    |
    +-- Inventory impact: +units received (typically)
```

```
G1 (Gastos Causados)
    |
    +-- Creates: Accrued expense obligation (CxP)
    |
    +-- Financial meaning: Expense recognized BEFORE cash disbursement
    |
    +-- Example: Services rendered, invoiced but not yet paid
    |
    +-- Feeds: B3 Cuentas por pagar card
    |
    +-- Does NOT: Generate cash outflow immediately
    |
    +-- Cash event: Separate disbursement (E1 or bank debit)
```

```
C2 (Factura de Compras F2)
    |
    +-- Creates: CxP (F2 track — non-official supplier)
    |
    +-- Same flow as C1 but in F2 track
```

### 2.2 AP Reduction

```
DC (Devolución Compras Oficiales)
    |
    +-- Reduces: CxP (F1 supplier obligation)
    |
    +-- Increases: Inventory balance negatively (units returned to supplier)
    |
    +-- Requires: Matching to original C1
```

```
DG (Devolución Gastos)
    |
    +-- Reduces: CxP (accrued expense)
    |
    +-- Financial meaning: Expense obligation partially reversed
    |
    +-- Requires: Matching to original G1
```

### 2.3 AP Disbursement (Cash Out)

```
E1 / E2 (Egresos)
    |
    +-- Reduces: Cash (payment made)
    |
    +-- E1: Should correspond to C1/G1 CxP settlement (F1)
    |
    +-- E2: F2 track cash outflow
    |
    +-- WARNING: E1 has IMPACTA VENTAS=SI(+) in source data — possible legacy naming.
    |            Do not aggregate with revenue KPIs without explicit verification.
```

```
1V (Anticipo Proveedores F1)
    |
    +-- Reduces: Cash immediately
    |
    +-- Creates: Supplier advance asset (not yet CxP reduction)
    |
    +-- Resolution: When supplier delivers (C1 arrives), match advance to invoice
    |
    +-- Until matched: Shows as "Anticipo en tránsito" in treasury
```

---

## 3. TREASURY FLOW

### 3.1 Bank Debits (Non-AP)

```
DB (Notas Débito Bancarias)
    |
    +-- Reduces: Cash balance
    |
    +-- Source: Bank-initiated (comisión, cargo automático, ajuste)
    |
    +-- Does NOT create: CxP (already debited by bank)
    |
    +-- Reconciliation: Match against bank statement
    |
    +-- Feeds: B3 Tesorería inmediata (reduces available cash)
```

### 3.2 Pending Deposits (Unidentified Cash)

```
B1 / B2 / H1 / H2 / CP (Consignaciones Pendientes)
    |
    +-- State: Cash received in bank account — IDENTITY UNKNOWN
    |
    +-- Financial meaning: "Dinero recibido sin identificar;
    |                       no cuenta como cobro final,
    |                       conciliación a fin de mes"
    |
    +-- MUST NOT count as: R1/RS/etc. (confirmed cobro from client)
    |
    +-- Resolution process:
    |   1. Identify which client made the deposit
    |   2. Match to open CustomerReceivable invoice(s)
    |   3. Create R1 (or RS/etc.) with the identified amount
    |   4. Cancel the B1/B2/etc. provisional entry
    |
    +-- Agentik display rule:
    |   Show as: "X consignaciones por identificar · COP Y"
    |   Color: amber (warning)
    |   Never aggregate into: cobros totales
    |   Never reduce: CustomerReceivable until resolved
    |
    +-- Feeds: B3 Tesorería inmediata (pending cash — distinct bucket)
```

**Monthly reconciliation cycle for pending deposits:**
```
End of month:
  All B1/B2/H1/H2/CP entries → reconciliation queue
  For each entry: assign to R1/RS/etc. (confirmed cobro)
  Remainder: investigate with client or bank
  Result: AR balance net of confirmed payments
```

---

## 4. COMMERCIAL PIPELINE FLOW

```
PD (Pedidos Clientes)
    |
    +-- State: Formal purchase order BEFORE billing
    |
    +-- Financial impact: None (no AR created yet)
    |
    +-- Commercial impact: Committed revenue (likely to convert)
    |
    +-- Feeds: "PEDIDOS DEL DIA" — B1 daily commercial card
    |
    +-- Conversion path: PD → (dispatch) → FE/FD/etc. → AR
    |
    +-- Pipeline KPI: Total PD value = expected near-term billing
```

```
AP (Ajuste Pedidos)
    |
    +-- Modifies: PD traceability
    |
    +-- Feeds: Despacho traceability reports
    |
    +-- Not a financial event
```

---

## 5. FULL RECONCILIATION CHAINS

### Chain A — Official Revenue to Verified Payment

```
FE (billing event)
  → CustomerReceivable created (status: OPEN)
  → Aging starts (DPD counter)
  → R1 or A1 arrives (cobro event)
    → CollectionRecord created (status: PENDING)
    → B3 Tesorería: deposit may arrive as B1/B2/H1/H2 first
    → Bank statement confirms deposit
    → B1/B2 resolved → matches R1
    → CollectionRecord status: RECONCILED
    → CustomerReceivable status: PAID (or partially PARTIAL)
```

### Chain B — Sistecredit Store Collections

```
RC / RG / RA (store receives Sistecredit payment)
  → CollectionRecord created (status: INFORMATIVO)
  → AN (advance received from Sistecredit)
  → Monthly Sistecredit settlement document arrives
  → Cross-reference: settlement confirms which invoices cleared
  → CustomerReceivable records updated to PAID
  → CollectionRecord status: RECONCILED
```

### Chain C — Client Payment with Discount

```
FE (invoice, amount X)
  → CustomerReceivable: X (OPEN)
  → Client pays: amount X - discount D
    → R1 for (X - D)
    → ND for D (financial discount NC)
  → Total AR reduction: (X-D) + D = X
  → CustomerReceivable: PAID
  → Note: R1 cobros total = X-D (cash received)
           ND is NOT cash — it is a discount recognized
```

### Chain D — Supplier Purchase to Payment

```
C1 (purchase invoice from supplier)
  → payableRecord created (CxP, status: OPEN)
  → Due date set per payment terms
  → B3 card shows: "CxP pendiente: COP Y, vence: fecha"
  → Payment event (E1 or bank disbursement)
  → payableRecord: PAID
  → Treasury: -Cash
```

### Chain E — Pending Deposit to Confirmed Cobro

```
Client deposits cash in bank (outside SAG)
  → B1/B2/H1/H2/CP registered in SAG (provisional)
  → Treasury state: "X por identificar"
  → Accounting identifies client
  → R1 created with correct client + invoice reference
  → B1/B2 entry cancelled/reversed
  → CustomerReceivable: reduced
  → Final state: Cobro confirmado, AR reducida
```

---

## 6. EXECUTIVE DASHBOARD CARD WIRING

### B1 — Centro de Mando Diario

| KPI | Sources | Trust State |
|-----|---------|-------------|
| Facturación del día | FE + FD + FC + FG + FA + FW (today) | LIVE (SAG real-time) |
| Cobros recibidos hoy | R1 + RS + RC + RG + RA + AN + A1 (today) | PENDING (registered, not bank-reconciled) |
| Pedidos del día | PD (today) | LIVE (SAG real-time) |
| Consignaciones por identificar | B1+B2+H1+H2+CP (open) | PENDING (not cobro) |

### B2 — Cartera y Riesgo

| KPI | Sources | Trust State |
|-----|---------|-------------|
| Cartera abierta F1 | FE+FD+FC+FG+FA+FW minus R1+RS+RC+RG+RA+AN+A1 minus NC+NE+NF+NA+NG+NS+NT+NW | PARTIAL (SAG live, bank reconciliation pending) |
| Aging / DPD | CustomerReceivable.daysOverdue (from above) | PARTIAL |
| Cartera F2 | F2 minus R2 minus D2 | PARTIAL (F2 track) |
| ND impact | Subtract ND from AR (discount recognized on payment) | ESTIMATED |

### B3 — Tesorería Operativa

| KPI | Sources | Trust State |
|-----|---------|-------------|
| Cuentas por pagar | C1 + G1 + C2 minus DC + DG | PENDING (SAG registered, not yet paid/matched) |
| Tesorería inmediata | DB + B1+B2+H1+H2+CP as pending bucket | PENDING |
| Anticipos en tránsito | 1V + 2V (unmatched) | PENDING |

### B4 — Radar Comercial Ejecutivo

| KPI | Sources | Trust State |
|-----|---------|-------------|
| Cobros identificados (period) | R1+RS+RC+RG+RA+AN+A1 (period) | PENDING (not reconciled) |
| Tasa de recaudo estimada | cobros / AR invoiced | ESTIMATED (both sides unreconciled) |
| Revenue trend | FE+FD+FC+FG+FA+FW (period) | LIVE |
| F1/F2 split | FE+FD+FC+FG+FA+FW vs F2 | LIVE |

---

## 7. RECONCILIATION STATE TRANSITIONS

```
Source fires → CollectionRecord: PENDING
                  ↓ (bank confirms deposit)
               CollectionRecord: PARTIAL
                  ↓ (matched to CustomerReceivable invoice)
               CollectionRecord: RECONCILED
               CustomerReceivable: PAID / PARTIAL_PAID
```

```
B1/B2/H1/H2/CP fires → Treasury: PENDING_DEPOSIT
                            ↓ (client identified, R1 created)
                         B-source cancelled
                         R1 → CollectionRecord: PENDING
                            ↓ (bank confirmed)
                         CollectionRecord: RECONCILED
```

---

## 8. WHAT MUST NEVER HAPPEN

| Violation | Consequence | Prevention |
|-----------|-------------|------------|
| Count B1/B2/H1/H2/CP as cobros | Overstated collections; understated pending | Always display B-group separately as "por identificar" |
| Sum ND (discounts) with R1 (cash) | Inflated cobros — ND is not cash | Exclude ND from getCobrosKpis() aggregation |
| Display D1/D2 returns as positive revenue | Double-counted revenue | Apply as AR reduction, not new billing |
| Show Sistecredit (RC/RG/RA/AN) as reconciled | False precision | Mark as INFORMATIVO until monthly settlement |
| Aggregate ARKETOPS/N/A sources with operational data | Corrupted KPIs | Hard-filter by k_sc_codigo_fuente allowlist |
| Show HISTORIAL sources as current balances | Stale data presented as live | Filter ACTIVO=SI for all current operational queries |
| Count AN (Anticipos Sistecredit) as matched to specific invoices | False AR reduction | AN reduces AR only after monthly Sistecredit reconciliation |

---

## 9. AGENTIK SOURCE ALLOWLIST (V1)

For all operational queries (AR, Collections, CxP, Treasury, Commercial), filter `fuente IN`:

```typescript
// Revenue — creates AR
const REVENUE_SOURCES = ['FE', 'FD', 'FC', 'FG', 'FA', 'FW', 'F2'];

// Collections — reduces AR (confirmed cash intent)
const COLLECTION_SOURCES = ['R1', 'RS', 'RC', 'RG', 'RA', 'AN', 'A1', 'R2', 'A2'];

// Revenue adjustments — modifies AR/Revenue
const REVENUE_ADJ_SOURCES = ['NC', 'NE', 'ND', 'NF', 'NA', 'NG', 'NS', 'NT', 'NW', 'D2'];

// Accounts payable — creates obligations
const AP_SOURCES = ['C1', 'G1', 'C2'];

// AP reduction
const AP_REDUCTION_SOURCES = ['DC', 'DG'];

// Treasury — cash without AR/AP
const TREASURY_SOURCES = ['DB', 'E1', 'E2', '1V', '2V'];

// Pending deposits — NEVER count as cobros
const PENDING_DEPOSIT_SOURCES = ['B1', 'B2', 'H1', 'H2', 'CP'];

// Commercial pipeline
const COMMERCIAL_SOURCES = ['PD', 'AP'];

// Cobros KPI total (getCobrosKpis) = COLLECTION_SOURCES - PENDING_DEPOSIT_SOURCES
// ND excluded from cobros cash total (it is a discount, not cash receipt)
```

Any source not in the above lists should be treated as IGNORE_V1 for operational queries.
