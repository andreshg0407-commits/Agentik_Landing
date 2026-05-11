# AGENTIK VISUAL FOUNDATION — Governance Document
**Sprint:** AGENTIK-UX-FOUNDATION-01
**Version:** 1.0
**Scope:** Enterprise OS shell (`app/(app)/**`) — not the public landing page

---

## Visual Philosophy

Agentik is an AI-powered Enterprise Operating System. The visual language must communicate that — not through decoration, but through precision, density, and hierarchy.

**Four governing principles:**

1. **Operational clarity over aesthetic novelty** — Every visual element should reduce cognitive load for a decision-maker scanning the screen. If it doesn't communicate data or status, it should be removed.
2. **Brand without noise** — `#004AAD` is the primary action color. It should appear on things the user *acts on*. Not as decoration.
3. **Enterprise motion** — Transitions exist to orient the user across state changes. Nothing spins, bounces, or animates for pleasure. Max 200ms, max 1px lift.
4. **System consistency** — Use the defined surfaces, radii, and shadows. Never invent a new visual treatment locally. If the existing system doesn't cover your case, extend the system first.

---

## Color Hierarchy

| Token | Value | Role |
|-------|-------|------|
| `--ag-brand` | `#004AAD` | Primary action — CTA buttons, active tabs, focus rings |
| `--ag-brand-700` | `#003A8C` | Pressed / deepened state |
| `--ag-brand-500` | `#1E63D8` | Gradient midpoint |
| `--ag-brand-400` | `#4F8FE8` | Light accent, hover borders |
| `--ag-brand-100` | `#D0E4FF` | Border highlights, badges |
| `--ag-brand-50` | `#EEF5FF` | Surface tints, rail footers |

**Signal colors** (status only — never decorative):

| Token | Value | Use |
|-------|-------|-----|
| `--ag-ok` | `#22c55e` | Healthy, on-time, zero alerts |
| `--ag-warn` | `#f59e0b` | Warning, delayed, pending review |
| `--ag-critical` | `#ef4444` | Critical, overdue, requires action |
| `--ag-info` | `#004AAD` | Informational (same as brand) |

**Rules:**
- Never use raw hex values outside `design-system.css` or `tokens.ts`
- Always use `C.*` tokens in JS and `var(--ag-*)` in CSS
- Purple (`C.brand = #7c3aed`) is a legacy token for non-AI brand accent — **do not use it for navigation, AI, or copilot surfaces**

---

## Surface Hierarchy

Eight named surfaces. Every container in the product maps to one of these levels.

| Surface | CSS Class | JS Object | Layer |
|---------|-----------|-----------|-------|
| Shell | `.ag-surface-shell` | `Surface.shell` | Navigation rail, OS chrome |
| Workspace | `.ag-surface-workspace` | `Surface.workspace` | Main canvas, page background |
| Elevated | `.ag-surface-elevated` | `Surface.elevated` | Cards, panels above canvas |
| Floating | `.ag-surface-floating` | `Surface.floating` | Modals, drawers, popovers |
| AI | `.ag-surface-ai` | `Surface.ai` | Copilot, intelligence strips |
| Subtle | `.ag-surface-subtle` | `Surface.subtle` | Sidebar tints, rail footers |
| Danger | `.ag-surface-danger` | `Surface.danger` | Critical alerts, error states |
| Insight | `.ag-surface-insight` | `Surface.insight` | Operational data with brand bar |

**Decision rule:** Choose the surface level before writing any background/border/shadow inline. If none of the 8 fits, check whether you're introducing a new layer that needs to be added to the system.

---

## Elevation System

Four levels of shadow depth:

| Level | CSS Variable | Use |
|-------|-------------|-----|
| `sm` | `--ag-shadow-sm` | Cards resting on the canvas |
| `md` | `--ag-shadow-md` | Panels with slight lift |
| `focus` | `--ag-shadow-focus` | Focus ring (3px brand halo) |
| `floating` | `--ag-shadow-floating` | Modals, drawers above everything |

All shadows use brand-tinted rgba (`rgba(0,74,173,...)`) — never neutral grey shadows. This keeps depth signals within the brand color family.

---

## Radius System

Five named radii. Choose by **component role**, not by visual preference.

| Name | Value | Use |
|------|-------|-----|
| `sm` | `4px` | Chips, tags, small badges |
| `md` | `8px` | Buttons, inputs, icon buttons |
| `card` | `18px` | Cards, panels, all major containers |
| `xl` | `24px` | Large drawers, sheet surfaces |
| `pill` | `9999px` | Pills, full-round badges |

---

## Typography Hierarchy

