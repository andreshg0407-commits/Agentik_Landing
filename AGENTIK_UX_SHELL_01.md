# AGENTIK-UX-SHELL-01 — AI Operational Workspace Shell Sprint
**Sprint:** AGENTIK-UX-SHELL-01
**Depends on:** AGENTIK-UX-FOUNDATION-01 (design-system.css, lib/ui/surfaces.ts)

---

## Objective

Evolve Agentik's shell from a functional layout into an AI Operational Workspace System.
All changes are purely visual — no logic, routing, data, stores, or permissions were modified.

---

## Files Modified

| File | What Changed |
|------|-------------|
| `components/shell/workspace-shell-client.tsx` | Shell atmosphere, primary rail, context sidebar, collapse buttons |
| `components/layout/right-ops-rail.tsx` | Surface, top accent strip, copilot surface class, header upgrade |

---

## Visual Changes

### 1. Shell Atmosphere (TASK 4)

**What changed:**
- Shell wrapper background: `C.white (#ffffff)` → `var(--ag-surface, #F7F9FF)` — very subtle cool base that separates the shell frame from the workspace canvas
- Main canvas `<main>`: stays `#ffffff` — the contrast between the cool shell bg and the pure white canvas creates a natural "workspace lifted from background" depth signal
- Canvas gets `boxShadow: "inset 1px 0 0 var(--ag-line-sub)"` — a micro brand-tinted inner border reinforcing the separation from both sidebars

**Effect:** The workspace now feels like a defined surface area, not a flat white page.

---

### 2. Left System Rail (TASK 1)

**What changed:**

**Logo zone:**
- Removed `marginBottom: S[3]` from the logo mark itself
- Added a thin separator line below the logo zone: `width: 28px, height: 1px, background: rgba(255,255,255,.10)` with `margin: S[3] 0 S[2]`
- Creates a clear visual "identity zone" vs "navigation zone" separation

**Domain icon contrast (dark-bg fix):**
- Inactive icon color: `"#64748b"` → `"rgba(255,255,255,.42)"` — proper opacity-based white against the dark navy rail background
- Hovered icon color: `"#cbd5e1"` → `"rgba(255,255,255,.80)"` — clearly readable hover state
- Active button background: `${domain.accent}22` → `"rgba(255,255,255,.12)"` — consistent white tint regardless of domain accent color
- Hover button background: `${domain.accent}14` → `"rgba(255,255,255,.07)"` — subtle but consistent

**System status footer:**
- Added a bottom status zone with a `rgba(34,197,94,.65)` soft green dot + glow — a minimal "system is operational" signal
- Separated from nav by `borderTop: "1px solid rgba(255,255,255,.06)"`

**Effect:** The system rail now reads as a proper dark OS-level navigation strip. Icons are clearly legible against the navy background.

---

### 3. Context Sidebar (TASK 2)

**What changed:**

**Borders migrated to brand-tinted:**
- Sidebar right-edge border: `C.sidebarLine` → `var(--ag-line, rgba(0,74,173,.12))` — subtle brand tint on the border
- Domain identity header bottom border: `C.sidebarLine` → `var(--ag-line)` — consistent
- Sidebar background: changed from `C.sidebarBg (#fefeff)` to `#ffffff` — fully white sidebar contrasts cleanly against the `#F7F9FF` shell base

**Collapse button:**
- Border: `C.sidebarLine` → `var(--ag-line)` — brand-tinted
- Color: `C.inkMid` → `C.blueDark` — active brand color for the collapse action
- Shadow: `0 1px 2px rgba(0,0,0,.06)` → `var(--ag-shadow-sm)` — brand-tinted shadow

**Section headers (NavItemLink):**
- Color: `C.inkGhost (#d1d5db)` → `C.inkFaint (#9ca3af)` — more readable, still clearly secondary
- Letter spacing: `0.08em` → `0.09em` — slightly tighter group label rhythm
- `paddingTop: S[3]` → `S[4]` — more breathing room above section groups
- Added `borderTop: 1px solid C.lineSubtle` + `marginTop: S[1]` — subtle visual separator between navigation groups

**Nav item hover:**
- Hover background: `C.surfaceAlt (#f2f4f7)` → `var(--ag-brand-50, #EEF5FF)` — brand-tinted hover, consistent with the brand family
- Active background: `${accent}15` → `${accent}12` — slightly lighter alpha, just enough to indicate active without overwhelming

**Effect:** The sidebar now has clear group hierarchy and brand-consistent interaction states.

---

### 4. Right Intelligence Rail (TASK 3)

**What changed:**

