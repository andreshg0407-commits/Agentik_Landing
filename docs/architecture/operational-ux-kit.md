# Agentik Operational UX Kit

**Sprint:** AGENTIK-OPERATIONAL-UX-KIT-01
**Status:** Active — mandatory for all new modules

---

## What this is

A reusable component and language kit that standardizes every Agentik module canvas.
Any new domain (Finanzas, Comercial, Cobranza, Inventario, Marketing Studio, etc.) **must** use these components instead of defining its own layout primitives.

---

## Files

| File | Purpose |
|---|---|
| `lib/agentik/ux-language.ts` | Centralized Spanish LATAM business language constants |
| `components/agentik/operational-ux-kit.tsx` | Generic `Ag*` components — single source of truth |
| `components/marketing-studio/shopify/shopify-module-primitives.tsx` | Thin re-export layer with two Shopify-specific wrappers |

---

## Rule 1 — Canvas vs Copilot boundary

**Canvas = module data only.**
Copilot/Sofía lives exclusively in:
- The right rail (`right-ops-rail.tsx`)
- ONE discrete drawer section titled `"Análisis de Sofía"` (position 4 of 5)

**Never put in canvas:** `MSAgentSignal`, `DiegoSlot`, `CopilotSlot`, AI gradient panels, "Recomendaciones de Sofía" sections.

---

## Rule 2 — Universal module pattern

Every module canvas must follow this structure in order:

```
1. OperationalWorkspaceHeader  (or ModulePulseHeader)
2. Connection timeline strip   (AgActivationTimeline)
3. Metric cards grid           (AgKpiGrid + AgMetricCard ×3–4)
4. Protagonist block           (AgModulePrimaryPanel)
5. Secondary blocks            (AgModuleSecondaryPanel ×1–2)
6. Data table                  (ag-op-table + ag-op-row)
7. Drawer                      (OperationalSideDrawer — 5 standard sections)
```

---

## Rule 3 — Empty state pattern

Every module must handle 4 states:

| State | Component |
|---|---|
| Loading | `AgPlaceholderRow` ×3 inside table |
| No connection | `AgActivationTimeline` (expanded mode) |
| Connected, no data | `AgEmptyState` with contextual hint |
| Connected, has data | Full layout |

Never use plain `<div>Sin datos</div>`.

---

## Rule 4 — Standard drawer sections (5, in order)

```
1. Resumen
2. Evolución
3. Datos relevantes
4. Análisis de Sofía
5. Acciones sugeridas
```

Use `DRAWER_SECTIONS` from `lib/agentik/ux-language.ts` for section titles.
Each drawer must use `AgDrawerSection` + `AgDrawerAction`.

---

## Rule 5 — Language

**Prohibited terms:** KPI · Dashboard · Insight · Analytics · Performance · Funnel · Health Score · Engagement

**Use instead** (from `AG_TERMS` / `AG_LABELS`):

| Prohibited | Correct |
|---|---|
| KPI | Indicadores del negocio |
| Dashboard | Centro de operaciones |
| Insight | Señal detectada |
| Analytics | Análisis del negocio |
| Performance | Rendimiento |
| Health Score | Estado operativo |

All text must be in Spanish (LATAM). Business language, not technical jargon.

---

## Rule 6 — Visual hierarchy

```
Module title     → T.mono, T.sz.sm, C.inkFaint (uppercase, 0.09em tracking)
Protagonist value → T.mono, T.sz.2xl, T.wt.bold, C.titleDeep
Section value    → T.mono, T.sz.xl, T.wt.semibold
Table cell       → T.mono, T.sz.sm
Label / sub      → T.mono, T.sz.xs, C.inkMid or C.inkFaint
```

Prose descriptions (multi-sentence) use `T.sans`.
Everything else uses `T.mono`.

---

## Rule 7 — Micro-visualizations

Use these instead of chart libraries:

| Component | Purpose |
|---|---|
| `AgDistributionBar` | Proportional horizontal bar (status breakdown) |
| `AgStageFlow` | Pipeline stages with "→" separators |
| `AgRiskMeter` | Thin fill bar for operational risk level |

No external chart dependencies allowed in module canvases.

---

## Rule 8 — Contextual actions

Drawer actions must be **contextual** — different per data state.
Implement as a pure function `getXxxDrawerActions(ctx): { label, intent }[]` per module.
Never hardcode a static action list.

```typescript
function getPromotionDrawerActions(ctx: PromotionActionCtx): ActionSpec[] {
  if (ctx.actives === 0)        return [/* create actions */];
  if (ctx.porVencer.length > 0) return [/* extend actions */];
  // ...
}
```

---

## Rule 9 — Componentization

Shared domain-agnostic components live in `operational-ux-kit.tsx`.
Domain-specific thin wrappers (URL binding, label defaults) live in domain primitives files.

**Never** duplicate a component that already exists in the kit.

---

## Rule 10 — Backward compatibility

When refactoring an existing module to use the kit:
- Re-export kit components under the original names
- Do not rename props or change component API signatures
- Existing import paths in client components remain valid

---

## Rule 11 — Future modules must use this kit

All new Agentik modules (any domain) are **required** to:
1. Import `Ag*` components from `@/components/agentik/operational-ux-kit`
2. Use language constants from `@/lib/agentik/ux-language.ts`
3. Follow the 5-section drawer order from `DRAWER_SECTIONS`
4. Implement contextual drawer actions via a pure `getXxxDrawerActions` function
5. Never define local duplicates of components that already exist in the kit

---

## Component reference

```typescript
// Generic components — use these directly
AgMetricCard        // Clickable metric tile with status dot
AgKpiGrid           // 4-column responsive metric grid
AgDrawerSection     // Labeled drawer section with uppercase title
AgDrawerAction      // Contextual action button inside drawer
AgPlaceholderRow    // Skeleton row for loading state
AgDistributionBar   // Proportional horizontal fill bar
AgStageFlow         // Horizontal pipeline with arrow separators
AgRiskMeter         // Thin risk level indicator
AgConnectCTA        // Primary connection button (generic href)
AgActivationTimeline // Two-mode onboarding guide (compact vs expanded)
AgModulePrimaryPanel // Protagonist content block (blue borderTop)
AgModuleSecondaryPanel // Secondary content block
AgEmptyState        // Structured empty state with optional CTA

// Shopify-specific wrappers (URL-bound)
ShopifyConnectCTA         // AgConnectCTA → /[orgSlug]/agentik/marketing-studio/shopify
ShopifyActivationTimeline // AgActivationTimeline → same URL
```

---

## Language constants

```typescript
import { AG_TERMS, AG_LABELS, AG_STATE, AG_ACTIONS, DRAWER_SECTIONS } from "@/lib/agentik/ux-language.ts";

AG_TERMS.KPI           // "Indicadores del negocio"
AG_LABELS.alerts       // "Alertas importantes"
AG_STATE.noData        // "Sin datos disponibles"
AG_ACTIONS.viewDetail  // "Ver detalle →"
DRAWER_SECTIONS        // ["Resumen","Evolución","Datos relevantes","Análisis de Sofía","Acciones sugeridas"]
```
