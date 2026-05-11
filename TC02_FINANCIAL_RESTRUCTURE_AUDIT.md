# TC-02 — Financial Restructure Audit
## Torre de Control · Bloque E (Obligaciones y Presupuesto)

**Sprint:** TC-02
**Date:** 2026-05-07
**Author:** Agentik Engineering
**Status:** APPROVED FOR ARCHITECTURE PHASE

---

## 1. WHAT EXISTS TODAY

### 1.1 Block E — Current Implementation (cobranza/page.tsx lines 1324–1361)

```
BLOQUE E — OBLIGACIONES
├── 4 PendingTile cards
│   ├── "Proveedores"  → "Sin obligaciones con proveedores registradas"
│   ├── "Bancos"       → "Sin extractos bancarios cargados"
│   ├── "Créditos"     → "Sin créditos registrados"
│   └── "Otros"        → "Sin otras obligaciones registradas"
└── CardPanel: "Módulo de obligaciones — pendiente de activación"
    ├── List of 3 ingestion paths (Agentik, Excel, direct integration)
    └── CTA: "Ingresar via Agentik →" → /agentik
```

There is NO Block for "Control Presupuestal" anywhere in Torre de Control.
Budget data exists in the schema and in `/finance` page but is absent from the executive view.

---

### 1.2 Prisma Schema — What Exists

#### PRESENT AND READY

| Model | Purpose | Status |
|-------|---------|--------|
| `Budget` | Plan targets by period/dimension/category | MIGRATED — queryable |
| `SaleRecord` | Revenue actuals | ACTIVE — real data |
| `CustomerReceivable` | AR invoices / aging | ACTIVE — real data |
| `CollectionRecord` | Cobros recibidos | ACTIVE — real data |
| `PaymentRecord` | Manual payments registered by operator | ACTIVE |
| `PaymentAllocation` | Links payment to receivable | ACTIVE |

#### ABSENT — BLOCKING AP/OBLIGATIONS

| Model | Purpose | Blocker |
|-------|---------|---------|
| `SupplierPayable` | CXP: facturas de proveedores a pagar | NOT EXISTS |
| `BankObligation` | Créditos bancarios / cuotas | NOT EXISTS |
| `TreasurySnapshot` | Saldo de caja disponible | NOT EXISTS |
| `CashFlowProjection` | Flujo proyectado vs comprometido | NOT EXISTS |

---

### 1.3 Finance Library — What Exists

| File | Functions | Relevance |
|------|-----------|-----------|
| `fpa-queries.ts` | `getFpaRevenueForecast`, `getFpaBudgets`, `getFpaVariance`, `getFpaCashFlow`, `buildFpaRecommendations` | HIGH — all usable immediately |
| `payment-service.ts` | `listPayments`, `registerPayment` | MEDIUM — only covers AR side |
| `receivables-snapshot.ts` | AR aging snapshots | MEDIUM — AR only |
| `cartera-kpis.ts` | Cartera risk KPIs | MEDIUM — AR only |

#### Budget model dimensions available:
```
BudgetPeriod:    ANNUAL | QUARTERLY | MONTHLY
BudgetDimension: TOTAL | BRANCH | CHANNEL | SELLER | LINE | PAYROLL
Category:        "revenue" | "cogs" | "opex" | "payroll" | "capex" | "marketing"
```

This is fully usable for variance analysis today, but no budgets have been entered for Castillitos.

---

### 1.4 Finance Page (/finance) — Existing Budget UI

The `/finance` page already implements:
- `getFpaBudgets` — fetch configured budget targets
- `getFpaVariance` — compute actual vs budget per dimension
- `BudgetTable` component — renders variance rows
- `FpaSection` component — section wrapper with icon

These patterns can be **reused or referenced** in Torre de Control without duplication.

---

## 2. WHAT IS WRONG TODAY

### 2.1 Cards That Communicate No Value

| Card | Problem |
|------|---------|
| PendingTile "Proveedores" | Shows `—`. A CEO learns nothing. Does not communicate what will exist here. |
| PendingTile "Bancos" | Same. "Sin extractos" is a technical phrase. |
| PendingTile "Créditos" | Same. No monetary context. |
| PendingTile "Otros" | Completely meaningless. |
| "Módulo de obligaciones — pendiente de activación" | Reads like a developer note. Not executive language. |

### 2.2 What Is Conceptually Absent

- **No cash pressure signal.** A CEO needs to know: "in the next 7 days, I need to pay $X."
- **No budget tracking.** The most fundamental financial control is absent from the executive view.
- **No variance signal.** Is the company above or below plan this month?
- **No treasury lens.** What is the relationship between what I will collect and what I must pay?
- **No payment prioritization.** No signal about which obligations are critical vs deferrable.

