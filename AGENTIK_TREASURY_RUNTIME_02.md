# AGENTIK-TREASURY-RUNTIME-02
## Tesorería Operativa — Runtime Consolidation & Financial Decision Engine Foundation

**Sprint:** AGENTIK-TREASURY-RUNTIME-02
**File scope:** `app/(app)/[orgSlug]/finanzas/tesoreria/page.tsx`
**Backend constraint:** NO Prisma, NO APIs, NO engine, NO SAG changes

---

## New runtime philosophy

Tesorería is NOT a dashboard. It is the operational financial nerve center of the enterprise.

Prior to this sprint, the page was architecturally correct but still read as a collection of modular sections. This sprint consolidates it into a unified financial runtime where:

- Every section has a reason to exist in sequence
- Intelligence (Decision Engine) appears before operational detail
- Banks are infrastructure, not a visual catalog
- Forecast communicates runway, not just numbers
- Actions are prioritized by urgency, not listed alphabetically

The mental model the operator must feel is: **I can understand my financial position, detect risk, and act — in seconds.**

---

## Section architecture (final)

```
1. OperationalWorkspaceHeader        — context + breadcrumb
2. Operational Status Strip          — 5-signal runtime awareness
3. Posición de Caja                  — KPI grid + bank distribution + committed
4. Financial Decision Engine         — AI signals: risk + impact + action
5. Flujo del Día                     — inflows/outflows + movement feed
6. Banking Runtime                   — dense operational table (not card catalog)
7. Obligaciones Pendientes           — obligations grid + AI note
8. Financial Runway                  — forecast with runway indicator + pressure
9. Centro de Decisiones              — 3-tier action layer: critical/operational/strategic
```

---

## Financial Decision Engine

### Design philosophy

The IA Financiera section was replaced by the Financial Decision Engine.

The key difference:
- **Before**: static list of findings + generic action buttons
- **After**: each signal is a structured observation with severity, horizon, financial impact, and a contextual action

### Signal card structure

Each signal card contains:
1. `SEV_LBL` badge (CRÍTICO / ATENCIÓN / NORMAL / INFO) + horizon label
2. Observation title — bold, `T.sz.sm`, `lineHeight: 1.5`
3. Impact line — `T.sz.xs`, `C.inkMid` — quantified financial context
4. Contextual action CTA — links directly to the relevant workspace

### Visual encoding

Top accent border: `3px solid ${SEV_DOT[severity]}` — the severity color bleeds into the card from the top, creating an immediate reading signal without full-card coloring.

Grid: `1fr 1fr` — two signals per row. Four signals = 2×2 grid. Readable and scannable.

### Signal data shape

```typescript
AI_SIGNALS: Array<{
  severity: Severity;
  horizon: string;        // "9 días" | "HOY" | "Esta semana" | "Ahora"
  title: string;          // observation — what Agentik detected
  impact: string;         // financial context — amount + category
  action: string;         // CTA label — contextual, not generic
  actionHref: string;     // direct link to resolution workspace
}>
```

### Future activation

Replace `AI_SIGNALS` constant with:
`GET /api/orgs/[orgSlug]/tesoreria/ai-signals`

---

## Banking Runtime

### Design philosophy

The previous "Bancos y Cuentas" section used one card per bank — visually rich but informationally thin. Five cards felt like a product catalog.

The Banking Runtime uses a **dense operational table** — one row per bank, six columns:

| Column | Content |
|--------|---------|
| Banco | Name + anomaly dot if `hasAnomaly` |
| Saldo | Balance amount (or `—` if pending) |
| Estado | Status badge (`ag-op-status--*`) |
| Última sync | Sync timestamp label |
| Conciliación | Pending count with link to `/reconciliation`, or `—` |
| Acción | Contextual button (`ag-action-secondary` for requires_action, `ag-action-ghost` otherwise) |

Grid: `1fr 90px 88px 120px 110px 120px` — fixed widths for all data columns, flexible for the name.

### Conciliation bridge

The Conciliación column creates a direct operational link between Tesorería and Conciliación Inteligente:
- Banks with pending items show a count + amber link → `/reconciliation`
- Banks without pending items show `—`

This is the "detect here, resolve there" pattern: Tesorería surfaces the problem, Conciliación resolves it.

### Footer

Footer strip (`C.blueLight`) shows the total synchronized balance — sum of all non-pending banks.

### New data field: `concilPending`

Added to `BANKS` array:
```typescript
concilPending: number  // PLACEHOLDER — replace with real count from reconciliation engine
```

### New data field: `hasAnomaly`

Added to `BANKS` array:
```typescript
hasAnomaly: boolean  // PLACEHOLDER — replace with anomaly detection from sync engine
```

---

## Financial Runway

### Design philosophy

