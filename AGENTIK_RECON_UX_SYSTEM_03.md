# AGENTIK-RECON-UX-SYSTEM-03
## Reconciliation Intelligence & Operational Density Refinement

**Sprint:** AGENTIK-RECON-UX-SYSTEM-03
**File scope:** `app/(app)/[orgSlug]/reconciliation/recon-client.tsx` primarily
**Backend constraint:** NO Prisma, NO engine, NO SAG/DIAN, NO API changes

---

## Operational UX rationale

After UX-SYSTEM-01 and -02, the reconciliation module had solid structural bones.
This sprint addressed three remaining gaps:

1. **Visual density was too low.** Washed-out, overly spaced sections felt like a report viewer, not an operational workspace. Fixed by tightening section margins (S[8]→S[6]), stronger borders on active sources, and increased card proportions.

2. **The manual reconciliation section felt like a disabled form.** A disabled upload form signals "not ready, move on." The module needed to communicate what intelligence was being orchestrated even before the motor activates.

3. **Empty states were occupying valuable workspace real estate.** An empty `RecentSessionsSection` occupies a full `WorkspaceSection` with title, padding, and an empty message. Collapsed to `return null` — the page stays dense and alive.

---

## IA workspace philosophy

The `ManualReconciliationWorkspace` is now named "Laboratorio de conciliación manual."

This framing matters: a *laboratory* implies an environment prepared for intelligent work, not a blank form.

The section now communicates:
- **Capabilities** (parsing, normalization, AI matching, rule suggestion, duplicate detection) — displayed as badges before any upload happens
- **Orchestration stages** (Carga & Parseo → Normalización → Matching IA) — three numbered stages show what the motor will do, in order
- **Intelligence micro-panels** (columnas detectadas, campos de cruce, coincidencias preliminares, estructura reconocida) — four placeholder panels show what intelligence output will look like
- **Engine status** — replaced "Preparando motor..." passive message with a MOTOR: STANDBY badge in the capability bar

The pipeline connector (Fuente A — [IA circle] — Fuente B) makes the comparison intent visually explicit at a glance.

---

## Why reconciliation moved from "table UI" → "intelligence workspace"

The original module was built as a functional admin tool:
- Table of reconciliation records
- Export CSV button
- Dropdown form to run a new check

This is correct for a data operator who runs a reconciliation once a week.
Agentik's model is different: the operator comes to the workspace to understand what's happening across multiple financial streams, choose the right investigation path, and trust Agentik to surface insights.

That requires:
- **Intelligence signals upfront** (what attention items exist, what flows are live)
- **Source visibility** (which connectors are healthy, which need attention)
- **Action readiness** (flows are pipeline cards, not table rows)
- **Intelligence perception** (even when engine is standby, the lab communicates capability)

The result is a module that communicates: "this is a live financial intelligence workspace, not a spreadsheet viewer."

---

## Tasks delivered

| # | Task | Change |
|---|------|--------|
| 1 | Operational hierarchy | Section margins tightened (S[8]→S[6]); FlowRow padding increased for breathing room |
| 2 | SourceCard proportions | Width 200→260; gap S[1]+1→S[2]; title size T.sz.md→T.sz.lg; signal allows 2-line wrap; visual divider before CTA |
| 3 | Carousel interaction quality | `scrollSnapType: "x mandatory"` + `scrollBehavior: "smooth"`; gradient fade hint on right when >3 cards; `scrollSnapAlign: "start"` on each card |
| 4 | Manual workspace → IA lab | Renamed to "Laboratorio de conciliación manual"; pipeline layout (A — engine — B); capability badges; orchestration stages |
| 5 | Intelligence micro-panels | 4 panels: columnas detectadas, campos de cruce, coincidencias prelim., estructura reconocida — static/standby |
| 6 | Engine status rework | Passive "Preparando motor..." replaced with MOTOR: STANDBY badge + 3-stage orchestration breakdown |
| 7 | Hide empty sessions | `RecentSessionsSection` returns null when `sessions.length === 0` — page stays compact |
| 8 | Remove duplicate Copilot slot | `CopilotReadinessSlot` removed from landing — Copilot context lives inside `ManualReconciliationWorkspace` |
| 9 | Flow workspace rhythm | FlowRow padding increased; `transition: "background 0.12s"` on hover; `cursor: "pointer"` on live rows |
| 10 | Micro-interaction polish | SourceCard: `transition: "box-shadow 0.15s, border-color 0.15s"`; FlowRow: background transition; cursor affordances throughout |
| 11 | Architecture preserved | Zero backend/engine/Prisma/SAG changes |
| 12 | Documentation | This file |

---

## What remains static / placeholder

| Element | Status | Activation requires |
|---------|--------|---------------------|
| Orchestration stage progress | STANDBY static | Manual engine backend |
| Micro-panel values | "—" static | File parse result from engine |
| Capability badges | Display only | Engine activation |
| SourceCard action onClick | `console.log` placeholder | Per-source API endpoints |
| File inputs in upload zones | `disabled` | Manual engine + file ingestion endpoint |

---

## TypeScript compliance

- Zero new errors introduced.
- Project total: 160 errors (unchanged from baseline).
- `WebkitLineClamp` and `WebkitBoxOrient` are valid CSSProperties in React's inline style system.
- `scrollSnapType` and `scrollSnapAlign` are valid CSS scroll snap properties.
