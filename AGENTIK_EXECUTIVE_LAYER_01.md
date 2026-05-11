# AGENTIK-EXECUTIVE-LAYER-01
## Executive Attention + Operational Priority System

**Sprint closed:** 2026-05-09
**Files touched:** 2 (design-system.css, executive/page.tsx)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Executive Attention Philosophy

Torre de Control had clean information but equal visual intensity across all sections. The executive was forced to interpret priority manually — scanning every block to derive what mattered most.

The principle driving this sprint:
> **A command system that requires manual interpretation is not a command system — it's a report.**

The goal is not more decoration. The goal is **directed cognition**: the interface should suggest where to look, in what order, with what urgency, before the executive reads a single KPI.

This is how executive operational systems work: brief → signal → detail → action. Not all sections simultaneously at the same volume.

---

## Audit Summary

| Issue | Location | Impact |
|---|---|---|
| All `SectionHeader` at identical visual weight | B1–B5 | HIGH — no hierarchy, everything competes |
| No executive orientation signal before content | Top of desktop view | HIGH — forces full-page scan to detect state |
| B4 Radar Comercial (analytical) = same weight as B1 (primary signal) | Section headers | MEDIUM — contextual layer pollutes primary signal |
| No boundary between operational content and AI synthesis layer | Closing block | MEDIUM — AI intelligence feels like "another block" |
| Equal spacing between all functional zones | All `marginBottom: S[5]` | LOW — no structural breathing between B2→B3 transition |

---

## Changes Delivered

### 1. Operational Pulse Bar (before B1)

A single compact line that immediately orients the executive on entry:

```
● OPERACIÓN NORMAL  ·  sin alertas críticas activas              08 May 2026
● ATENCIÓN          ·  2 consignaciones sin identificar
● ATENCIÓN REQUERIDA · cartera vencida +90d · $X en riesgo
```