| Level | Font | Size Token | Weight | Use |
|-------|------|------------|--------|-----|
| Metric value | Mono | `clamp(22px, 2.4vw, 34px)` | 700 | KPI card primary value |
| Section header | Mono | `T.sz.md` (13px) | 600 | Panel section titles |
| Card title | Sans | `T.sz.sm` (11px) | 700 | Card header label |
| Body / data | Mono | `T.sz.base` (12px) | 400 | Data rows, tables |
| Meta / label | Sans/Mono | `T.sz.xs` (10px) | 400–600 | Badges, tags, timestamps |
| Ghost | Mono | `T.sz["2xs"]` (9px) | 400 | Footer text, decorative |

**Rules:**
- Section headers: always uppercase + letter-spacing `0.07em`
- KPI values: always monospace — data deserves a fixed-width font
- Never use `font-family: "monospace"` — always use `T.mono` token

---

## Spacing Rhythm

The spacing scale (`S`) is base-4:

```
S[1] =  4px   S[2] =  8px   S[3] = 12px
S[4] = 16px   S[5] = 20px   S[6] = 24px
```

**Rules:**
- Card internal padding: `S[3]` (12px) or `S[4]` (16px)
- Card margin-bottom between sections: `S[2]` (8px)
- Section header margin-bottom: `S[4]` (16px)
- Never use odd pixel values (e.g. `13px`, `7px`) unless it's a specific border/accent thickness

---

## AI Layer Rules

All AI and intelligence surfaces must use the AI surface tier:

- **Background:** `var(--ag-grad-ai)` — dark navy gradient (`#001E4A → #003A8A`)
- **Color:** `#ffffff`
- **CSS Class:** `.ag-surface-ai` or `.ag-ai-strip`
- **JS Object:** `Surface.ai`

AI surfaces must feel distinct from operational cards — they signal "this is intelligence output, not data input." Do not apply brand blue backgrounds, card gradients, or any operational surface style to AI output blocks.

**Copilot Rail:** Uses `.ag-copilot-surface` — brand-50 tinted container. Copilot is always in the right rail, always contextual to the current module.

---

## Interaction Philosophy

| State | Behavior | Max duration |
|-------|----------|-------------|
| Hover (card) | 1px translateY + shadow increase | 150ms |
| Hover (nav/row) | Border color + bg tint | 150ms |
| Focus | 3px brand halo (no outline) | instant |
| Rail expand/collapse | Width transition | 200ms |
| Context fade | Opacity fade | 200ms |

**Rules:**
- Every interactive element must have a `:hover` and `:focus-visible` state
- Hover lifts are 1px max — depth signal, not animation
- Use `cubic-bezier(0.4, 0, 0.2, 1)` (ease-standard) for all transitions
- No `ease-in` (abrupt exit), no `linear` (mechanical)

---

## File Map

| File | Purpose |
|------|---------|
| `app/design-system.css` | CSS source of truth — all `--ag-*` tokens, surface classes, motion, radii, elevation |
| `lib/ui/tokens.ts` | JS source of truth — `C`, `T`, `S`, `R`, `E` exported constants |
| `lib/ui/surfaces.ts` | JS semantic surfaces — `Surface.*`, `Shadow.*`, `Motion.*` for dynamic styles |
| `app/globals.css` | Imports design-system.css; sets Tailwind + base variables |

---

## DO / DO NOT

**DO:**
- Use `C.*` tokens for all colors in JS
- Use `var(--ag-*)` in CSS
- Choose a named surface before writing background/border inline
- Use `R.card` (18px) for all major card containers
- Use `.ag-kpi-card` for any clickable KPI card
- Use `E.sm` / `Shadow.sm` for card elevation
- Keep all transitions ≤ 200ms

**DO NOT:**
- Write raw hex values like `#004AAD` in JSX inline styles — use `C.blueDark`
- Use `C.brand` (purple) for navigation or AI surfaces — use `C.blueDark`
- Use `border-radius: 4px` on cards — use `R.card` or `R.md` as appropriate
- Use `box-shadow` grey values like `rgba(0,0,0,...)` — use brand-tinted equivalents
- Add `transition` or `:hover` in inline styles — put them in CSS classes
- Create one-off surface styles — extend the 8-surface system first
- Import `design-system.css` directly from component files — it's globally available via `globals.css`

---

## Extension Protocol

To add a new visual pattern:

1. Check if an existing surface or class covers it (`design-system.css` §5–§9)
2. If not, add it to the appropriate section in `design-system.css`
3. If it requires JS-side use, add a counterpart in `lib/ui/surfaces.ts`
4. Update this document under the relevant section
5. Never create local inline one-offs for patterns that appear in more than 2 places
