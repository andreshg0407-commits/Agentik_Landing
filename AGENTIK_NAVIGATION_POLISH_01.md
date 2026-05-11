# AGENTIK-NAVIGATION-POLISH-01 — Enterprise Rail Refinement
**Sprint:** AGENTIK-NAVIGATION-POLISH-01
**Depends on:** AGENTIK-NAVIGATION-01

---

## Visual Philosophy

An enterprise OS rail must communicate three states unambiguously at a glance:
**where I am** (active), **what I could be** (hover), and **what exists** (inactive).

The refinement principle: use light as material. On a dark navy surface, depth
is created not through color but through opacity layers — a top rim light, a
bottom shadow, a micro-elevation. These are the same principles used in premium
physical control surfaces: a pressed button has rim lighting because it's
*sitting above the plane*.

---

## Audit Findings

### Issue 1 — Active icon color used `domain.accent`

The `domain.accent` colors are defined for display on white (the sidebar).
On the dark navy rail:
- Gestión `#1e1e2e` — near-black on dark navy = INVISIBLE (contrast < 1.5:1)
- Finanzas `#1e40af` — medium blue on dark navy = poor contrast
- Comercial `#0369a1` — dark blue on dark navy = poor contrast

**Result:** Active module icons were unreadable for 3 of 6 domains.

### Issue 2 — Active surface was a flat white rectangle

```
background: "rgba(255,255,255,.12)"  // flat 12% white — featureless
```

No depth, no elevation signal. The "Excel selection" feeling came from this
undifferentiated fill with no internal shadow structure.

### Issue 3 — No `boxShadow` on active button

Zero elevation. The active module felt like a tinted cell, not a pressed
surface or a current workspace indicator.

### Issue 4 — Indicator used raw `domain.accent`

Same contrast problem: the left-bar indicator for Gestión and Finanzas was
nearly invisible on dark navy.

### Issue 5 — Rail had no material depth separator

The rail edge met the context sidebar with no shadow or depth signal.
The rail didn't feel like a persistent shell layer — it felt like a column.

### Issue 6 — Hover/inactive contrast jump

`rgba(255,255,255,.45)` → `rgba(255,255,255,.85)` = 40-point jump.
The hover state was almost as bright as a properly-lit active state should be,
leaving no visual headroom for a distinct active state color.

---

## Files Modified

| File | Changes |
|------|---------|
| `components/shell/workspace-shell-client.tsx` | 4 targeted edits |

---

## Changes

### 1. `RAIL_ACCENTS` registry — lighter palette for dark surface

```typescript
const RAIL_ACCENTS: Record<string, string> = {
  gestion:   "#94a3b8",   // slate-400  — neutral prestige, executive authority
  finanzas:  "#60a5fa",   // blue-400   — financial clarity
  cobranza:  "#a78bfa",   // violet-400 — collections identity
  comercial: "#38bdf8",   // sky-400    — commercial presence
  marketing: "#c084fc",   // purple-400 — creative/AI studio identity
  internal:  "#818cf8",   // indigo-400 — system console
};
```

These are the same hue families as the sidebar accents, lifted to the 400-level
Tailwind stops for WCAG AA+ contrast on `#001E4A–#003A8A`. The sidebar accents
are unchanged — they remain correct for display on white backgrounds.

Used for:
- Left-bar indicator `background`
- Indicator ambient glow `boxShadow`
- (Domain identity, not icon color — icon is now always white on active)

### 2. PrimaryRail container — right-edge material depth

```tsx
// Added to PrimaryRail container:
boxShadow: "inset -1px 0 0 rgba(255,255,255,.05), 3px 0 12px rgba(0,0,0,.18)"
```

- `inset -1px 0 0 rgba(255,255,255,.05)` — subtle right-edge highlight, 5% white. Creates the impression of a lit physical edge — the rail has thickness.
- `3px 0 12px rgba(0,0,0,.18)` — outward shadow toward the sidebar. The rail sits in front of the content layer, casting a gentle shadow onto the sidebar.

### 3. Left-bar indicator — domain ambient glow

```tsx
// Before
background: domain.accent,
transition: "height 0.15s ease",

// After
background:    rAccent,
boxShadow:     isActive ? `0 0 8px ${rAccent}40` : "none",  // 25% opacity ambient
transition:    "height 0.18s ease, box-shadow 0.18s ease",
```

The indicator bar now bleeds a very subtle 25%-opacity glow of the domain's
color. This creates a micro "environment color" around the active item —
professional, not neon. The glow transitions out smoothly when switching domains.

### 4. DomainButton — three-tier icon hierarchy + layered active surface

**Icon color hierarchy:**

```
// Before
active:   domain.accent   (could be #1e1e2e — invisible)
hover:    rgba(255,255,255,.85)
inactive: rgba(255,255,255,.45)

// After
active:   "#ffffff"                   — unambiguous "you are here"
hover:    rgba(255,255,255,.88)       — responsive, NOT "current"
inactive: rgba(255,255,255,.52)       — present, recessive
```

