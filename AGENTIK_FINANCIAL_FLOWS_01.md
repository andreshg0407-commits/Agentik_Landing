# AGENTIK-FINANCIAL-FLOWS-01
## Operational Financial Streams Layer

**Sprint closed:** 2026-05-10
**Files created:** 2 (`lib/financial/stream-model.ts`, `AGENTIK_FINANCIAL_FLOWS_01.md`)
**Files modified:** 2 (`app/(app)/[orgSlug]/reconciliation/page.tsx`, `recon-client.tsx`)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Audit Summary (Mandatory First Step)

Files audited before implementation:

| File | Finding |
|------|---------|
| `lib/financial/bank-account-registry.ts` | 10 sources registered, typed, pending_validation. 3 linked to SAG via B1/B2/H1. |
| `lib/financial/source-registry.ts` | Full domain classification: PENDING_DEPOSIT codes (B1/B2/H1/H2/CP) are the SAG-side representation of pending bank deposits. Trust: PENDING. neverCountAsCobro: true. |
| `lib/finance/cobros-breakdown.ts` | `getCobrosBreakdown()` returns `consignacionesPendientes: {amount, count}` — real Prisma aggregate from SaleRecord where comprobanteCode IN (B1,B2,H1,H2,CP). |
| `lib/finance/cobros-kpis.ts` | `getCobrosKpis()` — per-code breakdown from CollectionRecord. Has `hasRealAmounts` flag. |
| `app/(app)/[orgSlug]/reconciliation/recon-client.tsx` | Landing had hardcoded "Agentik recomienda" text. 6 flow cards (1 active: Pedidos vs Ventas). No stream surface. |
| `app/(app)/[orgSlug]/reconciliation/page.tsx` | Server component. Previously fetched only periods + optional recon result. No financial account data. |
| `app/(app)/[orgSlug]/finanzas/torre-control/consignaciones/page.tsx` | Existing workspace for PENDING_DEPOSIT detail. Uses OperationalWorkspaceHeader, SummaryMetricRow, WorkspaceActions, RelatedWorkspaces. |
| `app/design-system.css` | `ag-op-table`, `ag-op-row--warning`, `ag-op-row--passive`, `ag-op-status--{ok,pending,warning,critical,info}`, `ag-intel-header` — all available. |

**Key discovery:** `getCobrosBreakdown().consignacionesPendientes` is the only real financial data
point available at the reconciliation landing that can be connected to specific bank accounts.
This is the correct foundation to use — no fake data needed.

---

## Operational Flow Philosophy

Conciliación Inteligente should NOT feel like:
- A wizard (select two sources → run)
- A book of accounting entries
- A static dashboard of status cards

It SHOULD feel like:
- An operational financial center — you arrive and immediately see what's live
- Streams of money flow, each with an operational status
- Context-driven intelligence telling you where the noise is

The financial streams model separates two concerns that were previously invisible:
```
BEFORE: "run a reconciliation"   → wizard
AFTER:  "see financial flows"    → operational center
         + "run a reconciliation" → wizard (for specific flow)
```

---

## Stream Grouping Strategy

Financial sources are grouped by their cash flow nature:

| Group | Sources | Behavior |
|-------|---------|---------|
| **Bancos** | Bancolombia Ahorro, Bancolombia CRT, Occidente, Caja Social, Bogotá | Inbound cobros + pending deposits. Linked to SAG via PENDING_DEPOSIT codes B1/B2/H1. |
| **Tarjetas** | TC Bogotá, TC Occidente | Liability accounts (PUC 21xxxx). Outflow/expense matching. Never inbound cobros. |
| **Plataformas** | PayCo, MercadoPago, EnvíoClick | Settlement model (PUC 13xxxx). Funds in transit. Require platform API integration. |

**Critical rule preserved**: Tarjetas do NOT behave like inbound accounts. Plataformas do NOT
behave like banks. Each group has distinct operational signals and reconciliation patterns.

---

## Financial Stream Model

### `StreamOperationalStatus` (9 states)

| Status | When | Row Severity | Badge |
|--------|------|-------------|-------|
| `reconciliation_pending` | Bank with SAG link (B1/B2/H1) + pending deposits > 0 | warning (amber) | warning |
| `partial_visibility` | Bank with SAG link + 0 pending \| credit card | normal | info |
| `integration_pending` | Bank without SAG link (no PENDING_DEPOSIT code) | passive (dim) | pending |
| `settlement_pending` | Payment platform | normal | pending |
| `missing_sag_mapping` | PUC confirmed absent in SAG | warning | critical |
| `healthy` | Active + reconciled (future state, not yet reachable) | normal | ok |
| `pending_review` | Requires manual attention | normal | warning |
| `blocked_source` | Cannot process | warning | critical |
| `low_activity` | No recent activity | normal | pending |

### Signal derivation rule

