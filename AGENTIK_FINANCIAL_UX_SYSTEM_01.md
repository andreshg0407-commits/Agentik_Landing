# AGENTIK-FINANCIAL-UX-SYSTEM-01
## Financial Visual Language System — Tesorería Operativa Refinement

**Sprint:** AGENTIK-FINANCIAL-UX-SYSTEM-01
**File scope:** `app/(app)/[orgSlug]/finanzas/tesoreria/page.tsx`
**Backend constraint:** NO Prisma, NO APIs, NO engine, NO SAG changes

---

## Runtime philosophy

Tesorería Operativa must read as a **financial operations terminal**, not a dashboard:

- Information is dense but not cluttered
- Every pixel communicates state, not decoration
- Color is reserved for meaning (status, risk, action) — not aesthetics
- The operator should feel oriented within 2 seconds of landing

Design references: Stripe Treasury, Mercury, Linear for finance, Bloomberg simplified.

---

## Visual language decisions

### Color system

| Role | Token | Usage |
|------|-------|-------|
| Primary accent | `C.blueDark` | Actions, active states, primary links |
| Surface tint | `C.blueLight` | Status strip background, section accents |
| Structural borders | `C.blueBorder` | Status strip border, IA panel border |
| Body text | `C.ink` | Labels, values, headings |
| Supporting text | `C.inkMid` | Section subtitles, secondary labels |
| Muted / ghost | `C.inkFaint` | Timestamps, helper text, inactive |
| Positive signal | `C.green` | Inflow, OK status, positive forecast |
| Warning signal | `C.amber` | Partial sync, obligation due soon |
| Critical signal | `C.red` | Overdue, critical obligations |
| Background | `C.surface` | Card surfaces, note panels |
| Canvas | `C.canvas` | Page background |

**Principle:** Blue system for structure. Amber only for warning. Red only for critical. Green only for positive signals. Never use `C.exec` (dark navy) — it conflicts with the white/blue enterprise visual system.

### Typography

- `T.mono` as `fontFamily` (string value — never spread as object) for ALL operational data
- `T.sz["3xl"]` — primary KPI value (hero number, Disponible card)
- `T.sz["2xl"]` — secondary KPI values
- `T.sz.xl` — tertiary KPI values
- `T.sz.sm` — table row values, bank balance
- `T.sz.xs` — labels, status badges, metadata
- `T.sz["2xs"]` (if defined) or `T.sz.xs` — timestamps, fine print

**Principle:** Typographic hierarchy creates scannability. The eye must land on the most important number first.

---

## Spatial system

### Spacing hierarchy

| Context | Token | Rationale |
|---------|-------|-----------|
| Section gap | `S[8]` | Breathing room between major sections |
| Card padding (primary) | `S[6]` | Hero KPI card — generous, communicates importance |
| Card padding (standard) | `S[4]` | Standard tcard, bank card |
| Card padding (bank) | `S[5]` | Bank cards — slightly more room for multi-line content |
| Row padding | `S[3]` top/bottom, `S[4]` sides | Table rows — denser than cards but readable |
| Forecast row | `S[1]+2` top/bottom | Tight rows inside compact forecast columns |
| Label gap | `S[5]` margin-bottom | Section label → content breathing room |
| Inner section gap | `S[4]` | Sub-sections within a major section |
| Badge/chip gap | `S[2]` | Inline badge spacing |

### KPI card grid

```
gridTemplateColumns: "1.5fr 1fr 1fr 1fr"
```

The primary card (Disponible Total) is 1.5× wider — visual dominance signals importance.
The three supporting cards (Ingresos Hoy, Comprometido, Proyectado 7d) are equal-weight secondary.

This asymmetric grid is intentional: it mirrors how operators actually think about cash position — one primary number, several context numbers.

---

## Section architecture

### Section order (final)

```
1. OperationalWorkspaceHeader
2. Operational Status Strip (light blue)
3. Posición de Caja
   └─ KPI grid (asymmetric 1.5fr 1fr 1fr 1fr)
   └─ Bank distribution table
   └─ Dinero comprometido panel
      └─ Inline risk dot strip (not a separate block)
4. IA Financiera (moved up from #8)
5. Flujo del Día
6. Bancos y Cuentas
7. Obligaciones Pendientes
8. Forecast de Caja
9. Centro de Acciones Operativas
```

### Why IA moved to #4

IA Financiera was at position #8 (after Forecast) in the previous version.
Moved to #4 because:
- The operator needs intelligence context *before* reviewing daily flow and bank details
- IA signals reframe how the operator reads the subsequent sections
- Placing IA after Posición de Caja creates: "here's your position → here's what Agentik sees in that position → now dive into details"

---

## Status strip design

### Before (AGENTIK-TREASURY-OPS-01)
```
background: C.exec  (dark navy)
color: white
```
Problem: Dark strip created a visual system break. Agentik's enterprise shell is white/light. The dark bar felt like a foreign element.

### After (AGENTIK-FINANCIAL-UX-SYSTEM-01)
```
background: C.blueLight
border: 1px solid ${C.blueBorder}
borderRadius: R.md
```
Result: The strip integrates with the white shell while still communicating "operational runtime" through blue system tinting.

### Strip item layout

Each badge item uses a stacked vertical layout:
- Label: `T.sz["2xs"]` (or `T.sz.xs`), `C.inkFaint`, uppercase
- Value: `T.sz.sm`, `C.ink`, bold
- Dividers: `1px solid ${C.blueBorder}` between items (not between label and value)

---

## Risk communication

