# AGENTIK-TEMPORAL-INTELLIGENCE-01
## Operational Movement + Executive Change Awareness

**Sprint closed:** 2026-05-09
**Files touched:** 2 (design-system.css, executive/page.tsx)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Temporal Awareness Philosophy

An executive operational system that only shows *what is* — not *what is happening* — is a report, not a command layer.

The key insight of this sprint:
> **Temporal intelligence does not require historical data. The structure of current data contains the movement story.**

An aging cartera IS a temporal signal. The distribution across 0-30 / 31-60 / 61-90 / 90+ buckets tells you where the portfolio is moving — without needing yesterday's snapshot. A 90+ bucket with balance means cartera has been deteriorating. A clean 0-30-only cartera means it's healthy and young.

The same logic applies to:
- Consignaciones count → blockage = stagnation of cash flow
- Cobros/cartera ratio → recovery velocity signal
- Alert count → escalation pressure

This sprint extracts those embedded signals and surfaces them as **movement language**.

---

## Movement Language Principles

Movement language in Agentik follows strict vocabulary:

### Use (operational, calm):
- "cartera envejeciendo · acción urgente"
- "flujo activo · sin bloqueos"
- "deterioro activo · acumulándose en 61-90 días"
- "señales tempranas · monitoreo preventivo"
- "cobro progresando · X% cubierto"
- "recuperación en curso"
- "operación evolucionando dentro de parámetros"
- "flujo bajo presión · liquidez bloqueada"

### Never use (analytics/trading language):
- "+14.3% growth"
- "bullish"
- "momentum"
- "market signal"
- numeric deltas without context

### Why:
Business operational intelligence must feel like **a senior analyst's briefing**, not a trading terminal. The language is interpretive, not numeric. It answers "what is happening?" not "by how much?".

---

## Changes Delivered

### 1. §19 CSS — Temporal Signal Primitives

New classes in `app/design-system.css §19`:

```css
.ag-movement-tag           → base compact chip (uppercase, 9px, monospace)
.ag-movement-tag--stable   → green tint  — no deterioration
.ag-movement-tag--watch    → amber tint  — early warning, follow-up
.ag-movement-tag--risk     → red tint    — active deterioration
.ag-temporal-ctx           → secondary movement annotation text
```

These are the vocabulary containers. Any movement string gets wrapped in these classes to signal its interpretive nature.

### 2. cobrosCard.ratio → Recovery Velocity Signal

**Before:**
```
Estimado: cobros representan 73% de cartera por gestionar
```

**After** (movement-aware, tiered interpretation):
```
Cobro fuerte · 80%+ de cartera vencida gestionada
Cobro progresando · 50-79% cubierto · flujo activo
Recuperación en curso · 20-49% de cartera gestionada
Cobro bajo presión · <20% capturado · seguimiento urgente
```

This transforms a neutral percentage into an **executive interpretation** of recovery velocity. The executive immediately understands whether the cobros team is ahead, on track, or behind.

### 3. Intel Strip Cobros Cell — Contextual Awareness

The "Cobros · hoy" cell in the Inteligencia Financiera strip now includes consignaciones context in its note:

```
Before: "3 recibos · pendiente conciliar"

After (no consignaciones): "3 recibos · flujo activo · sin bloqueos"
After (with consignaciones): "3 recibos · flujo activo · 2 consig. bloqueando"
After (no cobros + consig): "sin cobros hoy · consignaciones acumulando"
After (no cobros + clean): "flujo de cobros sin movimiento"
```

The consignaciones signal appears IN the cobros context — telling the executive whether the cobros that exist are freely flowing or blocked by unidentified deposits.

### 4. Aging Grid → Cartera Movement Interpretation Row

After the 4-bucket aging grid (0-30 / 31-60 / 61-90 / 90+), a new row interprets the **distribution** as a movement signal.

**Logic:**
```
90+ > 0       → ag-movement-tag--risk   → "cartera envejeciendo · acción urgente en +90d"
61-90 > 0     → ag-movement-tag--watch  → "deterioro activo · cartera acumulándose en 61-90 días"
31-60 > 0     → ag-movement-tag--watch  → "señales tempranas · monitoreo preventivo en 31-60 días"
0-30 > 0 only → ag-movement-tag--stable → "cartera saludable · sin vencimientos · flujo normal"
```

Secondary tag when 90+ > 0: `"$X vencido crítico"` (amount in risk class).
Secondary tag when 61-90 > 0 and no 90+: `"$X en riesgo"`.

**Why this matters:** The 4 aging buckets previously showed AMOUNTS. They now also show MEANING. The executive does not need to mentally categorize the distribution — the system interprets it.

No new queries. `_b90p`, `_b6190`, `_b3160` are already computed in the B2 IIFE from `carteraKpis.aging`.

### 5. Copilot Zone — "EVOLUCIÓN OPERATIVA" Editorial Block

The Closing Executive Summary now has **4 editorial blocks** instead of 3:

1. RIESGO PRINCIPAL — current state severity
2. ACCIÓN INMEDIATA — what to do today
3. RECOMENDACIÓN AGENTIK — strategic recommendation
4. **EVOLUCIÓN OPERATIVA** ← NEW temporal intelligence block

The 4th block uses movement language derived from existing data:

```
deterioro + overdueRatio > 30%:
  → "Deterioro activo · cartera vencida representa X% del total · riesgo acumulando"

90+ only:
  → "Cartera +90 días activa · $X en seguimiento intensivo · flujo de cobro en revisión"

consignaciones pending:
  → "Flujo bajo presión · N consignaciones sin identificar · liquidez bloqueada"

isWarning (minor):
  → "Señales leves activas · situación estabilizándose · seguimiento preventivo en curso"

clean:
  → "Sin deterioro detectado · operación evolucionando dentro de parámetros normales"
```

---

## Copilot Layer Preparation

The "EVOLUCIÓN OPERATIVA" block is the **first slot of the future agent intelligence layer**.

When Agentik agents are wired:
- Luca (marketing) could contribute: "Luca detectó caída en conversión F2 esta semana"
- Finance agent: "Finanzas observa presión creciente en 31-60d"
- Cobranza agent: "Cartera escaló 3 clientes al bucket crítico"

Today, these strings are derived from static data. Tomorrow, they'll be generated by contextual agents. The editorial block format — `eyebrow` + `value` — is already agent-ready.

**`ag-copilot-zone`** established in the previous sprint provides the visual container. **EVOLUCIÓN OPERATIVA** provides the editorial slot. These two together define the AI intelligence layer.

---

## Escalation System (How the System Communicates Worsening)

Movement escalation follows the existing severity vocabulary:

| Signal | Class | Executive perception |
|---|---|---|
| Aging only in 0-30 | `ag-movement-tag--stable` | Green chip — calm scan |
| 31-60 bucket active | `ag-movement-tag--watch` | Amber chip — slightly more present |
| 61-90 bucket active | `ag-movement-tag--watch` | Amber + secondary amount tag |
| 90+ active | `ag-movement-tag--risk` | Red chip + red amount tag — dominates |

The CSS classes control color, not size. No elements grow louder through scale — only through **tonal shift**. This matches the "calm escalation" philosophy.

---

## What Was NOT Touched

- KPI calculations or data queries
- Card grids, column structures
- Shell navigation
- Mobile shell components
- Routing or tenant logic
- KPI containment improvements (§17)
- Executive hierarchy system (§18 tiers)
- Operational pulse bar
- Copilot zone visual boundary
- Any business logic or financial computation
- Aging bucket colors or labels
- `SectionHeader` tiers

---

## Visual Noise Audit (Post-Sprint)

| Check | Result |
|---|---|
| Trend overload | ✅ Only 3 precise insertion points — not everywhere |
| Excessive arrows | ✅ Zero arrows used — language-based, not iconographic |
| Alert fatigue | ✅ Movement tags are compact, compact, non-flashing |
| Escalation inconsistency | ✅ stable/watch/risk mirrors existing severity vocabulary |
| Hierarchy regressions | ✅ None — §18 tiers unchanged |
| Executive scanning flow | ✅ Movement interpretation appears AT natural reading pause points |

---

## Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Torre de Control comunica movimiento | ✅ Aging interpretation + cobros ratio + evolución |
| 2 | El ejecutivo entiende qué cambió | ✅ 4th editorial block gives movement context |
| 3 | El sistema se siente más inteligente | ✅ Language-based interpretation of structural patterns |
| 4 | Las tendencias son calmadas y ejecutivas | ✅ No arrows, no deltas, no stock UI |
| 5 | No aparece ruido visual | ✅ 3 small tags, all contextual and placed precisely |
| 6 | El sistema sigue sintiéndose premium | ✅ Same color system, same typography, same rhythm |
| 7 | Se prepara la futura capa de agentes | ✅ EVOLUCIÓN OPERATIVA block + ag-copilot-zone established |
| 8 | No se convirtió en dashboard financiero | ✅ No charts, no deltas, no growth metrics |
| 9 | No se rompió la simplicidad | ✅ 5 surgical edits, zero new components |
| 10 | TypeScript sin errores nuevos | ✅ 162 → 162 |

---

## Risks Pending

- **Movement tag on mobile**: `.ag-movement-tag` renders inside `.dsk-exec` content — verify it's hidden on mobile via existing CSS.
- **Cobros ratio with non-consolidado views**: The `ratioStr` is only computed in the `default` case (consolidado view). Other views (empresa, f2, tiendas) return `ratio: null`. Movement language correctly doesn't appear for non-consolidado — this is intentional.
- **`evolucion` string for extreme edge cases**: If `overdueRatio` is null/undefined (no cartera data), `(carteraKpis?.overdueRatio ?? 0).toFixed(0)` returns "0" — acceptable fallback.
- **Future agent enrichment**: When real agents are wired, `evolucion` should be REPLACED by agent-generated strings, not duplicated. The editorial slot format already supports this substitution.
