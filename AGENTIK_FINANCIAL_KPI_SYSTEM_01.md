# AGENTIK-FINANCIAL-KPI-SYSTEM-01
## Tesorería Operativa — KPI Runtime System Refinement

**Sprint:** AGENTIK-FINANCIAL-KPI-SYSTEM-01
**File scope:** `app/(app)/[orgSlug]/finanzas/tesoreria/page.tsx` — Posición de Caja section only
**Backend constraint:** NO Prisma, NO APIs, NO engine, NO SAG changes

---

## Problem diagnosis

AGENTIK-FINANCIAL-UX-SYSTEM-01 established the correct visual language.
The remaining issue was NOT structural — it was **precision**.

The "Posición de Caja" KPI section had:
- Inconsistent padding across cards (primary explicit, secondary relying on class defaults)
- Accidental number spacing (`marginTop: S[1]` on secondary values — too tight)
- Accidental card order that forced the wrong reading sequence
- `1.5fr` primary card width — not dominant enough
- Dense subtexts without breathing room (`lineHeight` unset)
- Standard `C.line` borders — slightly too visible, competed with content

The result: four isolated components, not one unified treasury runtime.

---

## KPI runtime philosophy

A treasury KPI grid is NOT a list of metrics.

It is an **operational signal system** that communicates in one glance:
1. What is the total position?
2. What financial pressure exists?
3. Where is this going in 7 days?
4. What is liquid right now?

Each card plays a distinct role in that narrative. The design must encode those roles visually — through proportion, color, weight, and position.

---

## Financial hierarchy system

### Card roles and positions

| Position | Card | Role | Color | Weight |
|----------|------|------|-------|--------|
| 1 (primary, 2× wide) | Caja disponible | HERO SIGNAL — total position | `C.ink` (dark, heavy) | 700 |
| 2 | Comprometido | PRESSURE SIGNAL — immediate financial tension | `C.amber` | 700 |
| 3 | Proyectado 7d | STRATEGIC SIGNAL — forward-looking, neutral | `C.inkMid` | 600 |
| 4 | Disponible hoy | SUCCESS SIGNAL — closes the read positively | `C.green` | 700 |

### Eye flow rationale

```
1 → 2 → 3 → 4
Position → Pressure → Forecast → Liquidity
```

The operator reads:
- "I have $82.3M total"
- "But $31.2M is already committed — amber pressure"
- "In 7 days, $69.1M projected — neutral trajectory"
- "Today I can move $18.4M freely — positive confirmation"

This is not the order that looks prettiest. It is the order that builds the correct **financial mental model** in the fastest possible scan.

---

## Grid system

```css
gridTemplateColumns: "2fr 1fr 1fr 1fr"
```

Primary card is `2fr` — exactly twice the width of each secondary card.
This is intentional: the total position deserves proportionally more canvas.
`1.5fr` was too subtle. `2fr` makes the hierarchy unambiguous.

---

## Spacing rules

### Card padding

| Card type | Padding token | Value |
|-----------|--------------|-------|
| Primary (Caja disponible) | `S[6]` | 24px all sides |
| Secondary (all 3 others) | `S[5]` | 20px all sides |

Consistency rule: all secondary cards must have the same explicit padding. Never rely on CSS class defaults for alignment-critical values.

### Number spacing (marginTop above the amount)

All cards: `marginTop: S[3]` (12px).

This replaces the previous accidental values (`S[1]` = 4px and `S[2]` = 8px on secondary cards). The 12px separation between the label and the amount is what creates the visual "stage" for the number.

### Subtext spacing (marginTop below the amount)

| Card | marginTop |
|------|-----------|
| Primary | `S[3]` (12px) — matches number spacing |
| Secondary | `S[2]` (8px) — slightly tighter to preserve density |

All subtexts: `lineHeight: 1.5` — makes even single-line subtexts feel intentional.

---

## Border language

Previous: `border: 1px solid ${C.line}` on cards.
Refined: `border: 1px solid ${C.lineSubtle}` on all KPI cards.

`C.lineSubtle` is lighter than `C.line`. The change is nearly imperceptible in isolation but makes the card feel **surface-driven** rather than box-driven. The content floats on a plane rather than being contained by a border.

The top accent bar (`ag-kpi-bar`) still provides the primary visual edge. The border becomes structural infrastructure, not a decorative frame.

---

## Typography system

### Number sizing

| Card | Token | Role |
|------|-------|------|
| Caja disponible | `T.sz["3xl"]` | Hero — dominates the section |
| All secondary | `T.sz["2xl"]` | Supporting — readable, not competing |

### Number weight

| Card | Weight |
|------|--------|
| Primary, Comprometido, Disponible hoy | `700` — bold, signal |
| Proyectado 7d | `600` — medium, intentionally softer — forecast is probabilistic, not certain |

### Line height

All amounts: `lineHeight: 1.1` (primary) / `lineHeight: 1.15` (secondary).
Tight line height on large numbers is correct — it tightens the visual mass and makes numbers look like **data**, not text.

### Label style

All card labels: `textTransform: "uppercase"`, `letterSpacing: "0.06em"` to `"0.08em"`.
Primary uses `0.08em` (slightly more open — proportional to its size).

---

## Microinteractions

```tsx
transition: "box-shadow 0.15s"
```

Added to all KPI cards. On hover (via CSS class), the card lifts slightly.
150ms — below the threshold for "animated dashboard" feel, at the threshold for "alive and responsive."

The transition is on `box-shadow` only — no scale, no border change, no color shift. Just enough to confirm interactivity without introducing visual instability.

---

## What was NOT changed

- Grid container (`marginBottom: S[5]` — unchanged)
- Bank distribution panel — unchanged
- Committed panel — unchanged
- Risk dot strip — unchanged
- Any section outside Posición de Caja — untouched
- All other runtime sections (IA Financiera, Flujo del Día, Bancos, Obligaciones, Forecast, Acciones) — untouched
- Navigation, architecture, mock data — unchanged

---

## Summary of changes

| Property | Before | After |
|----------|--------|-------|
| Grid columns | `1.5fr 1fr 1fr 1fr` | `2fr 1fr 1fr 1fr` |
| Card order | Disponible · Disponible hoy · Comprometido · Proyectado | Disponible · Comprometido · Proyectado · Disponible hoy |
| Secondary padding | Class default | Explicit `S[5]` |
| Number marginTop (secondary) | `S[1]`/`S[2]` | `S[3]` |
| Subtext lineHeight | Unset | `1.5` |
| Subtext marginTop (secondary) | `S[1]` | `S[2]` |
| KPI card border | `C.line` | `C.lineSubtle` |
| Hover transition | None | `box-shadow 0.15s` |
| Number lineHeight (secondary) | `1.2` | `1.15` |

---

## TypeScript compliance

- Zero new errors introduced.
- Project total: 160 errors (unchanged from baseline).