### Before
A separate amber background block below the committed panel:
```
background: C.amberLight
border: 1px solid ${C.amberBorder}
```
Problem: Full amber block created visual fatigue. Not every page load has critical risk — the block always appeared regardless of severity, training operators to ignore it.

### After
Inline dot strip inside the committed panel:
```
borderTop: `1px solid ${C.canvas}`
paddingTop: S[3]
```
Each risk item: severity dot (colored) + text inline.

Result: Risk communicates without alarming. Operators see it in context of the committed panel — where risk actually lives.

---

## Border language

### Structural borders
```
border: `1px solid ${C.inkGhost}`
```
Used for: table rows, card separators, forecast column edges.

### Accent left borders
```
borderLeft: `3px solid ${C.blueDark}`   // IA panels, info notes
borderLeft: `3px solid ${C.amber}`      // Warning notes (obligation IA note)
borderLeft: `3px solid ${COLOR}`        // Bank card status accent (by bank status)
```

### Top accent borders (bank cards)
```
borderTop: `3px solid ${BANK_ACCENT[bank.status]}`
```
Status → color mapping:
- `connected` → `C.green`
- `partial` → `C.blue`
- `requires_action` → `C.amber`
- `pending` → `C.inkGhost`

### Principle
Three border weights: 1px structural / 3px accent. Never mixed. Accent borders always on one side only — they communicate direction (importance flows from that edge).

---

## Movement feed rows

Padding: `S[3]` top/bottom, `S[4]` left/right.
Direction accent: left 3px border, `C.green` for inflow, `C.red` for outflow.
Dividers: `borderBottom: 1px solid ${C.canvas}` except last row.

This creates a "financial terminal feed" feel — dense rows with clear directional signal.

---

## Obligation rows

Same padding as movement rows: `S[3]` / `S[4]`.
Left accent border: `3px solid ${SEV_DUE_CLR[ob.severity]}`.
Status badge: right-aligned, `ag-op-status ag-op-status--{SEV_CSS[severity]}`.

### Obligation IA note

```
background: C.surface
borderLeft: 3px solid ${C.amber}
padding: S[3] S[4]
borderRadius: R.sm
```

Not a full amber background block. Surface + left amber border = "this is advisory, not alarming."

---

## Forecast design

Three columns (7d / 30d / 90d), each rendered as a `ag-tcard` with:
- Period total at top (colored by positive/negative)
- Variable rows below with `padding: S[1]+2 0` and **no** `borderBottom`

### Why no borderBottom on forecast vars
Tight forecast rows with borders between them created a "spreadsheet" feeling — antithetical to the operational terminal aesthetic. The variables are a flowing breakdown, not a table. Removing borders makes the forecast read as a continuous data block.

---

## Bank card design

Previous version had a "Conciliación pendiente" text flag inside each bank card.
Removed in this sprint: it cluttered the card and repeated information available in the Obligaciones section.

Bank card structure:
- Top border accent (3px, by status)
- Bank name + status badge (right-aligned)
- Balance: `T.sz.xl`, bold
- Sync time: `T.sz.xs`, `C.inkFaint`
- CTA: `ag-action-ghost` full-width

---

## Type system

All lookup Records are typed against union types — no string indexing:

```typescript
type BankStatus = "connected" | "partial" | "requires_action" | "pending";
type Severity   = "critical" | "high" | "medium" | "low";

const BANK_STATUS_CSS: Record<BankStatus, string> = { ... };
const BANK_STATUS_LBL: Record<BankStatus, string> = { ... };
const BANK_ACCENT:     Record<BankStatus, string> = { ... };
const SEV_CSS:         Record<Severity, string>   = { ... };
const SEV_DOT:         Record<Severity, string>   = { ... };
const SEV_DUE_CLR:     Record<Severity, string>   = { ... };
const SEV_LBL:         Record<Severity, string>   = { ... };
```

---

## ag-* CSS class usage

| Class | Usage |
|-------|-------|
| `ag-kpi-card` | KPI summary cards |
| `ag-kpi-card.ag-warning` | KPI card with amber warning accent |
| `ag-kpi-bar` | Horizontal KPI bar strip |
| `ag-tcard` | Standard operational card surface |
| `ag-op-row` | Table-style operational row |
| `ag-op-row--critical` | Row with critical accent |
| `ag-op-row--warning` | Row with warning accent |
| `ag-op-row--passive` | Row with muted/passive state |
| `ag-op-status ag-op-status--ok` | Green status badge |
| `ag-op-status ag-op-status--warning` | Amber status badge |
| `ag-op-status ag-op-status--critical` | Red status badge |
| `ag-op-status ag-op-status--info` | Blue status badge |
| `ag-op-status ag-op-status--pending` | Gray status badge |
| `ag-intel-header` | Section label strip |
| `ag-action-primary` | Primary CTA button |
| `ag-action-secondary` | Secondary CTA button |
| `ag-action-ghost` | Ghost CTA button |
| `ag-action-tray` | Bottom action tray container |
| `ag-action-row` | Action row inside tray |

---

## What was NOT changed

- Prisma schema — zero changes
- SAG adapters — zero changes
- Any API routes — zero changes
- Torre de Control, Conciliación, other modules — untouched
- `AGENTIK-FINANCE-ARCHITECTURE-01` navigation structure — untouched

---

## TypeScript compliance

- Zero new errors introduced.
- Project total: 160 errors (unchanged from baseline).
- All helper Records typed against `BankStatus` and `Severity` union types.
- `T.mono` used as string value (`fontFamily: T.mono`) — never spread.
- `StatusSignal` values: `"ok" | "warning" | "critical" | "neutral"` only.
- `OperationalWorkspaceHeader` uses `breadcrumbs: BreadcrumbItem[]` prop pattern.
