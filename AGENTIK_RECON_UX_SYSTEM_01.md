# AGENTIK-RECON-UX-SYSTEM-01
## Reconciliation Operational UX Refinement

**Sprint:** AGENTIK-RECON-UX-SYSTEM-01
**File scope:** `app/(app)/[orgSlug]/reconciliation/recon-client.tsx` only
**Backend constraint:** NO Prisma, NO engine, NO SAG/DIAN, NO API changes

---

## Tasks delivered

### Task 1 — Sources layer collapsible groups
`StreamGroupSection` converted from static display to toggleable collapsible.
- Groups with `requiresAction` streams default open; clean groups default closed.
- Collapsed header shows: group label · N fuentes · amber attention badge (if any) · green operative count (if none require action).
- Click anywhere on the `ag-intel-header` row to toggle open/closed (▲/▼ indicator).

### Task 2 — Fix badge overflow
`StreamRow` status badge now enforces `maxWidth: 140` + `textOverflow: ellipsis` + `whiteSpace: nowrap` + `overflow: hidden` + `display: inline-block`.
Full text exposed via native `title` tooltip.
Previously, labels like "CONSIGNACIONES PENDIENTES" would break the row layout.

### Task 3 — Flows become primary workspace
Landing section reordered so `ReconciliationBuilder` (flows) appears **before** `DataSourcesLayer` (sources).
Rationale: the operator's primary intent is to start a reconciliation. Sources are a detail/diagnostic layer, not the first thing they should see.

New landing order:
1. Observation strip (attention signal)
2. Flujos de conciliación (primary action)
3. Fuentes de datos (detail/diagnostic)
4. Sesiones recientes
5. Copilot readiness

### Task 4 — Hide low-value empty sections
Removed the always-visible "Mesa de trabajo — resultados" empty state from the landing view.
It added visual noise with no operational value — the operator knows results appear after running a flow.

### Task 5 — Agentik observation strip from stream data
Added `StreamsInsightStrip` component: renders when `attentionPlan` is absent but `streams` are present.
Derives a brief operational insight from stream state:
- `warn` escalation: blocked or mapping-missing streams exist
- `watch` escalation: streams with reconciliation pending
- `ok` escalation: all operative
Always shows "Agentik observa" label for brand consistency.

### Task 6 — Visual hierarchy cleanup
Removed alternating row backgrounds from `ResultsWorkbench` detail table (`i % 2 === 0 ? C.white : C.surface`).
Clean uniform rows are easier to scan; the `ag-op-row` hover state provides sufficient interactive affordance.

### Task 7 — Right rail consistency
Right rail content is managed by the workspace shell, not `recon-client.tsx`. No changes needed inside this file.

### Task 8 — Sessions compact when empty
`RecentSessionsSection` empty state replaced with a compact single-line text instead of the full `EmptyOperationalState` component.
Sessions are a secondary context element; the verbose empty state over-emphasized an absent list.

### Task 9 — Responsive + overflow safety
- Root wrapper: added `minWidth: 0` + `overflowX: hidden` to prevent horizontal bleed.
- Sessions table: wrapped with `overflowX: auto` container to handle narrow viewports without breaking the fixed `gridTemplateColumns` layout.
- StreamRow status badge: `maxWidth: 140` prevents the badge column from expanding (see Task 2).

### Task 10 — Documentation
This file.

---

## Design system compliance

All changes follow AGENTIK-UX-SYSTEM-LOCK-01:
- Tokens: `C.*`, `T.*`, `S.*`, `R.*` only — no raw hex, no inline `font-family: monospace`
- CSS classes: `ag-op-table`, `ag-op-row`, `ag-op-status--*`, `ag-intel-header`
- No new Tailwind color classes introduced
- TypeScript: zero new errors introduced

---

## What was NOT changed

- `lib/reconciliation/` — no engine, no persistence, no session logic
- `prisma/schema.prisma` — no model changes
- SAG adapters — untouched
- Any API routes — untouched
- `exception-workbench.tsx` — untouched (separate sprint: AGENTIK-RECON-EXCEPTIONS-02)
