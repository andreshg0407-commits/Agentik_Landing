# TIENDAS-WAREHOUSE-GUIDE-01 — Sprint Report

**Module:** Comercial > Tiendas
**Sprint:** TIENDAS-WAREHOUSE-GUIDE-01
**Status:** COMPLETE
**Validation:** 30/30 PASS
**TSC:** 161 (0 new errors — all pre-existing)

---

## Objective

Convert store replenishment suggestions into operational warehouse guide documents with full lifecycle management: draft -> approved -> executed (or draft -> cancelled). Grouped by store, with priority scoring, executive summary, persistence, API, UI with detail drawer, approval/execution flow, and print-ready PDF rendering.

---

## Boundaries

- NO move inventory
- NO create SAG transfers
- NO reserve units
- NO engine changes to suggestions or replacement intelligence

---

## Files Created

| File | Purpose |
|---|---|
| `lib/comercial/tiendas/store-guide-types.ts` | Domain types: GuideStatus, GuidePriority, StoreWarehouseGuide, StoreWarehouseGuideLine, GuideCard, GuideAuditEntry, GuideSummary, GUIDE_TRANSITIONS |
| `lib/comercial/tiendas/store-guide-generator.ts` | Pure engine: buildWarehouseGuides(), buildWarehouseGuide(), priority calculation, summary generation, line mapping |
| `lib/comercial/tiendas/store-guide-service.ts` | Server-only service: generate, load, approve, cancel, execute. Persists via AgentExecution metadataJson |
| `lib/comercial/tiendas/store-guide-pdf-renderer.tsx` | Print-ready HTML renderer for warehouse guides (window.print / future puppeteer) |
| `app/api/orgs/[orgSlug]/comercial/tiendas/guides/route.ts` | API route: POST actions (load, generate, get, approve, cancel, execute) |
| `scripts/validate-store-guides.ts` | 30-check validation script |

## Files Modified

| File | Change |
|---|---|
| `app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx` | Added "guias" workspace view, GuidesView component, GuideDetailDrawer component, approval/cancel/execute actions |

---

## Architecture

### State Machine

```
draft --> approved --> executed
  \--> cancelled
```

Terminal states: executed, cancelled (no further transitions allowed).

### Priority Scoring

| Factor | Weight |
|---|---|
| Out-of-stock lines | +15 per line |
| Low-stock lines | +5 per line |
| Replacement-needed lines | +3 per line |
| Average suggestion score | +0.5x |

Priority bands: critica (>=100), alta (>=50), media (>=20), baja (<20).

### Persistence

Uses AgentExecution model with:
- `module = "comercial"`
- `operation = "COMERCIAL_STORE_WAREHOUSE_GUIDE"`
- Full guide data stored in `metadataJson`

### Guide Numbering

Sequential: TG-00001, TG-00002, etc. Based on existing guide count per organization.

---

## Validation Results

```
=== TIENDAS-WAREHOUSE-GUIDE-01 VALIDATION ===

--- 1. Grouping by store ---
  PASS  2 guides generated (2 stores)
  PASS  Tienda A guide has 2 lines (no_action excluded)
  PASS  Tienda B guide has 1 line

--- 2. Line generation ---
  PASS  Lines have referenceCode
  PASS  Lines have requestedQty > 0
  PASS  Lines have reason text

--- 3. Priority calculated ---
  PASS  Guide has priority — got alta
  PASS  Guide has priorityScore > 0 — got 95

--- 4. Summary generated ---
  PASS  Summary has executiveSummary
  PASS  Summary mentions unidades
  PASS  Summary totalUnits matches

--- 5. Valid initial state ---
  PASS  Initial status = draft
  PASS  Has audit entry
  PASS  Audit entry = created

--- 6. State transition rules ---
  PASS  draft -> approved allowed
  PASS  draft -> cancelled allowed
  PASS  approved -> executed allowed
  PASS  executed -> nothing
  PASS  cancelled -> nothing
  PASS  cancelled -> approved NOT allowed
  PASS  executed -> draft NOT allowed

--- 7. PDF renders ---
  PASS  HTML generated
  PASS  HTML contains guide number
  PASS  HTML contains store name
  PASS  HTML contains tenant name

--- 8. Multi-tenant ---
  PASS  organizationId set
  PASS  Different org produces different orgId

--- 9. Guide numbering ---
  PASS  First guide numbered TG-00001
  PASS  Second guide numbered TG-00002

--- 10. Replacement lines ---
  PASS  Replacement line has replacementReferenceCode

RESULT: 30 PASS / 0 FAIL (total 30)
```

---

## UI Components

### GuidesView
- Action bar with "Generar Guias" button
- Status and store filters
- Table: guideNumber, storeName, totalLines, totalUnits, priority, status, generatedAt
- Click row to open detail drawer

### GuideDetailDrawer
- Header with guide number, store, date, priority badge, status badge
- Executive summary panel
- Action buttons contextual to status:
  - draft: Aprobar / Cancelar
  - approved: Marcar Ejecutada
  - executed/cancelled: no actions (terminal)
- Lines table: #, ref, product, size, color, requested, approved, available, replacement, reason
- Audit trail with timestamps and user actions

---

## Dependencies

- `store-suggestions-engine.ts` (suggestions as input)
- `store-suggestions-service.ts` (loads suggestions for guide generation)
- `store-suggestions-types.ts` (StoreReplenishmentSuggestion)
- AgentExecution Prisma model (persistence)

---

## What This Sprint Does NOT Do

- Does not move physical inventory
- Does not create SAG transfer documents
- Does not reserve warehouse units
- Does not modify suggestion engine logic
- Does not integrate with external WMS systems
