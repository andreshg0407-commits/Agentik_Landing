# Agentik — Agent / Canvas Separation Rule

**Sprint:** AGENTIK-FINANCIAL-COPILOT-ARCHITECTURE-NORMALIZATION-01
**Status:** ENFORCED

---

## Core Rule

**Agents do NOT live inside the operational canvas.**

Agents observe, interpret, recommend, and coordinate — but they do NOT replace the operational system.

---

## Where agents live

| Surface | Agent presence |
|---|---|
| Right ops rail (`right-ops-rail.tsx`) | YES — primary surface |
| Executive overlay (future) | YES |
| Command center | YES |
| Contextual action drawers | YES |
| **Operational canvas** | **NO** |

---

## Prohibited inside any canvas component

```
"AGENTIK IA"
"Diego detecta"
"Agentik recomienda"
"Hoy Agentik recomienda"
"Tesorería inteligente"
"Centro de decisiones Agentik"
"Inteligencia Agentik · [module]"
"Requiere decisión hoy"
```

Also prohibited:
- `<DiegoSlot />` inside client page components
- `<CopilotSlot />` inside client page components
- `ag-copilot-zone` CSS class in canvas
- `ag-ai-strip` CSS class in canvas
- Dark AI gradient panels (`var(--ag-grad-ai)`)
- Hardcoded AI narrative blocks (COPILOT_INSIGHTS)
- Embedded executive summaries
- Footer AI synthesis blocks

---

## What belongs in the canvas

- KPIs and metrics
- Tables and reconciliation grids
- Status strips (badges only — REAL / PARCIAL / PENDIENTE / REQUIERE SYNC)
- Cash / treasury position
- Operational flow
- Document integrity
- Financial health
- Booking / close score

---

## What belongs in the right rail (Diego)

- Interpretation and narrative
- Temporal evolution and trends
- Recommendations and priorities
- Executive alerts
- Recurring patterns
- Anomaly detection
- Decision context
- Confidence / source state

---

## Module status (post AGENTIK-FINANCIAL-COPILOT-ARCHITECTURE-NORMALIZATION-01)

| Module | Canvas clean? | Diego in rail? |
|---|---|---|
| `/executive` | YES | YES (via `isFinancialSurface`) |
| `/finanzas/tesoreria` | YES | YES |
| `/finanzas/conciliacion` | YES | YES |
| `/finanzas/cierre` | YES | YES |
| `/finanzas/planeacion` | YES | YES |

---

## Agent resolver — financial modules

All `/finanzas/*` routes → **Diego** (via `agent-resolver.ts` `/finanzas` rule).
`/executive` → **Diego** (explicit rule added in AGENTIK-FINANCIAL-COPILOT-CLEANUP-01).

Pablo MUST NOT appear on any financial surface.

---

## Enforcement

Before adding any new component to a financial canvas:

1. Does it contain an agent name or label? → Move to rail
2. Does it contain AI narrative text? → Move to rail
3. Does it use `ag-copilot-zone`, `ag-ai-strip`, or gradient AI? → Forbidden
4. Does it import `DiegoSlot` or `CopilotSlot`? → Only allowed in rail components

**TSC baseline: 160 errors. Never increase.**