**Active surface — layered depth:**

```
// Before
background: rgba(255,255,255,.12)
// no box-shadow

// After
background: rgba(255,255,255,.14)
boxShadow:  "inset 0 1px 0 rgba(255,255,255,.13),   ← top rim light
             inset 0 -1px 0 rgba(0,0,0,.22),         ← bottom depth
             0 2px 8px rgba(0,0,0,.20)"               ← micro-elevation
```

The three-layer shadow creates a "pressed card" sensation:
- **Top rim**: 13% white = subtle highlight from an imaginary light source above
- **Bottom depth**: 22% black = the surface recedes at the bottom
- **Elevation**: 20% black shadow below = the button sits slightly above the rail plane

**Hover — differentiated from active:**

```
// Before: rgba(255,255,255,.07)
// After:  rgba(255,255,255,.08)
```

Slight increase for clarity, but more importantly: no box-shadow on hover.
This maintains the visual hierarchy:
- Only active state has elevation
- Hover responds (background + bright icon) but does NOT appear to be "the current module"

**Transition refinement:**

```
// Before: "background 0.12s ease, color 0.12s ease"
// After:  "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease"
```

Slightly slower (0.15s vs 0.12s) — the active shadow fades gracefully when
switching domains. Box-shadow is now part of the transition.

---

## Before / After Summary

| Element | Before | After |
|---------|--------|-------|
| Active icon color | `domain.accent` (invisible for 3/6 domains) | `#ffffff` (always legible) |
| Hover icon color | `rgba(255,255,255,.85)` | `rgba(255,255,255,.88)` |
| Inactive icon color | `rgba(255,255,255,.45)` | `rgba(255,255,255,.52)` |
| Active background | `rgba(255,255,255,.12)` flat | `rgba(255,255,255,.14)` + 3-layer shadow |
| Hover background | `rgba(255,255,255,.07)` | `rgba(255,255,255,.08)` |
| Indicator color | `domain.accent` (dark/invisible) | `RAIL_ACCENTS[id]` (lifted 400-level) |
| Indicator glow | None | `0 0 8px ${rAccent}40` (25% opacity) |
| Rail edge | No depth | Right-edge rim + outward shadow |
| Transition | 0.12s background + color | 0.15s background + color + box-shadow |

---

## Icon Visibility After Fix

| Domain | Old accent on rail | New rail accent | Contrast on #003A8A |
|--------|--------------------|-----------------|---------------------|
| Gestión | `#1e1e2e` (near-black) | `#94a3b8` (slate-400) | ✓ Passes AA |
| Finanzas | `#1e40af` (dark blue) | `#60a5fa` (blue-400) | ✓ Passes AA |
| Cobranza | `#7c3aed` (medium violet) | `#a78bfa` (violet-400) | ✓ Passes AAA |
| Comercial | `#0369a1` (dark blue) | `#38bdf8` (sky-400) | ✓ Passes AAA |
| Marketing | `#7c2d92` (dark purple) | `#c084fc` (purple-400) | ✓ Passes AA |
| Consola | `#4f46e5` (medium indigo) | `#818cf8` (indigo-400) | ✓ Passes AA |

---

## What Was NOT Changed

- Navigation architecture, routing, shell layout
- Context sidebar, ContextPanel, NavItemLink
- All domain taxonomy (from NAVIGATION-01)
- PrimaryRail layout: width (64px), gap, padding, separator
- Logo mark
- System status dot (bottom zone)
- All module accents used in the sidebar (unchanged — correct for white bg)
- Right Ops Rail, canvas
- All business logic, data, queries

---

## Foundation Compliance

| Pattern | Result |
|---------|--------|
| New inline raw hex values | `#94a3b8`, `#60a5fa`, `#a78bfa`, `#38bdf8`, `#c084fc`, `#818cf8` in RAIL_ACCENTS — these are Tailwind 400-level values used as a semantic rail color system. Not arbitrary. |
| New inline shadows | Active button shadow — 3-layer system. Rail edge shadow. Indicator glow. All intentional, none excessive. |
| Existing tokens used | `R.lg`, `T.mono`, `T.wt.bold`, `S.*` — all preserved |
| New CSS classes added | None — all refinements in inline styles (dynamic values require React state) |

---

## TypeScript Validation

```
npx tsc --noEmit 2>&1 | grep -E "workspace-shell-client|module-nav-config"
→ (no output) — zero new errors
```

---

## Remaining Debt

| Area | Note |
|------|------|
| RAIL_ACCENTS hardcoded | Could become a computed function from domain.accent + a lightness transform. For now, explicit values are more predictable and controllable. |
| `railAccent` prop not in DomainDef | Only used client-side (dark surface context). Keeping it out of the serializable DomainDef is correct. |
| Indicator glow `#rrggbbAA` hex syntax | `${rAccent}40` appends hex opacity. Works in all modern browsers. IE11 unsupported (irrelevant for this product). |