**Top brand accent strip:**
- Added a 3px brand gradient strip at the very top of the intelligence rail (`var(--ag-grad-brand)`)
- Negative margin technique (margin -S[3] horizontal) extends it to full rail width
- Signals that this panel is AI/brand-layer, not a generic sidebar

**Surface:**
- Background: `C.sidebarBg (#fefeff)` → `var(--ag-surface, #F7F9FF)` — cool surface tint that distinguishes the intelligence rail from the pure white canvas

**Padding restructure:**
- Changed `padding: ${S[4]}px ${S[3]}px` → `padding: 0 ${S[3]}px ${S[4]}px` (no top padding, let the strip sit flush at the top)

**Header upgrade:**
- "Ops · Hoy" label: `C.inkFaint` → `C.inkMid` — more assertive
- Added a live signal dot (5px, `rgba(34,197,94,.80)` with glow) to the left of the "Ops · Hoy" label
- Description text `C.inkGhost` → `C.inkFaint` — slightly more readable
- Left-aligned description with the dot icon column offset

**Copilot surface:**
- Replaced 5-property inline style block with `className="ag-copilot-surface"` — consolidates to the official AI surface class from design-system.css
- Reduces inline duplication, applies consistent `bg/border/radius/shadow/overflow` from the foundation

**Right rail collapse button:**
- Border: `C.sidebarLine` → `var(--ag-line)` — brand-tinted
- Color: `C.inkMid` → `C.blueDark` — brand color
- Shadow: `0 1px 2px rgba(0,0,0,.06)` → `var(--ag-shadow-sm)` — brand-tinted

**Effect:** The right rail now has a clear brand signal at the top, correct surface tinting for depth, and the copilot surface is properly classified under the AI surface system.

---

## What Was NOT Changed

- All routing and navigation architecture
- All workspace state (UX-SYSTEM-01/02/03 fully intact)
- All financial logic, queries, Prisma models
- All module visibility / permission logic
- All tenant / role logic
- All text content (labels, nav item names)
- All nav item hrefs and active state logic
- All mobile shell behavior (`.org-rail` hidden at 1024px)
- All right rail data queries (alerts, tasks, SAG approvals)
- All copilot conversation logic
- All existing workspace pages

---

## New CSS Classes Added

None. All surface treatments use existing classes from `app/design-system.css`:
- `.ag-copilot-surface` — applied to the copilot container in right-ops-rail.tsx
- `var(--ag-surface)`, `var(--ag-line)`, `var(--ag-shadow-sm)`, `var(--ag-grad-brand)` — CSS variables from the foundation

---

## Duplication Cleaned (TASK 6)

| Before | After |
|--------|-------|
| 5 inline style properties on copilot wrapper | `className="ag-copilot-surface"` |
| `C.sidebarLine` border in 4 places in shell | All migrated to `var(--ag-line)` |
| `0 1px 2px rgba(0,0,0,.06)` in 2 collapse buttons | Migrated to `var(--ag-shadow-sm)` |
| `"#64748b"` / `"#cbd5e1"` as raw hex on dark rail | Replaced with `rgba(255,255,255,...)` opacity values |

---

## TypeScript Validation

```
npx tsc --noEmit 2>&1 | grep -E "workspace-shell|right-ops-rail|copilot-rail"
→ (no output) — zero new errors
```

No new inline hex values introduced that aren't justified.
No new arbitrary gradients, shadows, or radii.

---

## Risks / Known Debt

| Area | Note |
|------|------|
| Mobile shell | `org-rail` is hidden via `.org-rail` CSS class at ≤1024px — no changes were needed |
| Section header borderTop | The `borderTop` on section headers will also appear on the very first section header. If nav starts immediately with a section header (no nav items before), this creates a double-border visual with the domain identity separator. Review if this becomes an issue with specific tenant nav configs. |
| System status dot | The green dot in the primary rail is static (not wired to any health check). Visually communicates "operational" but could be misleading if the system is degraded. Future: wire to a real health signal. |

---

## Recommendation for Next Sprint

**AGENTIK-UX-WORKSPACE-01** — Workspace canvas refinement:
- Upgrade the Torre de Control executive page workspace area with the semantic surface system
- Apply `ag-surface-elevated` / `ag-surface-insight` to data cards that still use ad-hoc inline styles
- Unify the section headers across operational workspace pages using the foundation
- Review cobros-hoy, consignaciones, cuentas-por-pagar pages for surface class adoption

Or alternatively:

**AGENTIK-UX-TYPEFACE-01** — Typography system pass:
- Audit all `fontFamily: T.mono` vs `T.sans` usage for correctness
- Ensure all KPI values use the clamp-based responsive sizing
- Standardize section header pattern (`T.sz.md + uppercase + 0.07em`) across all modules
