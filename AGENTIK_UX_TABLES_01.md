# AGENTIK-UX-TABLES-01 — Intelligent Operational Tables
**Sprint:** AGENTIK-UX-TABLES-01
**Depends on:** AGENTIK-UX-FOUNDATION-01, AGENTIK-UX-OPS-01

---

## Objective

Evolve the Torre de Control operational tables from generic admin tables into
Intelligent Operational Tables — with scan-speed UX, row hierarchy, brand-tinted
atmosphere, and a consistent status badge system.

All changes are purely visual. No logic, routing, data, sort/filter behavior,
TanStack config, type definitions, or Prisma queries were modified.

---

## Files Modified

| File | Changes |
|------|---------|
| `app/design-system.css` | Added §13 — Operational Tables (112 lines) |
| `app/(app)/[orgSlug]/finanzas/torre-control/cobros-hoy/table-client.tsx` | 4 targeted edits |
| `app/(app)/[orgSlug]/finanzas/torre-control/consignaciones/table-client.tsx` | 5 targeted edits |
| `app/(app)/[orgSlug]/finanzas/torre-control/cuentas-por-pagar/table-client.tsx` | 4 targeted edits |

---

## §13 New CSS Classes (design-system.css)

| Class | Purpose |
|-------|---------|
| `.ag-op-table` | Table container — brand-tinted border + radius + shadow |
| `.ag-op-table-head` | Header zone — brand-50 tinted bg + brand-line bottom border |
| `.ag-op-row` | Row base — hover brand-50 bg + left bar reveal on hover |
| `.ag-op-row--critical` | Severity: red gradient surface + permanent red left bar |
| `.ag-op-row--warning` | Severity: amber gradient surface + permanent amber left bar |
| `.ag-op-row--passive` | Severity: 70% opacity for low-priority rows |
| `.ag-op-status` | Base status badge — mono font, uppercase, compact |
| `.ag-op-status--ok` | Green: collected / resolved |
| `.ag-op-status--pending` | Amber: awaiting processing |
| `.ag-op-status--warning` | Orange: needs attention |
| `.ag-op-status--critical` | Red: overdue / blocked |
| `.ag-op-status--info` | Brand blue: informational |
| `.ag-op-search` | Search input — brand focus ring via `:focus` selector |

---

## Visual Changes Per File

### cobros-hoy/table-client.tsx — 4 edits

| Element | Before | After |
|---------|--------|-------|
| Table container | `border/borderRadius/overflow/boxShadow` inline | `className="ag-op-table"` |
| Header row | `background: C.surface` + `borderBottom: C.line` inline | `className="ag-op-table-head"` |
| Data rows | Plain `<div>` | `className="ag-op-row"` |
| Search input | `outline: "none"` inline | `className="ag-op-search"` + focus handled by CSS |

**Effect:** Table container is now brand-tinted. Header has a subtle brand-50 wash
(reads as intelligent data surface, not plain gray). Rows reveal a 3px brand-blue
left bar on hover with brand-50 background wash — scan speed is immediately
improved because the hover state communicates "this row is actionable."

### consignaciones/table-client.tsx — 5 edits

Same container/header/search changes as cobros-hoy, plus:

| Element | Before | After |
|---------|--------|-------|
| Data rows | Plain `<div>` | `className="ag-op-row ag-op-row--warning"` |
| PENDIENTE badge | 6 inline style properties | `className="ag-op-status ag-op-status--pending"` |

**Effect:** All consignaciones rows get a persistent amber left bar + subtle amber
gradient wash — immediately communicating that these are pending items requiring
action. The PENDIENTE badge is now part of the unified status system (cleaner,
less brittle, consistent with all other status contexts in the product).

### cuentas-por-pagar/table-client.tsx — 4 edits

Same container/header/search/row changes as cobros-hoy.

**Effect:** Brand-tinted table atmosphere consistent with other Torre de Control tables.

---

## Design Logic

### Why brand-50 header tint?

The table header (`ag-op-table-head`) uses `var(--ag-brand-50, #EEF5FF)` as its
background instead of the old `C.surface` (off-white). This creates a deliberate
visual distinction between the column label zone and the data rows — the header
now reads as "the column scaffold" rather than a continuation of the page surface.
This reduces cognitive load when scanning large tables.

### Why the left bar pattern for rows?

The `::before` pseudoelement creates a 3px left bar that is:
- Transparent by default (invisible)
- Brand blue on `.ag-op-row:hover`
- Permanently visible for severity modifiers (`--warning`, `--critical`)

This matches the SectionHeader left-bar pattern from AGENTIK-UX-OPS-01, unifying
the "identity signal" pattern across the entire operational workspace.

### Why `ag-op-row--warning` for all consignaciones rows?

Consignaciones are, by definition, unreconciled deposits — they represent pending
cash that hasn't been applied to a customer balance. Every row is inherently a
"warning" state (amber). Applying the modifier to all rows is correct semantics.

---

## What Was NOT Changed

- All filter/search logic (useState, useMemo, URL persistence)
- All data types (CollectionRowSerial, DepositRowSerial, ApRowSerial)
- All column definitions and grid template columns
- All amount formatting (fmtCOP prop)
- All date formatting
- All text content and labels
- All page-level data fetching (page.tsx server components)
- Sort behavior (none exists — not touched)
- Pagination behavior (none exists — not touched)

---

## TypeScript Validation

```
npx tsc --noEmit 2>&1 | grep -E "table-client|torre-control"
→ (no output) — zero new errors
```

Additionally: `E` token import removed from all three files (was only used for
`E.sm` on the table container — now handled by `.ag-op-table` CSS class).

---

## Foundation Compliance Audit

| Pattern | Result |
|---------|--------|
| New raw `#` hex outside tokens in `.tsx` files | None introduced |
| New inline `box-shadow` raw values | None — removed (moved to CSS class) |
| New `border-radius` raw values in `.tsx` | None — `R.*` tokens used for remaining inline radii |
| New `background` raw values in header | None — moved to CSS class |
| Pre-existing `outline: "none"` | Removed from 3 search inputs — now handled by `.ag-op-search:focus` |
| Pre-existing `E.sm` boxShadow inline | Removed from 3 containers — now handled by `.ag-op-table` |
| Pre-existing 6-property inline badge style | Removed from consignaciones — now `.ag-op-status--pending` |

---

## Known Risks / Remaining Debt

| Area | Note |
|------|------|
| `cobros-identificados` table | Not in this sprint — uses same pattern, can be upgraded in TABLES-02 |
| Pipeline / Reconciliation tables | Not inspected — likely use different patterns (TanStack or Tailwind) |
| Customer 360 table | Uses mixed pattern — needs separate audit |
| Empty state containers | Still use `R.xl` + `C.line` inline — low priority, functional |
| Filter chip hover states | Still inline `transition` strings — low priority, chips are small |

---

## Recommendation for Next Sprint

**AGENTIK-UX-TABLES-02** — Extend to commercial + customer tables:
- Apply `ag-op-table` system to pipeline client, reconciliation client
- Add row-level severity routing: overdue customers → `ag-op-row--critical`
- Upgrade Customer 360 table with scan-speed row system
- Add `.ag-op-status--ok` to paid/reconciled row status indicators
