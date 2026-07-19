# EXECUTIVE-OPERATIONAL-DASHBOARD-04

**Sprint:** Centro de Control Ejecutivo
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## What was built

The Executive Control Center — a 10-section operational dashboard that displays the full intelligence pipeline without calculating anything. All data comes from specialized engines (Signals, Events, Rules, Planning, Decision, Action).

## Architecture

```
lib/executive-dashboard/           (8 domain files)
  dashboard-types.ts               ExecutiveDashboardState + 8 card types + BusinessTraceChain
  dashboard-pipeline.ts            assembleDashboardState() — maps engine outputs to dashboard
  dashboard-sections.ts            10 section definitions (order, collapsibility)
  dashboard-widgets.ts             severityColor(), healthColor(), label helpers
  dashboard-timeline.ts            buildDailyHighlights() — importance-sorted business language
  dashboard-insights.ts            buildExecutiveQuestions() — 8 daily executive questions
  dashboard-utils.ts               totalActiveSignals(), hasActionableItems(), etc.
  index.ts                         Client-safe barrel export

app/(app)/[orgSlug]/reports/
  page.tsx                         Server component — assembleDashboardState() from engines
  executive-dashboard-client.tsx   Client component — 10-section Executive Control Center
```

## 10 Dashboard Sections

| # | Section | Content |
|---|---------|---------|
| 1 | Resumen Ejecutivo | Health badge, daily summary, KPI cards |
| 2 | Salud del Negocio | Score circle, risk level, confidence |
| 3 | Signals Activos | Category grid with severity breakdown |
| 4 | Timeline de Eventos | Chronological entries (signal, event, rule, plan, decision, action) |
| 5 | Reglas Aplicadas | Rule cards with evidence and confidence |
| 6 | Planes Recomendados | Plan cards with alternatives, costs, benefits, risks |
| 7 | Decisiones Recomendadas | Decision cards with justification, tradeoffs, "Ver razonamiento" |
| 8 | Acciones Pendientes | Action rows with status, approval, execution mode |
| 9 | Timeline Ejecutivo | Daily highlights sorted by importance |
| 10 | Preguntar a David | 8 executive questions derived from state |

## Key Rules

1. **Dashboard NEVER calculates intelligence** — all data from specialized engines
2. **suggestedOnly** tag on every plan and decision card
3. **Business Trace** — "Ver razonamiento" on every trace chain (Signal → Event → Rule → Plan → Decision → Action)
4. **Collapsible sections** — Timeline Ejecutivo and Ask David collapsed by default
5. **Empty states** — EmptyOperationalState for every empty section
6. **All tokens from lib/ui/tokens.ts** — C.*, T.mono, S[n], R.*, E.*
7. **Operational primitives** — StatusChip, AttentionBadge, WorkspaceSection, ModulePulseHeader

## Fixes Applied

- `dashboard-pipeline.ts`: `s.detectedAt` → `s.createdAt` (BusinessSignal field)
- `dashboard-pipeline.ts`: `s.entity.label` → `s.entityId` (flat, not nested)
- `dashboard-pipeline.ts`: Removed `"notice"` severity check (not in SignalSeverity)
- `executive-dashboard-client.tsx`: `"danger"` → `"critical"` (StatusSignal type)
