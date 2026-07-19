# UX-014: Inteligencia Navegable

**Status:** ACTIVE
**Sprint:** GO-LIVE-MALETAS-INTELIGENCIA-NAVEGABLE-01
**Applies to:** All modules with intelligence/decision center panels

---

## Rule

> Every KPI, metric, indicator, and decision element in an intelligence panel
> MUST be navigable to its data origin.

A number displayed without a path to its source is a dead metric.
Dead metrics erode trust.

---

## Implementation pattern

### NavigateTarget

```typescript
type NavigateTarget =
  | { tab: "referencias"; line?: string; filter?: DrawerFilter }
  | { tab: "derrotero"; line?: string };
```

### Callback threading

Intelligence sub-components receive click callbacks from the parent decision
center, which delegates to an `onNavigate` callback provided by the drawer
owner (who controls tab state, filters, and expanded sections).

```
Drawer (owns state)
  └─ CommercialDecisionCenter (threads callbacks)
       ├─ CoverageCircle        → onClick → onNavigate({tab:"derrotero", line})
       ├─ PriorityActionsCard   → onActionClick → onNavigate({tab:"referencias"})
       ├─ PendingSubgroupsCard  → onSubgroupClick → onNavigate({tab:"derrotero", line})
       ├─ OperationalImpactCard  (read-only)
       └─ LineActionSummary      (read-only)
```

### Visual affordances

- Clickable elements use `<button>` (not `<div onClick>`) for accessibility
- Hover states change border color or background
- Arrow indicators (`→`) hint at navigation
- `title` attributes describe the destination
- `cursor: "pointer"` on all interactive elements

---

## Coverage circle pattern

Replaces flat coverage cards with SVG circular indicators:

- Ring stroke shows percentage filled
- Color coding: green (>=80%), amber (>=50%), red (<50%), gray (no derrotero)
- Click navigates to Derrotero tab for that line
- Shows fraction label below: "X/Y subgrupos"

---

## Checklist for new modules

1. Does every displayed number link to its source data?
2. Can the user trace a KPI back to the underlying records?
3. Are click targets `<button>` elements with `title` and `cursor: pointer`?
4. Does the intelligence panel accept an `onNavigate` callback?
5. Are navigation targets clearly typed (not string unions)?

---

## Validation

```bash
npx tsx scripts/validate-inteligencia-navegable.ts
```

10 checks, all must PASS.