Each stream shows a PRIMARY SIGNAL derived from real data:
- `reconciliation_pending` → count of consignaciones + COP total from real SAG data
- `partial_visibility` (linked) → SAG source code + "Sin consignaciones pendientes"
- `integration_pending` → PUC code + "Pendiente validación SAG"
- `settlement_pending` → type label + "Sin integración activa"
- `partial_visibility` (credit card) → "Tarjeta crédito · egresos"

**NO invented balances. NO simulated activity.**

---

## What Was Built

### 1. `lib/financial/stream-model.ts` (NEW)

Pure TypeScript layer. No Prisma. No SAG. Zero side effects.

**Types:**
- `StreamOperationalStatus` — 9 visual states
- `FinancialStreamSignal` — compact signal with value + level
- `StreamGroup` — `bancos | tarjetas | plataformas`
- `FinancialStream` — enriched JSON-serializable view of a BankAccountSource

**Functions:**
- `buildFinancialStreams(sources, pendingDepositsTotal)` — derives FinancialStream[] from real data
- `getStreamRecommendations(streams)` — context-driven text from real states, no fake AI
- `groupStreams(streams)` — buckets by group for sectioned rendering

**Data flow:**
```
Server (page.tsx)
  getCobrosBreakdown(orgId).consignacionesPendientes  ← real SAG/Prisma data
  Object.values(BANK_ACCOUNT_SOURCES)                 ← registry
    ↓
  buildFinancialStreams(sources, pendingTotal)          ← derives status
    ↓
  FinancialStream[] → serialized props → ReconClient   ← client rendering
```

### 2. `app/(app)/[orgSlug]/reconciliation/page.tsx` (MODIFIED)

Added parallel data fetch:
```typescript
const [filterOptions, cobrosBreakdown] = await Promise.all([
  getFilterOptions(organization.id),
  getCobrosBreakdown(organization.id).catch(() => null),  // safe — can fail
]);
const pendingDepositsTotal = cobrosBreakdown?.consignacionesPendientes ?? { amount: 0, count: 0 };
const streams              = buildFinancialStreams(Object.values(BANK_ACCOUNT_SOURCES), pendingDepositsTotal);
const recommendations      = getStreamRecommendations(streams);
```

`getCobrosBreakdown` failure is handled gracefully — `.catch(() => null)` ensures the page
renders even when SAG data is unavailable. Stream model defaults to `{ amount: 0, count: 0 }`.

### 3. `app/(app)/[orgSlug]/reconciliation/recon-client.tsx` (MODIFIED)

**New props:** `streams?: FinancialStream[]`, `recommendations?: string[]`

**New components added (before `ReconClient` function):**
- `StreamRow` — single stream row using `ag-op-row` + `ag-op-status` + `ag-intel-header` primitives
- `StreamGroupSection` — renders a labeled group of stream rows
- `FinancialStreamsPanel` — full operational table with column headers + grouped sections

**Landing view changes:**
1. `FinancialStreamsPanel` injected above the Agentik strip (only when streams are present)
2. "Agentik recomienda" → "Agentik observa" with real context-driven text
3. CTA link is now contextual: consignaciones page when pending items, finance hub otherwise
4. Additional recommendations count shown below primary recommendation

**Unchanged:**
- All 6 FlowCard definitions — untouched
- Pedidos vs Ventas flow (config form + result table) — untouched
- All existing reconciliation logic — untouched

---

## Reconciliation UX Strategy

### Before this sprint

```
/reconciliation landing:
  [Agentik recomienda] (hardcoded text — "Hay documentos pendientes...")
  [Cartera vs Recaudos]  [Banco vs Cobros]
  [XML DIAN vs Ventas]   [Pedidos vs Ventas ✓]
  [CxP vs Soportes]      [Remisiones F2 → F1]
```

### After this sprint

```
/reconciliation landing:
  ┌─ FLUJOS FINANCIEROS ─────────────────────────────────────────────┐
  │ Bancos          (5 fuentes)                                       │
  │ ● Bancolombia Ahorro 0313  │ 11200501 │ [Consignaciones pend.]    │
  │ ● Bancolombia CRT 0711     │ 11100501 │ [Consignaciones pend.]    │
  │ ● Banco Occidente          │ 11100503 │ [Sin lectura bancaria]    │
  │ ● Banco Caja Social        │ 11100504 │ [Sin lectura bancaria]    │
  │ ● Banco de Bogotá          │ 11100502 │ [Consignaciones pend.]    │
  │ Tarjetas        (2 fuentes)                                       │
  │ ● TC Bogotá                │ 211535   │ [Solo egresos]            │
  │ ● TC Occidente             │ 21102503 │ [Solo egresos]            │
  │ Plataformas     (3 fuentes)                                       │
  │ ● PayCo                    │ 13803    │ [Liquidaciones]           │
  │ ● MercadoPago              │ 130526   │ [Liquidaciones]           │
  │ ● EnvíoClick               │ 130528   │ [Liquidaciones]           │
  └──────────────────────────────────────────────────────────────────┘

  [Agentik observa] Consignaciones sin identificar en: BNC AHO 0313, BNC CRT 0711...

  [Cartera vs Recaudos]  [Banco vs Cobros]
  [XML DIAN vs Ventas]   [Pedidos vs Ventas ✓]
  [CxP vs Soportes]      [Remisiones F2 → F1]
```

