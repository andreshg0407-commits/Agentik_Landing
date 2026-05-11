# AGENTIK-UX-FLOW-01 — Cross-Workspace Operational Flow
**Sprint:** AGENTIK-UX-FLOW-01
**Depends on:** AGENTIK-UX-FOUNDATION-01 through AGENTIK-UX-EXECUTION-01

---

## Execution Philosophy

Agentik workspaces must flow. A user navigating from the executive dashboard to
Cobros de hoy to Cobros identificados should feel like they are moving through
a connected operational system — not opening disconnected pages.

This sprint adds the visual connective tissue that makes workspace navigation
feel intentional: hover affordances on navigation cards, a unified action
hierarchy in workspace headers, and visible contextual back navigation.

**Rule:** Every workspace-to-workspace navigation element must communicate
operational weight and provide hover feedback. A static card with no hover
state does not communicate "you can navigate here." A card that lifts and
tints to brand-50 on hover says "this is your next operational destination."

---

## Audit Summary

### What already existed (not touched):
- `OperationalWorkspaceHeader` — breadcrumbs, title, status badge, contextual back link structure
- `WorkspaceActions` — primary/secondary/ghost variant system
- `RelatedWorkspaces` — grid of cross-workspace cards with accent left-border
- `SummaryMetricRow` — metric strip row
- `WorkspaceScrollRestore` — scroll position persistence
- All data queries, routing, business logic in all 4 Torre de Control pages

### What needed fixing:
| Issue | Impact |
|-------|--------|
| `WorkspaceActions` primary = `C.blue` flat bg | No brand gradient — inconsistent with action hierarchy system from EXECUTION-01 |
| `WorkspaceActions` secondary = `C.inkMid` text + `C.line` border | Gray text on transparent bg — not brand-50 surface, no brand tint |
| `WorkspaceActions` ghost = `C.blue` | Should be `C.blueDark` (consistent with action hierarchy audit in EXECUTION-01) |
| `RelatedWorkspaces` cards = no hover state | Inline styles block CSS `:hover` — cards feel static, not navigable |
| `OperationalWorkspaceHeader` back link = `C.inkLight` | Near-invisible — hardest to find contextual navigation element |
| `OperationalWorkspaceHeader` breadcrumb links = `C.blue` | Should be `C.blueDark` (consistent with brand blue system) |
| Zero `.ag-flow-*` or `.ag-ws-*` CSS classes | No hover system existed for workspace navigation primitives |

### What did NOT exist (gap):
- Zero flow continuity CSS — no hover transitions on any workspace navigation element

---

## Files Modified

| File | Changes |
|------|---------|
| `app/design-system.css` | Added §16 — Cross-Workspace Flow & Continuity (50 lines) |
| `components/workspace/workspace-actions.tsx` | 3 targeted edits |
| `components/workspace/related-workspaces.tsx` | 1 targeted edit |
| `components/workspace/operational-workspace-header.tsx` | 2 targeted edits |

---

## §16 New CSS Classes (design-system.css)

### Flow & Navigation

| Class | Use |
|-------|-----|
| `.ag-flow-card` | Cross-workspace navigation card — hover: brand-50 wash + 1px lift + shadow |
| `.ag-ws-primary` | Workspace action primary — brand gradient bg + hover lift |
| `.ag-ws-secondary` | Workspace action secondary — brand-50 surface + brand border + hover shadow |
| `.ag-breadcrumb-link` | Breadcrumb link hover — brand blue text + underline |
| `.ag-context-back` | Contextual back nav link — hover to brand blue |

### Visual Design

**`.ag-flow-card`** — The most impactful single change in this sprint. Every `RelatedWorkspaces` card was static and gave no hover feedback. Adding `ag-flow-card` brings: `background → brand-50`, `box-shadow → brand tint 0.12 opacity`, `transform: translateY(-1px)` — communicating "this is a live navigation destination" at 0.12s.

**`.ag-ws-primary`** — Replaces the `C.blue` flat background in `WorkspaceActions` primary actions. Now uses `var(--ag-grad-hero)` — matching every other primary action in the system (ActionButton, modal submit). Primary workspace action = Level 1 execution = brand gradient.

**`.ag-ws-secondary`** — Replaces `C.line` border + transparent bg. Now uses `var(--ag-brand-50)` surface + `var(--ag-line)` brand-tinted border — matching the Level 2 operational style from the action hierarchy.

---

## workspace-actions.tsx — 3 Changes

```tsx
// BEFORE
color: isPrimary  ? "#fff"
     : isSecondary ? C.inkMid
     : C.blue,
background: isPrimary ? (action.accent ?? C.blue) : "transparent",
border: isSecondary ? `1px solid ${C.line}` : "none",
// (no className)

// AFTER
className={isPrimary ? "ag-ws-primary" : isSecondary ? "ag-ws-secondary" : undefined}
color: isPrimary ? "#fff" : C.blueDark,
// background and border removed — delegated to CSS classes
```

