# UX-SYSTEM-03 — Stateful Operational Workspaces
## STATUS: COMPLETE
## DATE: 2026-05-08

---

## Objective

Make Torre de Control financial workspaces behave like persistent enterprise tools — not ephemeral pages that reset on every navigation. Search queries, filter selections, scroll positions, and navigation origin context all survive the journey.

---

## State Dimensions Implemented

| Dimension | Mechanism | Scope |
|-----------|-----------|-------|
| Search query | URL `?q=` + `window.history.replaceState` | cobros-hoy, consignaciones, cuentas-por-pagar |
| Filter selection | URL `?f=` + `window.history.replaceState` | cobros-hoy (fuente chips), consignaciones (B1/B2/H1/H2/CP), cuentas-por-pagar (C1/G1/C2) |
| Scroll position | `sessionStorage['ws-scroll:/path']` | All 4 Torre de Control pages |
| Navigation origin | URL `?returnTo=/from-path` → contextual back link | All 4 Torre de Control pages |

---

## Architecture

### No global store. No Redux. No re-renders.

The pattern:

```
Server Component (page.tsx)
  ↓ fetches all records (≤100) from DB
  ↓ reads initial state from searchParams (q, f, returnTo)
  ↓ serializes Date → ISO string
  ↓ passes serialized records + initial state to:

Client Component (table-client.tsx)
  ↓ React.useState for search + filter (instant, no re-render loop)
  ↓ useMemo for client-side filtering
  ↓ useEffect → window.history.replaceState (URL sync, no server hit)

WorkspaceScrollRestore (invisible client component)
  ↓ on mount: sessionStorage.getItem → window.scrollTo (via rAF)
  ↓ on unmount: sessionStorage.setItem(scrollY)
```

### URL sync pattern

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (search) params.set("q", search); else params.delete("q");
  if (filter) params.set("f", filter); else params.delete("f");
  window.history.replaceState(null, "", params.toString() ? `?${params}` : pathname);
}, [search, filter]);
```

`replaceState` (not `pushState`) — no back-button pollution, URL stays bookmarkable.

### returnTo chain

When navigating between Torre de Control workspaces via WorkspaceActions secondary links, the current page appends `?returnTo=/current/path`. The destination reads `returnTo`, resolves a label via `getReturnLabel()`, and passes both to `OperationalWorkspaceHeader` which renders a `← Label` link above the breadcrumbs.

Example flow:
```
cobros-identificados
  → clicks "Ver consignaciones"
  → href: /consignaciones?returnTo=/cobros-identificados

consignaciones renders:
  ← Cobros identificados   ← appears above breadcrumbs
  Finanzas › Torre de Control › Consignaciones pendientes
```

---

## Files Created

### New infrastructure

| File | Purpose |
|------|---------|
| `lib/workspace/workspace-params.ts` | Server-side URL param helpers: `getInitialSearch`, `getInitialFilter`, `getReturnTo`, `getReturnLabel` |
| `components/workspace/workspace-scroll-restore.tsx` | Invisible client component — sessionStorage scroll save/restore via rAF |

### New table clients

| File | Search fields | Filter chips |
|------|--------------|-------------|
| `.../cobros-hoy/table-client.tsx` | customerName, documentNumber, comprobanteCode | Dynamic from data |
| `.../consignaciones/table-client.tsx` | customerName, comprobante, comprobanteCode | B1 B2 H1 H2 CP |
| `.../cuentas-por-pagar/table-client.tsx` | customerName, comprobante, comprobanteCode | C1 G1 C2 |

---

## Files Modified

### `components/workspace/operational-workspace-header.tsx`
Added two optional props:
```typescript
contextualBackHref?:  string;   // URL to navigate back to
contextualBackLabel?: string;   // human label ("Cobros identificados")
```
When both are present, renders `← Label` link above the breadcrumb trail.

### Page files updated

| Page | Changes |
|------|---------|
| `cobros-hoy/page.tsx` | + `searchParams` param, + `WorkspaceScrollRestore`, + `CobrosHoyTableClient`, + serialized records, + returnTo props, + returnTo on secondary action link |
| `consignaciones/page.tsx` | Same pattern |
| `cuentas-por-pagar/page.tsx` | Same pattern |
| `cobros-identificados/page.tsx` | + `searchParams`, + `WorkspaceScrollRestore`, + returnTo props, + returnTo on secondary action link |

---

## UX Behavior

### Search
- Instant in-memory filtering — no network request
- URL updates silently (replaceState) — page is bookmarkable with search state
- "Limpiar ×" button resets all filters
- Empty-state message within table when no results match

### Filter chips
- Colored to match domain accent (amber for consignaciones deposits, blue for CxP docs)
- Only chips for source codes present in data are rendered
- Toggle: click active chip to deselect

### Scroll restore
- Works transparently — user navigates away, returns, page scrolls to where they left off
- Keyed by exact pathname so different pages don't interfere
- Ignored on first visit (no saved state)

### Contextual back link
- Only appears when `?returnTo=` param is present
- Renders above breadcrumbs as `← Label`
- Does not replace breadcrumbs — breadcrumbs remain the structural hierarchy signal

---

## What Was NOT Changed

- All data fetches — untouched
- SAG connector, reconciliation logic — untouched
- Table column structure and visual design — identical to pre-sprint
- cobros-identificados group card layout — untouched (no search table needed)
- Prisma schema — untouched

---

## TypeScript Status

Zero errors introduced. Verified:
```
npx tsc --noEmit | grep "workspace-params|workspace-scroll|table-client|cobros-hoy|cobros-identificados|consignaciones|cuentas-por-pagar"
→ (no output — clean)
```

---

## Design Decisions

### Why client-side filtering, not server re-renders?
Financial operational tables have ≤100 rows. Client-side filtering is instant (no latency), avoids unnecessary DB queries, and keeps the URL update silent. The full dataset is always passed to the client — no pagination complexity needed at this scale.

### Why replaceState not pushState?
Using `pushState` would pollute the browser history — typing in a search box shouldn't create 20 history entries. `replaceState` keeps the URL current without affecting Back button behavior.

### Why sessionStorage not localStorage?
Scroll position is session-scoped context. If the user opens a new browser session, they should start fresh. localStorage would be appropriate for preferences (e.g. default filter selection) — not implemented in this sprint.

### Why returnTo via URL param, not React Context?
Server components can't read React Context. The URL param pattern works across both server and client rendering boundaries, survives page refresh, and requires zero global state setup.

---

## Remaining UX Debt

| Item | Priority | Notes |
|------|----------|-------|
| Debounce search input | Low | Currently filters on every keystroke. With ≤100 rows this is imperceptible but debouncing would reduce replaceState call frequency |
| Persist last-used filter (localStorage) | Low | Would seed the filter on first visit, not just returnTo visits |
| Search highlight in table rows | Low | Highlight matched substring in customer name column |
| Date range filter | Medium | For cobros-hoy: filter by date range within the operational day dataset |
| Keyboard shortcut to focus search | Backlog | `/` or `⌘F` to focus the search input |
