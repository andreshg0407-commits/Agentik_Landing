# UX-03 — Workspace Hierarchy + Operational Navigation Refactor
## STATUS: COMPLETE
## DATE: 2026-05-08

---

## Problem Statement

TC-04 (previous sprint) fixed the data trust layer by adding inline detail sections.
It solved the "blind shortcut" problem but introduced a new UX failure:

- Torre de Control became infinitely scrollable
- Inline tables appeared inside a KPI dashboard
- Executive scanning became impossible
- The sidebar mixed unrelated pages inside the same domain column

**Root cause: navigation hierarchy, not data quality.**

---

## Changes Delivered

### 1. Left Sidebar — New Domain Structure

`components/shell/module-nav-config.ts` rebuilt with 6 + 1 domains:

| Domain | Icon | Accent | Purpose |
|--------|------|--------|---------|
| **Gestión** | G | `#1e1e2e` | Executive layer: Gerencia, Informes, Alertas Estratégicas |
| **Finanzas** | Fn | `#1e40af` | Torre de Control, Tesorería, Conciliación + future items |
| **Cobranza** | C | `#7c3aed` | Cartera, Cola, Campañas, Rendimiento, Clientes Críticos |
| **Comercial** | Cm | `#0369a1` | Cliente 360 (primary entry), Embudo, Vendedores, Canales |
| **Marketing** | Mk | `#7c2d92` | Hub, Foto Estudio, Biblioteca, Redes, Shopify |
| **Operaciones** | Op | `#059669` | Documentos, Conocimiento, Flujos (future), Tareas (future) |
| **Consola** | ∷ | `#4f46e5` | Agentik, Ejecuciones, Integraciones, SAG, Configuración |

**Key reorganizations:**
- Torre de Control moved from Gestión → **Finanzas** (correct domain ownership)
- Informes Ejecutivos moved from Comercial → **Gestión** (executive layer)
- Alertas Estratégicas added to **Gestión** nav
- Comercial now leads with **Cliente 360** as primary entry (not "Control Comercial")
- Operaciones simplified — Alertas removed (lives in Gestión), future items marked disabled

---

### 2. Torre de Control — Card Navigation Refactored

All KPI cards that previously scrolled to inline sections now **navigate to dedicated pages**.

| Card | Old behavior | New behavior |
|------|-------------|--------------|
| Cobros recibidos hoy | `#detail-cobros-hoy` anchor scroll | `/finanzas/torre-control/cobros-hoy` |
| Cobros identificados | `#detail-cobros-identificados` anchor scroll | `/finanzas/torre-control/cobros-identificados` |
| Consignaciones pendientes | `#detail-consignaciones` anchor scroll | `/finanzas/torre-control/consignaciones` |
| Cuentas por pagar | `#detail-cxp` anchor scroll | `/finanzas/torre-control/cuentas-por-pagar` |
| Tesorería inmediata | `#detail-cxp` anchor scroll | `/finanzas/torre-control/cuentas-por-pagar` |

---

### 3. Torre de Control — Inline Sections Removed

Removed from `executive/page.tsx`:
- `CobrosHoyDetailSection` (was 35 lines of inline JSX + table)
- `CobrosIdentificadosDetailSection` (was 35 lines)
- `ConsignacionesDetailSection` (was 35 lines + status badges)
- `CxpDetailSection` (was 80 lines + urgency block)
- `DetailPanelHeader`, `DetailTable`, `ActionFooter` (shared primitives, ~70 lines)
- Detail data fetches moved out: `getTodayCollectionDetail`, `getPendingDepositDetail`, `getApDocumentDetail` no longer fetched on the executive page
- Only `getOldestApRecord` remains (still needed for Tesorería inmediata card headline)

**Line reduction:** ~280 lines removed from executive/page.tsx

---

### 4. New Operational Detail Workspaces

| Route | File | Data Source | Purpose |
|-------|------|-------------|---------|
| `/finanzas/torre-control/cobros-hoy` | `cobros-hoy/page.tsx` | `getTodayCollectionDetail()` | CollectionRecord table for latest SAG op day |
| `/finanzas/torre-control/cobros-identificados` | `cobros-identificados/page.tsx` | `getCobrosBreakdown()` | R1/R2/Almacenes/Retail breakdown cards |
| `/finanzas/torre-control/consignaciones` | `consignaciones/page.tsx` | `getPendingDepositDetail()` | Pending deposit records table |
| `/finanzas/torre-control/cuentas-por-pagar` | `cuentas-por-pagar/page.tsx` | `getApDocumentDetail()` + `getOldestApRecord()` | AP document list + urgency signal |

All 4 pages:
- Self-contained server components
- Back navigation: `← Torre de Control`
- Summary bar (KPI recap)
- Full record table (up to 100 rows)
- Action footer with primary CTA + return link
- Data gap warnings where applicable (AP $0 notice)

---

### 5. Route Module Guard

`lib/tenant/modules.ts` updated:
```typescript
["finanzas/torre-control", "torre_control"],
// Maps all /finanzas/torre-control/* routes to the torre_control module gate
```

---

## Executive UX Principle Applied

```
Torre de Control:
  Level 1 — Executive Scan:  KPIs, signals, trends, urgency signals
  Level 2 — Preview:         Top-3/5 in signal cards (no inline tables)
  Level 3 — Deep Work:       /finanzas/torre-control/[workspace]

Card navigation rule:
  Card click → dedicated operational workspace
  NOT → anchor scroll to inline table on same page
```

---

## What Was NOT Changed

- Financial source registry (lib/financial/source-registry.ts)
- Trust semantics (cobros-breakdown.ts, cobros-kpis.ts)
- AP $0 data gap documentation (it's preserved in the CxP detail page header notice)
- carteraKpis, cobrosSegments, aging bucket logic in executive/page.tsx
- Any Prisma schema or query logic

---

## Remaining UX Debt

| Item | Priority |
|------|----------|
| Torre de Control signal strip needs density reduction (too many KPI rows) | Medium |
| `/finanzas/torre-control/cobros-hoy` needs date picker to navigate to other op days | Low |
| `Operaciones` domain missing `Alertas` link (moved to Gestión — users may expect it here too) | Low |
| GESTIÓN `Decisiones IA` + `Tareas Gerenciales` items are disabled (no page yet) | Backlog |
| FINANZAS future items (Flujo de Caja, Presupuestos, Bancos, Forecast) are disabled | Backlog |

---

## TypeScript Status

Zero errors introduced. Verified:
```
npx tsc --noEmit | grep "executive/page\|finanzas/torre\|module-nav\|layout.tsx"
→ (no output — clean)
```