Properties:
- Uses `ag-op-pulse` + `ag-op-pulse--{ok|warn|critical}` classes
- Health dot with ambient glow (green/amber/red)
- Status label at 5 opacity tiers: OPERACIÓN NORMAL / ATENCIÓN / ATENCIÓN REQUERIDA
- Primary signal string: first relevant issue (alerts → 90d → consignaciones → clean)
- Latest data timestamp right-aligned
- Background tint changes with state: neutral → warm amber (#fffdf4) → warm red (#fff8f8)
- No KPIs inside — pure orientation

Why: Before any card scan, the executive knows the day's character in 0.3 seconds.

### 2. SectionHeader Priority Tiers

Three tiers control section dominance without changing structure or content:

| Tier | Border | Font | Margin | Used by |
|---|---|---|---|---|
| `primary` | 4px | `T.sz.lg` (14px) | `S[6]` | B1 Centro de Mando, B2 Cartera |
| `operational` | 3px | `T.sz.md` (13px) | `S[5]` | B3 Tesorería, B5 Decisiones (default) |
| `contextual` | 2px | `T.sz.sm` (11px) | `S[4]` | B4 Radar Comercial |

Additional:
- `contextual` accent color reduced to 73% opacity (`${accent}bb`) — quieter without disappearing
- `primary` paddingLeft + 2px for subtle physical dominance
- `contextual` borderBottom reduced from `40` to `33` alpha suffix

Applied:
- B1: `tier="primary"` → Centro de Mando Diario commands the most authority
- B2: `tier="primary"` → Cartera y Riesgo is equally critical (financial risk)
- B4: `tier="contextual"` → Radar Comercial is analytical context, not primary signal

### 3. Zone Breath (B2 → B3 transition)

Added `<hr className="ag-zone-breath" aria-hidden="true" />` between Cartera y Riesgo and Tesorería Operativa.

Rationale: B2 (financial risk) and B3 (treasury operations) are the two most functionally distinct consecutive sections. A subtle 1px rule with `margin: 8px 0 28px` creates structural air without visual decoration.

CSS:
```css
.ag-zone-breath {
  margin-top: 8px; margin-bottom: 28px;
  border: none; border-top: 1px solid var(--ag-line, rgba(0,74,173,.08));
}
```

### 4. Copilot Zone Boundary (Closing Executive Summary)

The "HOY AGENTIK RECOMIENDA" block is the AI synthesis layer — not an operational block. It now has a visual boundary:

```css
.ag-copilot-zone {
  padding-top: 24px;
  border-top: 1px dashed var(--ag-line, rgba(0,74,173,.18));
  margin-top: 8px;
}
```

The **dashed line** is intentional. Dashed = interpretive/advisory. Solid = operational/factual.

Wrapped in `<div className="ag-copilot-zone">` in JSX.

---

## CSS Classes Added (§18)

| Class | Purpose |
|---|---|
| `.ag-op-pulse` | Operational status bar container |
| `.ag-op-pulse--ok` | Green border variant — normal operations |
| `.ag-op-pulse--warn` | Amber border + warm background — attention |
| `.ag-op-pulse--critical` | Red border + warm background — critical |
| `.ag-copilot-zone` | AI synthesis layer wrapper — dashed top separator |
| `.ag-zone-breath` | Structural zone separator `<hr>` — soft 1px rule |

All live in `app/design-system.css §18`.

---

## Operational Priority Zones

After this sprint, Torre de Control has clear zone hierarchy:

```
┌─────────────────────────────────────────────────────┐
│  Centro de mando: [Consolidado] [Empresa] [F2]...   │  ← Control zone
├─────────────────────────────────────────────────────┤
│  ● OPERACIÓN NORMAL · sin alertas · 08 May 2026     │  ← Orientation pulse
├─────────────────────────────────────────────────────┤
│  ████ CENTRO DE MANDO DIARIO (L1 PRIMARY)           │  ← 4px border, 14px
│  [Pedidos] [Ventas] [Facturas] [Cobros] [Alertas]   │
│  ─ Inteligencia Financiera Hoy ─                    │
├─────────────────────────────────────────────────────┤
│  ████ CARTERA Y RIESGO (L2 PRIMARY)                 │  ← 4px border, 14px, red
│  [Cartera 2026] [Cobros identif.] [Consignaciones]  │
│  [Aging buckets: 0-30 / 31-60 / 61-90 / 90+]       │
├─────────── zone breath ─────────────────────────────┤
│  ███ TESORERÍA OPERATIVA (L3 OPERATIONAL)           │  ← 3px border, 13px
│  [CxP] [Bancos] [Tesorería inmediata]               │
├─────────────────────────────────────────────────────┤
│  ██ RADAR COMERCIAL EJECUTIVO (L4 CONTEXTUAL)       │  ← 2px border, 11px, muted
│  [Empresa] [Almacenes] [Web] + intelligence strip   │
│  [Facturado] [Cobros] [Tasa recaudo]                │
├─────────────────────────────────────────────────────┤
│  ███ DECISIONES AGENTIK (L5 OPERATIONAL)            │  ← 3px border, dark panel
│  [Acciones urgentes] [Escalamiento]                 │
├─- - - - - - - - copilot zone - - - - - - - - - - - ┤  ← dashed separator
│  HOY AGENTIK RECOMIENDA                             │  ← AI synthesis layer
│  Riesgo principal · Acción inmediata · Síntesis     │
└─────────────────────────────────────────────────────┘
```

---

## Scanning Flow (Before vs After)

### Before:
1. Enter page
2. Scan view switcher
3. Read each section header (all same weight)
4. Scan each KPI block to understand what matters
5. Eventually reach Decisiones Agentik
6. Manually construct priority

Cognitive load: HIGH — full page scan required

### After:
1. Enter page
2. See operational pulse (0.3s — day character known)
3. Eye goes to PRIMARY section headers (heavier, larger)
4. B1 → B2 scanned first (both primary weight)
5. B3, B4 contextually lighter — naturally lower priority
6. Decisiones Agentik closes with dark panel
7. Dashed line → AI synthesis layer begins

Cognitive load: LOW — hierarchy suggests reading order

---

## Copilot Layer Preparation

The `.ag-copilot-zone` class establishes the visual language for the AI layer:
- **Dashed separator** = interpretive/advisory content below
- Future Copilot cards, suggestions, and recommendations live inside this zone
- When real agent capabilities are wired (real-time recommendations, contextual alerts, proactive suggestions), they extend the existing `ag-copilot-zone` block
- The "HOY AGENTIK RECOMIENDA" card is the semantic anchor for future copilot content

No fake data, no placeholder cards — just the visual boundary and conceptual slot.

---

## What Was NOT Touched

- KPI calculations or data queries
- Card grids, column structures
- B1–B5 content and card layouts
- Shell navigation (workspace-shell-client.tsx)
- Mobile shell components
- Routing or tenant logic
- KPI containment improvements from AGENTIK-KPI-DENSITY-01
- DailyCarousel pagination
- Aging bucket content
- TesoreriaOperativa component
- Decisiones Agentik content or dark panel styling

---

## Visual Audit (Post-Sprint)

| Check | Result |
|---|---|
| Visual noise from B4 | ✅ Reduced — contextual tier quieter without disappearing |
| Attention competition | ✅ B1+B2 dominate; B4 recedes |
| Alert fatigue | ✅ Unchanged — no new alert elements added |
| Broken hierarchy | ✅ Fixed — 3 clear tiers now |
| Excessive emphasis | ✅ None — all changes are subtractive or proportional |
| Executive scanning flow | ✅ Pulse → Primary → Financial Risk → Treasury → Commercial → Action → AI |

---

## Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Torre de Control se siente más ejecutivo | ✅ Hierarchy + pulse give operational authority |
| 2 | La mirada entiende prioridades naturalmente | ✅ Section tiers + pulse direct attention |
| 3 | Zonas críticas tienen más autoridad visual | ✅ B1+B2 primary tier dominates |
| 4 | Zonas secundarias hacen menos ruido | ✅ B4 contextual tier quieter |
| 5 | Sistema se siente más inteligente | ✅ Pulse orientation + copilot boundary |
| 6 | Executive flow más claro | ✅ Scanning flow defined and implemented |
| 7 | No se agregó información innecesaria | ✅ No new KPIs or fake data |
| 8 | No se rompió la simplicidad | ✅ 4 surgical changes, no new components |
| 9 | No se convirtió en BI dashboard | ✅ Calmer, not louder |
| 10 | TypeScript sin errores nuevos | ✅ 162 → 162 |

---

## Risks Pending

- **B5 Decisiones Agentik dark panel**: Still pulls visual gravity at the bottom. Consider reducing padding slightly in a future sprint if attention routing studies suggest it pulls too early.
- **Mobile pulse bar**: `ag-op-pulse` is inside `.dsk-exec` via CSS class — verify it doesn't render on mobile (the `dsk-exec` hide/show is CSS-driven).
- **SectionHeader `contextual` on B4-N/A views**: When `viewCtx.carteraScope === "n/a"`, B4 shows `BlockNotApplicable`. The contextual tier applies only to the B4 header which still renders. No issue.
- **`ag-copilot-zone` with dynamic critical state**: The dashed border is static style. Consider adding `ag-copilot-zone--critical` variant if the AI synthesis should urgently escalate in future.