### 2.3 Structural Redundancies

The current Block E contains:
- 4 empty tiles that duplicate each other in meaning
- One explanatory panel that explains technical ingestion paths — belongs in settings, not in the CEO dashboard

### 2.4 Language Problems

| Current | Should Be |
|---------|-----------|
| "Sin extractos bancarios cargados" | "Sin obligaciones bancarias registradas" |
| "Módulo de obligaciones — pendiente de activación" | n/a — this panel should be redesigned entirely |
| "Ingesta manual / Excel pendiente" | n/a — remove from executive view |
| "Ingresar via Agentik →" | "Registrar obligación →" |
| "Presupuesto vs ejecución" | "Control Presupuestal" |

---

## 3. WHAT MUST BE REPLACED

### REMOVE ENTIRELY
- The 4-card row (PendingTile ×4) in its current form
- The "Módulo de obligaciones — pendiente de activación" CardPanel
- The technical developer-oriented language
- The "Cuentas por pagar" PendingTile in Block B (it's already there and redundant)

### REPLACE WITH
- Block 1: Obligaciones Operativas (3 subsections)
- Block 2: Control Presupuestal (2 subsections)

---

## 4. WHAT CONCEPTS ARE AMBIGUOUS

| Concept | Ambiguity |
|---------|-----------|
| "Obligaciones" | Does this mean AP invoices? Bank loans? Both? Tax liabilities? |
| "Flujo comprometido" (Block B) | Is this cash committed to pay, or cash committed to collect? Currently means AR dueDate collection — confusing name |
| "Presupuesto" | Annual budget? Monthly target? Forecast? |
| "Tesorería" | Available cash? Net position? Operating buffer? |
| "Compromisos" | Legal commitments? Contractual? Operational? |

---

## 5. WHAT DATA IS MISSING

### Missing for AP/Obligations
- Supplier invoices to pay (model: `SupplierPayable` — does not exist)
- Bank loan schedules (model: `BankObligation` — does not exist)
- Available cash balance (model: `TreasurySnapshot` — does not exist)

### Available Immediately (no new models needed)
- Budget targets: `Budget` model (empty for Castillitos — needs data entry)
- Revenue actuals vs budget: `SaleRecord` + `Budget` via `getFpaVariance()`
- Cash inflow forecast: `CustomerReceivable` via `getFpaCashFlow()`
- Collection actuals: `CollectionRecord`
- AR aging: `CustomerReceivable` (already in Block B)

### Available With Manual Entry (via Agentik structured input)
- Upcoming supplier payments — could be entered as structured notes
- Bank obligations — could be entered manually as `ActionTask` with metadata
- Available cash — could be entered manually as a snapshot value

---

## 6. FUTURE INTEGRATIONS ANTICIPATED

| Integration | What It Enables |
|------------|-----------------|
| SAG CXP (Cuentas por Pagar) | Real AP invoices, supplier balances, payment schedule |
| Bank feed (Bancolombia, BBVA, Davivienda) | Real cash balance, bank transactions, loan status |
| SIIGO / Alegra / Helisa | Full accounting integration: journal entries, balance sheet items |
| DIAN XML (outbound) | Electronic AP invoices received from suppliers |
| Payroll system | Labor obligations, nómina commitments |

---

## 7. SEVERITY SUMMARY

| Issue | Severity | Effort to Fix |
|-------|----------|---------------|
| Block E has zero executive value | CRITICAL | Medium |
| No budget tracking in executive view | CRITICAL | Low (model exists, needs UI) |
| No cash pressure signal | HIGH | Medium (manual entry path first) |
| Language is technical not executive | HIGH | Low |
| Structural redundancy with Block B | MEDIUM | Low |
| Missing AP model | MEDIUM | High (future sprint) |
| Missing treasury model | MEDIUM | High (future sprint) |

---

## 8. DECISION MATRIX

| Component | Decision | Rationale |
|-----------|----------|-----------|
| AP obligations | Manual entry path first, real model in future sprint | No `SupplierPayable` model yet |
| Budget control | Build now — model + queries exist | `Budget` model + `getFpaVariance()` ready |
| Cash pressure | Show from AR inflow + manual AP side | Hybrid approach, no new models |
| Bank/credits | Intentional empty state with clear path | No model, no fake data |
| Presupuesto vs ventas | Build now | `SaleRecord` + `Budget` via `getFpaVariance()` |

---

*End of Audit — Proceed to Architecture Document*
