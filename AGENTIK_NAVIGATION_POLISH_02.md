# AGENTIK-NAVIGATION-POLISH-02 — Shell Cohesion + Premium Rhythm
**Sprint:** AGENTIK-NAVIGATION-POLISH-02
**Depends on:** AGENTIK-NAVIGATION-01, AGENTIK-NAVIGATION-POLISH-01

---

## Shell Cohesion Philosophy

A premium enterprise shell is not a collection of panels — it is one connected
operational surface. The dark rail and the white sidebar must feel like they
were designed together, not placed next to each other.

This sprint resolves the remaining shell fragmentation through:
- **Breathing rhythm** — vertical grouping instead of compressed list
- **Temperature** — active states feel warm/executive, not cold/library
- **Typographic hierarchy** — labels support icons, not compete with them
- **Material continuity** — rail and sidebar share a physical shadow relationship

---

## Audit Findings

### Issue 1 — `gap: S[1]` (4px) between 52px buttons
Six 52px domain buttons with 4px gaps = 332px stacked column.
No visual breathing, no operational grouping. Feels like a list, not a cockpit.

### Issue 2 — No grouping between Gestión and operational domains
Gestión (management/executive) and Finanzas/Cobranza/Comercial/Marketing
(operational domains) are rendered at identical visual weight and spacing.
No hint of hierarchy. "All modules feel equal" when they aren't.

### Issue 3 — Active background was `rgba(255,255,255,.14)` — cold flat
A pure white overlay on cool dark navy = colorless, cold, "Excel selection".
No temperature, no enterprise depth, no premium material feel.

### Issue 4 — Icon and label shared the same `color` value
Both icon and label inherited `iconColor` from the button.
At active state: icon pure white AND label pure white = label competes with icon.
Labels should always be secondary to icons in an OS navigation rail.

### Issue 5 — Label `letterSpacing: "0.04em"`, `fontWeight: T.wt.bold`
- 0.04em tracking is standard, not premium
- `T.wt.bold` (700) at 8px is heavy — visually noisy at small size
Enterprise uppercase labels need more tracking (0.07em+) and lighter weight (600).

### Issue 6 — `comercial: "#38bdf8"` (sky-400)
Sky-400 reads as startup cyan / tech SaaS blue.
Enterprise commercial/sales identity should be a more neutral blue.
Changed to `#93c5fd` (blue-300) — same hue family, less saturated, more executive.

### Issue 7 — Sidebar had no left-edge connection to the rail
The sidebar's `boxShadow` had only a right-edge border (`inset -1px 0 0 ...`).
The left edge meeting the rail had no shadow treatment — abrupt material cut.

---

## Files Modified

| File | Changes |
|------|---------|
| `components/shell/workspace-shell-client.tsx` | 7 targeted edits |

---

## Changes

### 1. Import `Fragment`

```typescript
// Before
import { useState, useEffect } from "react";

// After
import { useState, useEffect, Fragment } from "react";
```

Required for the domain grouping divider pattern (Fragment with key in .map()).

### 2. `comercial` RAIL_ACCENT — `#38bdf8` → `#93c5fd`

```typescript
comercial: "#93c5fd",   // blue-300 — enterprise blue, not startup cyan
```

Blue-300 is softer and more executive than sky-400. Same hue family, reduced
saturation = professional rather than playful.

### 3. PrimaryRail gap — `S[1]` (4px) → `6`

```tsx
// Before: gap: S[1],   // 4px — cramped
// After:  gap: 6,      // 6px — breathing room
```

2px increase between all rail children. Small number, meaningful rhythm.
Combined with the grouping dividers, creates a noticeably more breathable scan.

### 4. Sidebar left-edge continuity shadow

```tsx
// Before
boxShadow: "inset -1px 0 0 var(--ag-line, rgba(0,74,173,.12))",

// After
boxShadow: "inset -1px 0 0 var(--ag-line, rgba(0,74,173,.12)), inset 4px 0 14px rgba(0,28,70,.05)",
```

`inset 4px 0 14px rgba(0,28,70,.05)` — a 5% dark navy shadow cast from the left
edge of the sidebar, simulating the shadow the rail casts onto the sidebar surface.
Result: the two panels now share a physical relationship. The rail "touches" the sidebar.

### 5. Domain grouping dividers

```tsx
domains.map((domain, idx) => {
  const showDivider = idx > 0 && (
    domains[idx - 1]?.id === "gestion" || domain.id === "internal"
  );
  return (
    <Fragment key={domain.id}>
      {showDivider && (
        <div style={{
          width: 26, height: 1,
          background: "rgba(255,255,255,.08)",
          flexShrink: 0, alignSelf: "center", margin: "2px 0",
        }} />
      )}
      <div style={{ ... }}>
        {/* indicator + DomainButton */}
      </div>
    </Fragment>
  );
})
```

