# UX-SYSTEM-01 — Operational Workspace Navigation Layer
## STATUS: COMPLETE
## DATE: 2026-05-08

---

## Objective

Build a reusable operational workspace pattern that makes every Torre de Control detail page feel like a connected workspace inside Agentik — not an isolated report.

Before: dashboard → page → browser back
After: executive command center → operational workspace → action → related workspace

---

## Components Created

### `components/workspace/operational-workspace-header.tsx`

Renders:
- `<nav>` breadcrumb trail with `›` separators
- Semantic `<h1>` page title
- Optional subtitle line (record count, source, date context)
- Optional status badge pill (signal dot + label, right-aligned)

Props:
```typescript
breadcrumbs:  { label: string; href?: string }[]
title:        string
subtitle?:    string
status?:      "ok" | "warning" | "critical" | "neutral"
statusLabel?: string
```

Signal colors:
| Status   | Dot     | Text              |
|----------|---------|-------------------|
| ok       | #22c55e | C.green (#16a34a) |
| warning  | #f59e0b | C.amber (#d97706) |
| critical | #ef4444 | C.red   (#dc2626) |
| neutral  | C.inkGhost | C.inkLight     |

---

### `components/workspace/summary-metric-row.tsx`

Renders a horizontal metric bar: label + value + optional note per metric. First metric has no left border; subsequent ones have `1px solid C.line` dividers.

Props:
```typescript
metrics: { label: string; value: string | number; accent?: string; note?: string }[]
variant?: "normal" | "warning"
```

Variant "warning" uses `C.amberLight` background + `C.amberBorder` border — for consignaciones and AP pages.

---

### `components/workspace/workspace-actions.tsx`

