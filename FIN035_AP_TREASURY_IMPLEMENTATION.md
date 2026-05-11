# FIN-03.5 — AP / Treasury Activation Implementation Report
## STATUS: COMPLETE
## DATE: 2026-05-07

---

## Summary

Torre de Control's `TesoreriaOperativa` block has been activated with real SAG/PYA
operational data. Two of three cards now surface live numbers derived from SaleRecord
using the canonical financial source registry. The third card ("Bancos y créditos")
remains a placeholder — that data does not exist in SAG.

**TypeScript status:** Zero errors introduced. Zero pre-existing errors affected.

---

## 1. Data Layer — `lib/finance/ap-kpis.ts` (NEW)

### Architecture Decision

There is no `payableRecord` model in Prisma. SAG AP documents (C1, G1, C2) are stored
in `SaleRecord` like all other SAG documents. The `comprobanteCode` field identifies
the document type; `customerName`/`customerNit` identify the supplier counterparty.
`saleDate` is the obligation date proxy — `SaleRecord` has no `dueDate` field.

### Source Authority

All source code groups imported exclusively from `lib/financial/source-registry.ts`:
- `AP_CREATION_SOURCES` → C1, G1, C2 (creates AP obligations)
- `AP_REDUCTION_SOURCES` → DC, DG (reduces AP obligations)
- `PENDING_DEPOSIT_SOURCES` → B1, B2, H1, H2, CP (consignaciones sin identificar)

No hardcoded source arrays in `ap-kpis.ts`.

### Query Design

Single `Promise.all` with two queries:

**Query 1 — `groupBy comprobanteCode`**
```
WHERE organizationId = ? AND comprobanteCode IN (AP_CREATION + AP_REDUCTION + DEPOSIT)
```
- Partitioned in-memory into creation, reduction, deposit buckets
- One round-trip for all three KPI groups

**Query 2 — `groupBy customerName`**
```
WHERE organizationId = ? AND comprobanteCode IN AP_CREATION_SOURCES
ORDER BY _sum.amount DESC LIMIT 5
```
- Top supplier names for contextual display in the CxP card

### Return Type

```ts
interface ApKpis {
  totalCreated:    { amount: number; count: number };  // C1+G1+C2 gross
  totalReduced:    { amount: number; count: number };  // DC+DG gross
  netBalance:      number;                              // created - reduced
  topSuppliers:    { name: string; amount: number; count: number }[]; // up to 5
  pendingDeposits: { amount: number; count: number };  // B1+B2+H1+H2+CP
}
```

---

## 2. Server Component Integration — `executive/page.tsx`

### Import added (line 34)
```ts
import { getApKpis, type ApKpis } from "@/lib/finance/ap-kpis";
```

### Promise.all extended (13th item)
```ts
const [..., cobrosSegments, apKpis] = await Promise.all([
  // ...existing 12 fetches...
  getApKpis(orgId, carteraWindow).catch(() => null) as Promise<ApKpis | null>,
]);
```

`apKpis` is scoped to `carteraWindow` — same fiscal window used by cartera and cobros.
Failure is silently caught and renders `null` (empty state), not a crash.

### Component call updated
```tsx
<TesoreriaOperativa orgSlug={orgSlug} apKpis={apKpis} />
```

---

## 3. Component — `TesoreriaOperativa` Updated

### Props change
```ts
// Before:
function TesoreriaOperativa({ orgSlug }: { orgSlug: string })

// After:
function TesoreriaOperativa({ orgSlug, apKpis }: { orgSlug: string; apKpis: ApKpis | null })
```

### Card 1 — Cuentas por pagar (ACTIVATED)

| State | Display |
|-------|---------|
| `apKpis === null` or `totalCreated.count === 0` | `—` · "Sin obligaciones registradas" |
| Has AP data | `fmtCOP(netBalance)` · doc count · top 2 supplier names |

Amount: net AP balance (creation − reduction).
Suppliers: first 2 of topSuppliers as contextual note.

### Card 2 — Bancos y créditos activos (PLACEHOLDER — no SAG data)

Remains static empty state. Bank credit/leasing data is not present in SAG/PYA.
No fake data introduced. Clean empty state with actionable CTA.

### Card 3 — Tesorería inmediata (ACTIVATED)

Repurposed from "próximos compromisos 7 días" (no dueDate) to pending deposits —
the closest real treasury signal available in SAG.

| State | Display |
|-------|---------|
| No deposits | `—` · "Sin consignaciones pendientes" |
| Has deposits | `fmtCOP(pendingDeposits.amount)` · count · management prompt |

Sublabel updated: "Consignaciones pendientes · por identificar" (accurate to data).

---

## 4. Fiscal Window Scoping

`getApKpis` respects the `carteraWindow` fiscal window selector:

```ts
const dateFilter =
  window && window.mode !== "full_history"
    ? { gte: window.from, lte: window.to }
    : undefined;
```

This mirrors the exact same pattern used by `getCobrosBreakdown` and `getCarteraKpis`.
Changing the cartera window in the UI will re-fetch AP and deposit data for that period.

---

## 5. What Was NOT Built (by design)

| Feature | Reason |
|---------|--------|
| AP aging buckets (0-30d, 31-60d, etc.) | No `dueDate` on `SaleRecord` — `saleDate` only |
| Supplier detail page | Out of scope for V1 — CTA links to `/finance` |
| Bank balance integration | No bank connector in SAG/PYA schema |
| Budget/presupuesto activation | `ControlPresupuestal` Block B — separate sprint |
| Próximos compromisos (7-day) | Requires `dueDate` or calendar integration — future |

---

## 6. Architecture State After FIN-03.5

```
lib/financial/source-registry.ts   ← CANONICAL AUTHORITY
        │
        ├── AP_CREATION_SOURCES    → ap-kpis.ts (C1, G1, C2 total + supplier query) ✓
        ├── AP_REDUCTION_SOURCES   → ap-kpis.ts (DC, DG reduction total) ✓
        └── PENDING_DEPOSIT_SOURCES → ap-kpis.ts (B1, B2, H1, H2, CP deposits) ✓

Torre de Control data path (AP/Treasury layer activated):
  executive/page.tsx
    → getApKpis(orgId, carteraWindow)     [NEW — AP + deposits]
    → TesoreriaOperativa({ apKpis })      [ACTIVATED — 2 of 3 cards live]
```

---

## 7. FIN Series Status

| Sprint | Title | Status |
|--------|-------|--------|
| FIN-01 | Financial Source Intelligence Map | COMPLETE |
| FIN-02 | Financial Source Registry | COMPLETE |
| FIN-03 | Torre de Control Registry Migration | COMPLETE |
| FIN-03.5 | AP / Treasury Activation | **COMPLETE** |
| FIN-04 | Root fix in source-semantic-rules.ts (SI cobro() root cause) | PENDING |