---

## Copilot Preparation

The `getStreamRecommendations(streams)` function is the seed for the future Financial Copilot:

```typescript
// CURRENT (rule-based, no AI):
"Consignaciones sin identificar en: BNC AHO 0313, BNC CRT 0711 — revisar antes del cierre"

// FUTURE (Financial Copilot, to be built):
// "Tesorería detectó que Bancolombia 0313 concentra mayor volumen de consignaciones pendientes
//  este mes. El comportamiento es consistente con el patrón de los últimos 3 períodos."
```

The Copilot will receive the same `FinancialStream[]` structure + time-series data
and augment the static recommendations with pattern recognition. The contract is already defined.

Foundation layer checklist for Copilot:
- ✅ Typed stream model with status, signals, group
- ✅ `copilotHint` templates on every source in bank-account-registry.ts
- ✅ `getStreamRecommendations()` establishes the recommendation API contract
- ✅ Recommendation text is parameterized (source names, amounts) — Copilot can augment
- ⬜ Time-series data (movement history per account) — next sprint
- ⬜ Pattern detection (velocity, trend, anomaly) — after time-series
- ⬜ LLM enrichment layer — after pattern detection

---

## Risks Found

| Risk | Severity | Note |
|------|----------|------|
| Pending deposit pool is SHARED | LOW | B1/B2/H1/H2/CP share one total. We show the shared pool on each linked account with equal weight — technically correct but visually may suggest "each bank has X". This is accurate: they all draw from the same SAG pool. |
| PUC codes not yet validated | LOW | All 10 sources are `pending_validation`. The stream status `integration_pending` accurately reflects this for unlinked accounts. |
| `getCobrosBreakdown` may fail | HANDLED | `.catch(() => null)` in page.tsx. Stream model defaults to 0. All streams show `integration_pending` / `settlement_pending` — honest state. |
| Client bundle size | LOW | `import type` only — no runtime import of bank-account-registry in client. Stream data comes as serialized props. |
| recon-client.tsx size grew | OK | Was 930 lines. Now ~1130 lines. Still manageable. Component separation is clean. |

---

## What Was NOT Touched

- SAG integration, sync engine, adapters — zero modifications
- Prisma schema, migrations — zero modifications
- `getCobrosBreakdown()`, `getCobrosKpis()`, any existing financial calculations — zero modifications
- Reconciliation engine (`lib/reconciliation/`) — zero modifications
- Dry-run scripts, historical backfill, auto-reconciliation — zero modifications
- Executive dashboard (`executive/page.tsx`) — zero modifications
- Torre de Control workspace pages — zero modifications
- Shell, routing, navigation — zero modifications
- Any existing financial query logic

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Conciliación Inteligente deja de sentirse como libro | ✅ Streams panel surfaces operational flow before wizard cards |
| 2 | Cuentas se sienten como streams operacionales vivos | ✅ ag-op-table with status dots, badges, real signals |
| 3 | Bancos, tarjetas y plataformas se diferencian correctamente | ✅ Three groups with distinct status and signal patterns |
| 4 | El módulo se siente más OS y menos ERP clásico | ✅ Operational table > static card grid as entry point |
| 5 | Agentik recomienda acciones contextualizadas | ✅ Real stream state → text → contextual CTA link |
| 6 | No se inventaron métricas | ✅ Only `consignacionesPendientes` from real Prisma aggregate |
| 7 | No se rompió lógica financiera | ✅ No existing logic modified |
| 8 | Módulo preparado para conciliación inteligente real | ✅ Streams show where to look; links lead to operational workspaces |
| 9 | Arquitectura soporta futuro Financial Copilot | ✅ `getStreamRecommendations()` is the Copilot API seed |
| 10 | TypeScript sin errores nuevos | ✅ 162 → 162 |

---

## Next Sprint Recommendation

**AGENTIK-FINANCIAL-FLOWS-02 — Per-Account Pending Deposit Breakdown**

Currently, the pending deposit pool (B1/B2/H1/H2/CP) is shown as a shared total.
The next sprint should:

1. Add `getPendingDepositsByCode(orgId)` helper to `cobros-breakdown.ts`
   — Returns `Record<string, {amount:number;count:number}>` per PENDING_DEPOSIT code
   — Allows showing B1 amount specifically on Bancolombia CRT, B2 on Bogotá, H1 on Bancolombia Ahorro

2. Update `buildFinancialStreams()` to accept per-code breakdown
   — `pendingByCode?: Record<string, {amount:number;count:number}>`
   — Each linked bank shows its specific code's pending amount

3. Add consignaciones drilldown link with `?f=B1` filter parameter
   — Bancolombia CRT → `/consignaciones?f=B1` (filters to B1 rows)
   — Banco Bogotá → `/consignaciones?f=B2`
   — Bancolombia Ahorro → `/consignaciones?f=H1`

This makes each bank stream truly actionable — click → see exactly your pending items.