Renders a horizontal action row of `<Link>` elements:
- `primary` — filled blue background (#fff text), bold
- `secondary` — transparent background, `C.line` border, `C.inkMid` text
- `ghost` — transparent, no border, `C.blue` text

Props:
```typescript
actions: { label: string; href: string; variant: "primary" | "secondary" | "ghost"; accent?: string }[]
```

`accent` overrides the primary background color (used in cuentas-por-pagar to apply `#1e40af`).

---

### `components/workspace/related-workspaces.tsx`

Renders a labeled grid of workspace link cards at the bottom of every page.
- `repeat(auto-fill, minmax(180px, 1fr))` — responsive grid, fills available width
- Each card: left accent border + label + optional description
- Semantic `<Link>` for full keyboard/screen-reader accessibility

Props:
```typescript
items: { label: string; description?: string; href: string; accent?: string }[]
title?: string  // defaults to "Ir a"
```

---

## Pages Updated

### Page structure (all 4 pages follow this exact pattern):

```
OperationalWorkspaceHeader   ← breadcrumbs + title + status badge
SummaryMetricRow             ← key metrics from existing data fetches
WorkspaceActions             ← primary CTA + secondary links + ghost return
──────────────────────────
Detail content               ← tables / cards (data unchanged)
──────────────────────────
RelatedWorkspaces            ← 4–5 related workspace links
```

### `/finanzas/torre-control/cobros-hoy`

| Element | Value |
|---------|-------|
| Breadcrumbs | Finanzas › Torre de Control → `/executive` › Cobros de hoy |
| Status signal | ok when records > 0; neutral when empty |
| Summary metrics | Total cobrado · Recibos · Conciliación (Pendiente/amber) · Día operativo |
| Primary action | Gestionar conciliación → `/reconciliation` |
| Related workspaces | Cobros identificados · Consignaciones · Cuentas por pagar · Conciliación · Cartera |

### `/finanzas/torre-control/cobros-identificados`

| Element | Value |
|---------|-------|
| Breadcrumbs | Finanzas › Torre de Control → `/executive` › Cobros identificados |
| Status signal | ok when totalCobros > 0; neutral otherwise |
| Summary metrics | Total cobros · Recibos · Empresa F1+F2 (blue) · Consignaciones pendientes (amber) |
| Primary action | Gestionar conciliación → `/reconciliation` |
| Related workspaces | Cobros de hoy · Consignaciones · Cuentas por pagar · Conciliación · Cartera |

### `/finanzas/torre-control/consignaciones`

| Element | Value |
|---------|-------|
| Breadcrumbs | Finanzas › Torre de Control → `/executive` › Consignaciones pendientes |
| Status signal | warning when pending > 0; ok when clear |
| Summary bar variant | "warning" (amber background) when pending |
| Summary metrics | Monto pendiente (amber) · Consignaciones · Estado |
| Primary action | Ver conciliación → `/reconciliation` |
| Related workspaces | Cobros de hoy · Cobros identificados · Cuentas por pagar · Conciliación |

### `/finanzas/torre-control/cuentas-por-pagar`

| Element | Value |
|---------|-------|
| Breadcrumbs | Finanzas › Torre de Control → `/executive` › Cuentas por pagar |
| Status signal | warning when records > 0; neutral otherwise |
| Data gap notice | Preserved — amber notice when `!hasAmounts && records.length > 0` |
| Summary metrics | Documentos · Monto neto (inkLight/gray) · Obligación más antigua (if present) |
| Primary action | Ir a Tesorería → `/finance` (accent: #1e40af) |
| Related workspaces | Cobros de hoy · Cobros identificados · Consignaciones · Conciliación |

---

## Navigation Pattern

```
Breadcrumb:
  Finanzas (no link — domain label)
  › Torre de Control  →  /${orgSlug}/executive
  › [Current page]    (no link — current location)

WorkspaceActions order:
  [Primary CTA]       →  destination module
  [Secondary link 1]  →  adjacent torre-control workspace
  Torre de Control    →  /${orgSlug}/executive  (always last, ghost style)

RelatedWorkspaces:
  Always includes 4–5 cards covering the full torre-control constellation
  + reconciliation + collections when applicable
```

---

## What Was NOT Changed

- All data fetches (`getCobrosBreakdown`, `getTodayCollectionDetail`, `getPendingDepositDetail`, `getApDocumentDetail`, `getOldestApRecord`) — untouched
- Financial source registry — untouched
- Reconciliation logic — untouched
- Prisma schema — untouched
- Table column structure, row rendering, and grid layouts — identical to pre-sprint
- AP $0 data gap notice — preserved in cuentas-por-pagar

---

## TypeScript Status

Zero errors introduced. Verified:
```
npx tsc --noEmit | grep "workspace/\|torre-control/(cobros|consignaciones|cuentas)"
→ (no output — clean)
```

---

## Limitations

| Item | Notes |
|------|-------|
| RelatedWorkspaces hover state | Static — no `:hover` elevation. Links are secondary nav; primary card interactions handled upstream in executive/page.tsx. Can be added with a CSS injection `<style>` block if desired. |
| Breadcrumb "Finanzas" is not a routable page | Domain label rendered as plain text — not a link. If a `/finanzas` index page is created later, update breadcrumb props to add `href`. |
| WorkspaceActions on mobile | Currently wraps to new lines via `flexWrap: "wrap"`. On very narrow screens, action labels may be too wide. Low risk given operational context (desktop-primary). |
| `SummaryMetric.value: string \| number` | Numbers render correctly in JSX but callers must handle formatting (fmtCOP) before passing. `number` type is accepted but unformatted integers will display as-is. |

---

## Next Recommended UX Sprint

### UX-SYSTEM-02 — Workspace Shell Data Context Bar

After this sprint, the four Torre de Control workspaces are consistent. The next gap is:

> When the user is inside an operational workspace, the right rail (264px) is empty. It could show live context: last sync time, SAG connector status, quick metric recap, and tenant/fiscal window selector.

**Proposal:**
- Extend `RightOpsRail` (already exists) to accept workspace-specific content slots
- Inject Torre de Control context: last SAG sync timestamp, active fiscal window, key metric recap (total cobros hoy, consignaciones count)
- Make it data-aware via RSC props passed from each workspace page

This would complete the "operating system" feel: the canvas changes but the right rail always shows relevant operational context.

### Alternative: UX-SYSTEM-02B — Workspace Shell Keyboard Navigation

Add `⌘K` command palette for cross-workspace navigation — type "consignaciones", "cartera", "cobros hoy", etc. to jump directly to any operational workspace without touching the sidebar.
