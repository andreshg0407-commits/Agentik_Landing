# AGENTIK-RECON-UX-SYSTEM-02
## Reconciliation Source Carousel + Manual File Workspace

**Sprint:** AGENTIK-RECON-UX-SYSTEM-02
**File scope:** `app/(app)/[orgSlug]/reconciliation/recon-client.tsx` only
**Backend constraint:** NO Prisma, NO engine, NO SAG/DIAN, NO API changes

---

## Why we replaced the dominant table with a carousel

The previous `DataSourcesLayer` used large chip-cards plus a table that occupied most of the landing view.
This created two problems:

1. The most important action (choosing a reconciliation flow) was buried below an information wall.
2. Sources like PayCo, MercadoPago, and Bancolombia accounts had no individual identity — they were listed inside a single "4 plataformas" chip.

The carousel model solves both:
- Each source gets its own card with status, type, signal, and action.
- The filter bar (Todas / Bancos / Tarjetas / Plataformas / Fiscal / ERP) lets the operator scan any group instantly.
- The technical matrix still exists, but collapsed behind "Ver matriz técnica" — used for configuration, not daily ops.

---

## How connected vs pending sources are handled

| Status | Card appearance | Action button |
|--------|-----------------|---------------|
| `connected` | Green border, green dot | "Revisar" → `href` link |
| `requires_action` | Amber border, amber dot | "Subir extracto" or "Validar" → `onClick` (console log placeholder) |
| `partial` | Blue border, blue dot | "Ver actividad" → `onClick` placeholder |
| `pending` | Gray border, gray dot | Disabled button — "Preparar integración" or "Configurar" |

Pending sources show a **disabled** button instead of a no-op click — this is intentional.
It signals that action is blocked until a backend endpoint exists, without creating false interactivity.

---

## Decision: Manual File Reconciliation Workspace is a first-class section

The manual upload workspace (`ManualReconciliationWorkspace`) is rendered as a full `WorkspaceSection` in the landing view, not hidden inside the Copilot slot.

Rationale: operators often need to reconcile ad-hoc files (bank extracts, DIAN XML exports) outside the automated flow pipeline. If this capability is only visible via "Copilot próximamente", it will never be discovered.

The Copilot note is preserved at the bottom of the `ManualReconciliationWorkspace` as a secondary hint, not as the primary entry point.

---

## What is placeholder / not yet functional

| Component | Status | What's missing |
|-----------|--------|----------------|
| `SourceCard` action buttons (non-review) | Placeholder | API endpoints per source: `PATCH /orgs/[org]/connectors/[id]/activate` |
| `FileUploadZone` file input | Disabled | Manual reconciliation engine (backend) |
| `ManualReconciliationWorkspace` "Preparar conciliación" CTA | Disabled | File parsing + engine activation |
| `SourceCard` "Conectar" for bank/platform sources | `onClick` console.log | Integration wizard per source type |

---

## Backend required to activate manual reconciliation

1. **File ingestion endpoint:** `POST /api/orgs/[orgSlug]/reconciliation/manual/upload`
   - Accepts: multipart/form-data with `fileA` + `fileB` + `formatA` + `formatB`
   - Returns: `{ uploadId, previewA, previewB }` or error

2. **Engine activation check:** `GET /api/orgs/[orgSlug]/reconciliation/manual/engine-status`
   - Returns: `{ active: boolean, eta?: string }`
   - Used to enable/disable the "Preparar conciliación" CTA

3. **Source connection actions:** `PATCH /api/orgs/[orgSlug]/connectors/[connectorId]/activate`
   - Used by "Conectar", "Configurar", "Subir extracto" buttons

---

## Flow card visual improvements (Task 8)

`FlowRow` was redesigned from a generic 5-column table row to a pipeline card:
- Green left border accent on live flows (`borderLeft: 3px solid C.green`)
- "Listo" green badge on active flows — replaces the implicit state read from column position
- Blocker badges on blocked flows are now gray/subtle (not amber) — blocked flows are secondary, not warnings
- CTA uses `ag-action-primary` class — consistent with rest of the OS shell
- Column headers removed — 6 rows don't need a table header

---

## Landing view order (post-sprint)

```
1. Observation strip (attentionPlan or StreamsInsightStrip)
2. Flujos de conciliación        ← primary action
3. Fuentes de datos carousel     ← source selection + status
4. Conciliación manual asistida  ← file-based reconciliation
5. Sesiones recientes
6. Agentik Copilot readiness slot
```

---

## Responsive safety

- Source carousel uses `overflowX: auto` — horizontal scroll on narrow viewports, no layout break.
- Source cards have `flex: 0 0 auto` + `width: 200` — fixed-width, won't collapse or stretch.
- Long source names truncate with `textOverflow: ellipsis` + `title` tooltip.
- Upload zones use `flex: 1 1 0` + `minWidth: 200` — stack to two columns on wide, single column on narrow.
- Filter chips use `flexWrap: wrap` — never overflow on small screens.

---

## TypeScript compliance

- Zero new errors introduced in `recon-client.tsx`.
- Total project error count: 160 (unchanged from pre-sprint baseline).
- `signal?: string` (optional) — fixed by using `?? undefined` on `primary?.value` (was `string | null`).
