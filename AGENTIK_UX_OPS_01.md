# AGENTIK-UX-OPS-01 — Operational Workspace Hierarchy
**Sprint:** AGENTIK-UX-OPS-01
**Depends on:** AGENTIK-UX-FOUNDATION-01, AGENTIK-UX-SHELL-01

---

## Objective

Make the central workspace feel like an AI operational workspace OS, not a generic dashboard.
Establish visual hierarchy, operational density, and scan-speed through structured primitives.

All changes are purely visual. No logic, routing, data, stores, or permissions were modified.

---

## Files Modified

| File | Changes |
|------|---------|
| `app/design-system.css` | Added §12 — Operational Workspace Hierarchy classes |
| `components/executive/daily-carousel.tsx` | Severity modifier classes applied to KPI cards |
| `components/shell/primitives.tsx` | Panel/KpiCard radius, PanelHeader CTA color, DataSourceTag font token |
| `app/(app)/[orgSlug]/executive/page.tsx` | 11 targeted visual edits |

---

## Operational Focus Hierarchy — 4 Levels

| Level | Semantic | Visual Treatment | Implementation |
|-------|----------|-----------------|----------------|
| **1 — Critical Focus** | Alerts, overdue, urgent | Red surface tint, red left bar on KPI card | `.ag-kpi-card.ag-urgent` |
| **2 — Active Execution** | Operational KPIs, clickable cards | Brand gradient card, blue left bar | `.ag-kpi-card` (default) |
| **3 — Contextual Intelligence** | AI decisions, insights | Dark navy AI surface | `.ag-level-context`, `var(--ag-grad-ai)` |
| **4 — Ambient Structure** | Labels, metadata, separators | `C.inkFaint`, small mono text | Existing token classes |

---

## Visual Changes

### §12 New CSS Classes (design-system.css)

| Class | Purpose |
|-------|---------|
| `.ag-workspace-header` | Main H1 + controls row with brand-tinted bottom border |
| `.ag-view-switcher` | Channel selector bar — brand-50 bg, brand-line border, xl radius |
| `.ag-signal-strip` | 3-column channel signal grid wrapper — card radius, brand-line border |
| `.ag-kpi-card.ag-urgent` | Critical KPI: red gradient surface + red left bar + red hover shadow |
| `.ag-kpi-card.ag-warning` | Warning KPI: amber gradient surface + amber left bar + amber hover |
| `.ag-level-context` | Intelligence panel: dark navy AI gradient surface |
| `.ag-intel-header` | Section header inside white cards — brand-50 bg + brand-line bottom |
| `.ag-insight-card` | White card with brand-tinted border and card radius |

### daily-carousel.tsx — Signal Card Severity

KPI cards now communicate operational urgency via surface color:
- `severity === "critical"` → `className="ag-kpi-card ag-urgent"` — red tinted surface, red left bar, red hover
- `severity === "warning"` → `className="ag-kpi-card ag-warning"` — amber tinted surface, amber left bar
- Other severity → `className="ag-kpi-card"` — standard brand treatment

Example: "Alertas activas" card with criticals now renders with a red surface and red left bar. The left bar changes from brand blue gradient to red, immediately communicating operational urgency.

### primitives.tsx — Radius + Brand Alignment

| Element | Before | After |
|---------|--------|-------|
| `Panel` border-radius | `R.md (6px)` | `R.card (18px)` — enterprise card scale |
| `KpiCard` border-radius | `R.md (6px)` | `R.card (18px)` — enterprise card scale |
| `PanelHeader` CTA link color | `C.brand (#7c3aed purple)` | `C.blueDark (#004AAD)` — brand blue |
| `DataSourceTag` font family | `"monospace"` (string literal) | `T.mono` (design token) |

### executive/page.tsx — 11 edits

**Workspace atmosphere:**
- Desktop wrapper: `fontFamily: "monospace"` → `T.mono` — uses design token
- Main header bottom border: `1.5px solid C.ink` → `1px solid var(--ag-line)` — brand-tinted, lighter

**View switcher (Centro de Mando):**
- Background: `"#f8fafc"` → `var(--ag-surface, #F7F9FF)` — matches shell atmosphere
- Border: `1.5px solid C.sidebarLine` → `1px solid var(--ag-line)` — brand-tinted

**SectionHeader function — editorial left-bar approach:**
- Before: full-width `2px solid ${accent}` bottom border
- After: `3px solid ${accent}` left bar + `1px solid ${accent}40` bottom border (25% alpha) + `paddingLeft: S[3]`
- Before: `marginBottom: S[4]` (16px)
- After: `marginBottom: S[5]` (20px) — more breathing room between sections
- Effect: section headers now feel like editorial zone identifiers, not dashboard tabs. The left bar provides the identity signal; the light bottom border provides structural separation.