Two dividers appear:
1. **Between Gestión and Finanzas** — separates management layer from operational layer
2. **Before Consola** — separates the internal system console from client operational domains

The dividers are `rgba(255,255,255,.08)` — 8% white on dark navy = a barely-visible
but perceptible groove. Not a hard separator. A breathing gap with a whisper of structure.

### 6. Active button — warm-cool gradient

```tsx
// Before
const bg = isActive ? "rgba(255,255,255,.14)" : ...

// After
const bg = isActive
  ? "linear-gradient(160deg, rgba(255,252,244,.15) 0%, rgba(205,225,255,.13) 100%)"
  : hovered ? "rgba(255,255,255,.08)"
  : "transparent";
```

The active surface transitions from:
- **Top** `rgba(255,252,244,.15)` — barely cream/warm white (15% opacity)
- **Bottom** `rgba(205,225,255,.13)` — cool periwinkle white (13% opacity)

On dark navy, this creates a subtle "temperature gradient" — the button has a
warmth at top (executive/premium) that cools toward the base (anchored to the
navy brand color). This is how IBM's enterprise design system and macOS pressed
states create depth without using strong colors.

The flat `rgba(255,255,255,.14)` gave a cold, neutral overlay. The gradient gives
a micro-environment — the active module has its own light source.

### 7. Label typography — independent color + premium tracking

```tsx
// Label color (new, independent from icon):
const labelColor = isActive   ? "rgba(255,255,255,.78)"   // bright but secondary
                 : hovered    ? "rgba(255,255,255,.62)"
                 : "rgba(255,255,255,.36)";                // very recessive at rest

// Span style changes:
fontWeight:    T.wt.semibold,   // was T.wt.bold — 600 not 700
letterSpacing: "0.07em",        // was "0.04em" — 75% more tracking
color:         labelColor,      // was inherited from button (= same as icon)
```

**Hierarchy created:**
- Active: icon = `#ffffff` (100%), label = `rgba(255,255,255,.78)` (78%) → icon leads
- Hover: icon = `rgba(.88)`, label = `rgba(.62)` → icon clearly dominates
- Inactive: icon = `rgba(.52)`, label = `rgba(.36)` → labels are confirmatory, not primary

**Weight refinement:** 600 (semibold) vs 700 (bold) at 8px uppercase is the difference
between "operational label" and "heavy small caps". Semibold at 0.07em tracking reads
as precise and deliberate.

---

## Grouping Structure (Post-Sprint)

```
─────────────────────
  A   (Agentik)
─────────────────────
  [Gestión]

 ── ── ── ── ──       ← management / operational divider

  [Finanzas]
  [Cobranza]
  [Comercial]
  [Marketing]

 ── ── ── ── ──       ← operational / system divider (internal only)

  [Consola]           ← only when showInternal = true
─────────────────────
  ● (system status)
─────────────────────
```

---

## What Was NOT Changed

- Navigation architecture, routing, all module taxonomy
- Icon system (DOMAIN_ICONS registry)
- Active state box-shadow layering (from POLISH-01)
- RAIL_ACCENTS except comercial
- Left-bar indicator logic and dimensions
- ContextPanel, NavItemLink — sidebar rendering
- Shell layout: PRIMARY_W, CTX_W, RAIL_W
- Transitions (0.15s ease)
- All business logic, data, queries

---

## Foundation Compliance

| Pattern | Result |
|---------|--------|
| New raw hex values | `rgba(255,252,244,.15)`, `rgba(205,225,255,.13)` in gradient — intentional, documented. `rgba(0,28,70,.05)` sidebar shadow — named navy at 5% opacity. |
| `#93c5fd` in RAIL_ACCENTS | Tailwind blue-300, replaces sky-400. Semantic designation. |
| Fragment import | Standard React — no external dependency |
| New inline gradients | Active button gradient — 2 RGBA values, both <16% opacity, enterprise-grade |

---

## TypeScript Validation

```
npx tsc --noEmit 2>&1 | grep workspace-shell-client
→ (no output) — zero new errors
```

---

## Remaining Debt

| Area | Note |
|------|------|
| Divider uses `domains[idx-1]?.id === "gestion"` | Works correctly but is positional. If domain order changes, divider placement follows. Intentional — grouping is semantic. |
| `gap: 6` not from S[] token | S[1]=4 too small, S[2]=8 possibly too large. 6px is a considered between-value. Could be `S.rail.gap` in a future token extension. |
| ContextPanel sidebar header still uses `T.sans` | Minor inconsistency with rest of shell (mono). Low priority — the domain label on white background benefits from sans distinction. |
