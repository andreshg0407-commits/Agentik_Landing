# AGENTIK-FINANCE-ARCHITECTURE-01
## Financial System Hierarchy Refactor

**Sprint:** AGENTIK-FINANCE-ARCHITECTURE-01
**Scope:** Navigation + scaffold pages only — NO backend, NO Prisma, NO SAG/DIAN changes

---

## Rationale

Prior to this sprint, the Finanzas sidebar had:
- Torre de Control (executive intelligence layer)
- "Tesorería" → `/finance` (legacy route, no submodule identity)
- "Conciliación Inteligente" → `/reconciliation`
- 4 disabled "Próximamente" stubs (Flujo de Caja, Presupuestos, Bancos y Créditos, Forecast)

Problems:
1. Tesorería Operativa had no dedicated route — it aliased `/finance` with no workspace identity.
2. Centro Documental, Cierre Financiero, and Planeación Financiera had no presence in the OS at all.
3. The "Próximamente" section names (Flujo de Caja, Presupuestos) described *outputs* rather than *workspaces*.
4. No strategic separation between operational finance (Operaciones) and strategic finance (Estrategia).

---

## New sidebar hierarchy

```
FINANZAS
├─ Torre de Control          → /executive          (badge: ↗)
├─ OPERACIONES               (section header)
│  ├─ Tesorería Operativa    → /finanzas/tesoreria
│  ├─ Conciliación Inteligente → /reconciliation
│  ├─ Centro Documental      → /finanzas/documentos
│  └─ Cierre Financiero      → /finanzas/cierre
└─ ESTRATEGIA                (section header)
   └─ Planeación Financiera  → /finanzas/planeacion
```

Torre de Control remains the executive intelligence / KPI pulse layer.
Operaciones = daily financial operations requiring active decisions.
Estrategia = forward-looking planning and budgeting.

---

## Files changed

### `components/shell/module-nav-config.ts`
- Replaced "Tesorería" → "Tesorería Operativa" with new route `/finanzas/tesoreria`
- Added Centro Documental, Cierre Financiero under Operaciones section
- Replaced "Próximamente" section (4 disabled items) with "Estrategia" section
- Planeación Financiera replaces the stub cluster — single active workspace
- Updated `pathKeys` to include all 4 new `/finanzas/*` routes

### `lib/tenant/modules.ts`
- Added 5 new ROUTE_MODULE_MAP entries:
  ```typescript
  ["finanzas/tesoreria",  "finance"]
  ["finanzas/documentos", "finance"]
  ["finanzas/cierre",     "finance"]
  ["finanzas/planeacion", "finance"]
  ["finanzas/facturas",   "finance"]   // retroactive — was ungated
  ```
- All gated to the existing "finance" ModuleKey — no new module keys needed.

### New scaffold pages (SCAFFOLD — no data fetching)

| Page | Route | Status |
|------|-------|--------|
| `finanzas/tesoreria/page.tsx` | `/[orgSlug]/finanzas/tesoreria` | Scaffold · Próximamente |
| `finanzas/documentos/page.tsx` | `/[orgSlug]/finanzas/documentos` | Scaffold · Próximamente |
| `finanzas/cierre/page.tsx` | `/[orgSlug]/finanzas/cierre` | Scaffold · Próximamente |
| `finanzas/planeacion/page.tsx` | `/[orgSlug]/finanzas/planeacion` | Scaffold · Próximamente |

Each scaffold:
- Uses `requireOrgAccess` for auth
- Renders `OperationalWorkspaceHeader` with breadcrumb back to Torre de Control
- Displays module tiles (name + purpose description) at 65% opacity — communicates intent
- Shows an activation requirement note (what backend work is needed)
- Uses tokens: `C.*`, `T.*`, `S.*`, `R.*` — no raw hex, no raw font strings
- Status: `"neutral"` with label "Próximamente"

---

## What was NOT changed

- `/finance` route — still exists (legacy Tesorería operational pages)
- `/reconciliation` — untouched (already advanced — Conciliación Inteligente)
- `/executive` — untouched (Torre de Control)
- `finanzas/torre-control/*` drilldown workspaces — untouched
- All `lib/finance/*`, `lib/reconciliation/*` — zero changes
- Prisma schema — zero changes
- SAG adapters — zero changes
- `ModuleKey` registry — no new keys added

---

## Module activation requirements (future sprints)

| Workspace | Backend required |
|-----------|-----------------|
| Tesorería Operativa | Bank integration · cash position model · daily flow API |
| Centro Documental | Document indexing engine · DIAN integration · file ingestion |
| Cierre Financiero | Accounting period model · adjusting entries API · trial balance |
| Planeación Financiera | Budget model · AI forecast engine · plan vs. actuals |

---

## TypeScript compliance

- Zero new errors introduced.
- Project total: 160 errors (unchanged from baseline).