**sigCard function (Cartera signal cards):**
- `background: "linear-gradient(#fff,#F7F9FF)"` → `var(--ag-grad-card)` — CSS var
- `boxShadow: "0 1px 6px rgba(0,74,173,.07)"` → `var(--ag-shadow-sm)` — CSS var

**Radar Comercial signal strip:**
- Container: `R.md → R.card`, `C.line → var(--ag-line)` — brand-tinted, card radius
- Card top bar: `"3px solid #1e40af"` → `"3px solid var(--ag-brand, #004AAD)"` — **fixed outdated Tailwind hex**

**Inteligencia comercial block:**
- Container: `R.md → R.card`, `C.line → var(--ag-line)` — consistent with other cards
- Header bg: `C.surfaceAlt → var(--ag-brand-50)` — brand-tinted section header
- Header border: `C.lineSubtle → var(--ag-line)` — brand-tinted
- Header text color: `C.inkMid → C.blueDark` — brand color for intelligence label

**Decisiones Agentik block:**
- Background: `"linear-gradient(135deg, #0f172a, #1e3a8a)"` → `var(--ag-grad-ai)` — CSS var
- Radius: `R.xl (12px)` → `R.card (18px)` — enterprise card radius

**Brand color migration (purple → brand blue):**
- "Radar Comercial Ejecutivo" section header: `accent={C.brand}` → `accent={C.blueDark}` — fixes purple leak
- "Decisiones Agentik" section header: `accent="#1e3a8a"` → `accent={C.blueDark}`
- "AGENTIK IA" badge: `"#1e3a8a"` → `C.blueDark`
- "HOY AGENTIK RECOMIENDA" label: `"#1e3a8a"` → `C.blueDark`
- TesoreriaOperativa card accent: `"#1e3a8a"` → `C.blueDark`

---

## What Was NOT Changed

- All routing and navigation architecture
- All financial logic, queries, Prisma models
- All module visibility / permission logic
- All text content (labels, nav item names, sublabels)
- All nav item hrefs and active state logic
- All mobile shell (mob-exec untouched)
- All operational workspace pages (cobros-hoy, etc.)
- All DailyCarousel data wiring
- All pagination logic in DailyCarousel
- All TesoreriaOperativa data logic
- All SectionHeader text props (label, sublabel, badge)

---

## TypeScript Validation

```
npx tsc --noEmit 2>&1 | grep -E "executive/page|daily-carousel|primitives"
→ (no output) — zero new errors
```

---

## Foundation Compliance Audit

Searched modified files for new raw hex/gradient/shadow values:

| Pattern searched | Result |
|-----------------|--------|
| New raw `#` hex outside tokens | None introduced |
| New inline `linear-gradient(...)` | None — all existing ones migrated to `var(--ag-grad-*)` |
| New `box-shadow` raw values | None — migrated to `var(--ag-shadow-sm)` |
| New arbitrary `border-radius` | None — `R.card` used throughout |

Pre-existing raw values that were cleaned up:
- `#1e40af` (Tailwind blue) → `var(--ag-brand)` in radar top bar
- `#1e3a8a` (dark blue) → `C.blueDark` in 5 places
- `"monospace"` → `T.mono` in 2 places
- `linear-gradient(135deg, #0f172a, ...)` → `var(--ag-grad-ai)` in Decisiones block

---

## Known Risks / Remaining Debt

| Area | Note |
|------|------|
| SectionHeader `${accent}40` | The hex `40` alpha suffix for the border-bottom assumes the accent is a 6-digit hex. If a CSS var is passed as accent in the future, `${cssVar}40` would produce an invalid value. Currently all callers pass hex strings so this is safe. |
| SourceMixPanel component | Not read in this sprint — may have its own `#1e3a8a` or `C.brand` uses |
| Operational workspace pages | cobros-hoy, consignaciones, etc. still use pre-foundation patterns |
| `BlockNotApplicable` function | Not audited in this sprint |

---

## Recommendation for Next Sprint

**AGENTIK-UX-OPS-02** — Operational workspace pages hierarchy:
- Apply the same hierarchy system to cobros-hoy, consignaciones, cuentas-por-pagar pages
- Upgrade `OperationalWorkspaceHeader` component to use `ag-workspace-header` class
- Apply `ag-signal-strip`, `ag-insight-card`, `ag-intel-header` to workspace detail pages
- Standardize section headers across all Torre de Control detail pages

Or:

**AGENTIK-UX-PRIMITIVES-01** — Extend the primitives system:
- Upgrade `Panel` / `PanelHeader` / `KpiCard` to use new CSS classes
- Create a reusable `<WorkspaceSection>` component that wraps `SectionHeader` + content
- Add semantic color prop to KpiCard that maps to severity modifier classes