The previous forecast showed three cards with projected totals and variable breakdowns. This was structurally correct but communicated numbers, not meaning.

The Financial Runway adds:
1. **Runway indicator** — "9 días", "18 días", "34 días" — the primary question: *how long does liquidity last?*
2. **Scenario label** — "Si cartera fluye normal", "Proyección base", "Estimación histórica"
3. **Pressure alert** — a dot + text noting the peak pressure event in each period

### Runway visual encoding

Runway number: `T.sz["2xl"]`, bold, colored by severity:
- `info` severity → `C.ink` (stable)
- `warning` severity → `C.amber` (under pressure)

Label "runway" beside it in `T.sz.xs`, `C.inkFaint` — creates the compound reading "9 días runway".

### Pressure alert

Positioned at the bottom of each forecast card, separated by a `1px solid ${C.lineSubtle}` border:
- `6px` amber dot
- Text: `T.sz.xs`, `C.inkLight`

Communicates *which* event creates risk, not just that risk exists.

### New data shape

```typescript
FORECAST_PERIODS: Array<{
  period: string;
  runway: string;          // "9 días" — how long liquidity lasts
  runwaySev: Severity;     // colors the runway number
  amount: number;          // projected total
  scenario: string;        // assumption label
  pressureAlert: string;   // peak pressure event description
  vars: Array<{ l: string; v: string; pos: boolean }>;
}>
```

---

## Centro de Decisiones

### Design philosophy

The previous "Centro de Acciones Operativas" was a flat list of buttons. All actions were visually equivalent — no urgency signal.

The Centro de Decisiones uses a **3-tier action grid**:

| Tier | Top border | Label | Action class | Horizon |
|------|-----------|-------|-------------|---------|
| Crítico | `C.red` | "Crítico · HOY" | `ag-action-primary` (first), `ag-action-secondary` | Immediate |
| Operativo | `C.amber` | "Operativo · Esta semana" | `ag-action-secondary` | This week |
| Estratégico | `C.blue` | "Estratégico · Forecast" | `ag-action-ghost` | Planning horizon |

Top border accent: `3px solid ${color}` — same pattern as Financial Decision Engine cards, creating visual consistency across the page.

The operator reads the action layer from left to right, by urgency. Critical first, then operational, then strategic.

### Conciliation bridge in decisions

The Critical tier contains a direct link to `/reconciliation` — "Abrir conciliación IA →". This is the primary action bridge between Tesorería and Conciliación Inteligente at the decision layer.

---

## Flujo del Día — conciliation bridge

Added to the movement feed header:
```tsx
<Link href={`/${orgSlug}/reconciliation`} style={{ color: C.blueDark, fontWeight: 600 }}>
  3 sin identificar → Conciliar
</Link>
```

This creates a contextual bridge: the operator sees 3 unidentified movements and can immediately open Conciliación Inteligente without leaving the context.

---

## Visual system refinements

### Border language (global)

All containers migrated from `C.line` to `C.lineSubtle`:
- Previous: `border: 1px solid ${C.line}`
- After: `border: 1px solid ${C.lineSubtle}`

`C.lineSubtle` is lighter than `C.line`. Borders become structural scaffolding, not visual elements.

### Top accent pattern

Three section types now use `borderTop: 3px solid ${color}`:
- Financial Decision Engine signal cards (severity color)
- Centro de Decisiones tier cards (urgency color)

This creates a consistent "priority bleeds from the top" visual language across the page.

### Fragmentation reduction

- Banking catalog (5 cards) → single operational table (1 container)
- Forecast (3 separate cards) → 3-column grid of runway panels
- Action tray (flat list) → 3-tier prioritized decision grid
- IA panel (2-column list + buttons) → 2×2 signal card grid

---

## Conciliation bridge pattern

Tesorería does NOT replicate Conciliación Inteligente. It surfaces signals that require resolution there.

Bridge points established in this sprint:

| Location | Signal | Action |
|----------|--------|--------|
| Flujo del Día — movement feed header | "3 sin identificar" | → `/reconciliation` |
| Banking Runtime — Conciliación column | "{N} pendientes" per bank | → `/reconciliation` |
| Centro de Decisiones — Critical tier | "Abrir conciliación IA" | → `/reconciliation` |

---

## What was NOT changed

- Prisma schema — zero changes
- SAG adapters — zero changes
- Any API routes — zero changes
- Navigation structure — untouched
- Other Finanzas modules — untouched

---

## TypeScript compliance

- Zero new errors introduced.
- Project total: 160 errors (unchanged from baseline).
- `FORECAST_PERIODS` array typed with explicit `Severity` casts on `runwaySev`.
- All lookup Records typed against `BankStatus` and `Severity` union types.
- New `BANKS` fields (`concilPending`, `hasAnomaly`) typed inline in the array shape.