**Effect:**
- Primary workspace actions now render with the brand gradient (Level 1 — consistent with ActionButton primary)
- Secondary workspace actions now render with brand-50 surface + brand-tinted border (Level 2 — consistent with ActionButton outline)
- Ghost actions: `C.blue` → `C.blueDark` (consistent with action link color audit from EXECUTION-01)
- `action.accent` override for primary removed (was unused in all 4 pages, and violated the brand gradient system)

---

## related-workspaces.tsx — 1 Change

```tsx
// BEFORE
<Link key={i} href={item.href} style={{ ... }}>

// AFTER
<Link key={i} href={item.href} className="ag-flow-card" style={{ ... }}>
```

**Effect:** All `RelatedWorkspaces` navigation cards now have:
- `transition: background 0.12s ease, box-shadow 0.12s ease, transform 0.1s ease`
- On hover: brand-50 wash + brand shadow tint + 1px lift

The accent left-border (red/amber/blue/green based on workspace type) is preserved — it remains the semantic color signal. The hover wash is always brand-50 regardless of accent — consistent with the system's hover convention.

---

## operational-workspace-header.tsx — 2 Changes

### Contextual Back Link

```tsx
// BEFORE
color: C.inkLight  // very faint gray
// (no className)

// AFTER
color: C.blueDark
className="ag-context-back"
```

The contextual back link (e.g., "← Cobros identificados") is the primary way users navigate upstream between workspaces. It was rendered in `C.inkLight` — nearly invisible against the white canvas. Now it reads as `C.blueDark` with a hover transition to `var(--ag-brand)`. The link is now findable without scanning.

### Breadcrumb Links

```tsx
// BEFORE
color: C.blue  // (no className)

// AFTER
color: C.blueDark
className="ag-breadcrumb-link"
```

Breadcrumb linked crumbs (e.g., "Torre de Control →") now use `C.blueDark` consistent with the brand blue system, and gain a hover underline via `.ag-breadcrumb-link`.

---

## What Was NOT Changed

- All data queries in Torre de Control pages
- All routing, navigation, `href` values
- All `WorkspaceScrollRestore`, `SummaryMetricRow` logic
- All `OperationalWorkspaceHeader` status badge logic
- All accent colors in `RelatedWorkspaces` items
- All TypeScript interfaces in workspace components
- All Prisma models and API routes

---

## Foundation Compliance Audit

| Pattern | Result |
|---------|--------|
| New raw hex values introduced | None |
| New inline gradients introduced | None (all CSS vars with fallbacks) |
| `C.blue` in action links | Eliminated from WorkspaceActions + header breadcrumbs — now `C.blueDark` |
| `C.inkLight` in back navigation | Eliminated — now `C.blueDark` |
| Hover states added via inline styles | None — all hover in CSS classes |

---

## TypeScript Validation

```
npx tsc --noEmit 2>&1 | grep -E "workspace-actions|related-workspaces|operational-workspace-header"
→ (no output) — zero new errors
```

---

## System Coverage (Post-FLOW-01)

| Workspace Component | Before | After |
|--------------------|--------|-------|
| `WorkspaceActions` primary | Flat `C.blue` bg, no hover | Brand gradient, hover lift |
| `WorkspaceActions` secondary | Gray text, `C.line` border | Brand-50 surface, brand-tinted border |
| `WorkspaceActions` ghost | `C.blue` | `C.blueDark` |
| `RelatedWorkspaces` cards | Static, no hover | Brand-50 hover wash + lift |
| Contextual back link | Near-invisible `C.inkLight` | Visible `C.blueDark` + hover |
| Breadcrumb links | `C.blue`, no hover | `C.blueDark` + hover underline |

---

## Known Risks / Remaining Debt

| Area | Note |
|------|------|
| `WorkspaceActions` `action.accent` prop removed from primary | The prop exists in the interface but was only passed in RelatedWorkspaces items (not WorkspaceActions). Interface retained — no callers break. But the visual override is now disabled in favor of the brand gradient. |
| `SummaryMetricRow` uses `T.sans` for metric labels | All other operational elements use `T.mono`. Low priority — the sans label is a deliberate typographic distinction (label vs value). Deferred. |
| `ag-flow-card` hover uses `!important` | Necessary to override the inline `background` and `boxShadow` on the Link element. A future refactor could move those properties to CSS and remove `!important`. |

---

## Recommendation for Next Sprint

**AGENTIK-UX-FLOW-02** — Operational continuity signals:
- Add `ag-intel-tag` relational hints to `RelatedWorkspaces` cards ("3 pendientes", "señales activas") using real data counts passed from the server
- Add `.ag-ws-primary` + `.ag-ws-secondary` to `ActionButton` variant system — unify the trigger button styles with workspace actions completely
- Apply workspace navigation pattern to customer-360 and commercial workspace pages
- Wire `ag-action-row` class to Decisiones Agentik rows in executive page (currently only CSS-defined, never applied)
