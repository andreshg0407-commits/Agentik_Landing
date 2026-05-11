# AGENTIK UX SYSTEM LOCK — 01
## Global Operational UX Enforcement System

**Sprint:** AGENTIK-UX-SYSTEM-LOCK-01
**Status:** COMPLETE — all 12 tasks delivered
**Scope:** Documentation, formalization, primitives, Claude dev rules
**Breaking changes:** ZERO — this sprint formalizes without rewriting production

---

## PART I — VISUAL PHILOSOPHY

### What Agentik Is

Agentik is an **operational enterprise OS** — not a dashboard collection.
Every module is a workspace inside a single coherent system.

An operator opening Finance, Reconciliation, or Marketing Studio should feel
the same spatial rhythm, the same visual weight, the same interaction grammar.
The product experience is continuous. There are no "other screens" — only
different operational contexts within one system.

### What Agentik Is NOT

| Anti-Pattern | Why It Fails |
|---|---|
| Generic SaaS dashboard | Random card grids with no operational logic |
| ERP admin template | Dense data tables without hierarchy or context |
| Cyberpunk/hacker UI | Aggressive color, neon glows, dark-mode-first noise |
| Excel-like layout | Flat rows, no visual weight, no operational signal |
| Multi-dashboard cobbled together | Each module looks like a different product |
| Alert-heavy interface | Red everywhere — alert fatigue kills operational clarity |

### The Calm Operations Principle (Task 6)

**Stability is a signal. Silence has meaning.**

An operator on Agentik should be able to scan a page in under 3 seconds and know:
- What requires attention right now
- What is operating normally
- What needs a decision

Rules derived from this:
1. **No ambient red.** Red means "action required NOW." If everything is red, nothing is.
2. **Hierarchy before color.** Typography weight and spacing communicate importance first.
3. **Empty is not broken.** An empty state should feel purposeful, not like an error.
4. **Motion is functional.** Transitions confirm state changes. They are never decorative.
5. **Data speaks for itself.** No artificial urgency, no pulsing animations for normal data.
6. **Elevation means layer.** Cards float because they are interactive — not for decoration.

### Visual Character

- **Premium and executive.** Every surface should feel like it belongs in a C-suite tool.
- **Clear and operational.** Every element earns its place by communicating something useful.
- **Intelligent.** AI-powered surfaces are distinct but integrated — not alien overlays.
- **Calm.** The product feels stable even under complex data. Complexity is organized, not exposed.

---

## PART II — DESIGN TOKEN SYSTEM (Task 4)

### Source of Truth

Two parallel systems that must be used consistently:

| Layer | File | Purpose |
|---|---|---|
| CSS variables | `app/design-system.css` | Global CSS; used in className-based components and ag-* utility classes |
| JS constants | `lib/ui/tokens.ts` | Inline React styles in server/client components; imports as `C, T, S, R, E` |

### Token Inventory

#### Colors (CSS → `--ag-*`, JS → `C.*`)

**Brand Blue (primary identity)**
```
--ag-brand      #004AAD   C.blueDark   Primary action, nav accents, focus rings
--ag-brand-700  #003A8C                Pressed state
--ag-brand-500  #1E63D8                Gradient midpoint
--ag-brand-400  #4F8FE8                Light accent
--ag-brand-100  #D0E4FF                Border highlight
--ag-brand-50   #EEF5FF   C.blueLight  Surface tint, hover bg
```

**IMPORTANT — Color System Tension:**
`tokens.ts` exports `C.brand = "#7c3aed"` (purple) — a legacy from an earlier identity.
The actual primary brand is `#004AAD` (Agentik blue), available in tokens as `C.blueDark`.
New components must use `C.blueDark` for brand blue actions, never `C.brand`.
This will be resolved in a future token unification sprint.

**Ink (text hierarchy)**
```
C.ink       #0f0f1a   Primary text
C.inkMid    #374151   Secondary text
C.inkLight  #6b7280   Tertiary / metadata
C.inkFaint  #9ca3af   Placeholder / ghost
C.inkGhost  #d1d5db   Decorative dividers
```

**Semantic signals**
```
--ag-ok       #22c55e   C.green  → positive/matched/reconciled
--ag-warn     #f59e0b   C.amber  → attention required, watch state
--ag-critical #ef4444   C.red    → critical, overdue, exception
--ag-info     #004AAD   C.blue   → informational, neutral reference
```

#### Spacing (JS → `S.*`, px)
```
S[1] = 4px    S[2] = 8px    S[3] = 12px   S[4] = 16px
S[5] = 20px   S[6] = 24px   S[8] = 32px   S[10] = 40px
```

#### Border Radius (CSS → `--ag-radius-*`, JS → `R.*`)
```
R.xs   = 3px     chips, micro elements
R.sm   = 4px     small badges, status dots
R.md   = 6px     buttons, inputs
R.lg   = 8px     icon buttons, interactive cells
R.xl   = 12px    drawers, large panels
R.card = 18px    cards, all major containers
R.pill = 9999px  pills, toggle thumbs, full-round badges
```

#### Elevation (CSS → `--ag-shadow-*`, JS → `E.*`)
```
E.sm  (shadow-sm)       cards resting on canvas
E.md  (shadow-md)       panels with lift (context sidebar, rail cards)
E.lg  (shadow-floating) modals, floating surfaces
E.focus                 3px brand halo — replaces browser focus rings
```

#### Typography
```
T.mono = JetBrains Mono → ALL operational data, KPIs, labels, badges, tables
T.sans = Inter          → UI prose, descriptions, explanatory text only
```

#### Typography Scale
```
T.sz["2xs"] = 9px   micro-labels, source tags, intel tags
T.sz.xs     = 10px  secondary metadata, action buttons
T.sz.sm     = 11px  table cells, nav items
T.sz.base   = 12px  default operational text
T.sz.md     = 13px  panel titles
T.sz.lg     = 14px  primary labels
T.sz.xl     = 16px  section headings
T.sz["2xl"] = 20px  workspace titles
T.sz["3xl"] = 24px  primary KPI numbers
T.sz["4xl"] = 28px  hero KPI numbers
```

---

## PART III — STANDARD MODULE BLUEPRINT (Task 2)

Every module follows this anatomy. Not every layer is required — omit layers that don't apply.
Never invent a new layout pattern when this blueprint covers the use case.

```
┌─────────────────────────────────────────────────────┐
│  1. MODULE PULSE HEADER                             │
│     Breadcrumbs · Title · Status signal             │
├─────────────────────────────────────────────────────┤
│  2. OPERATIONAL SUMMARY STRIP                       │
│     3-4 KPI cards · ag-signal-strip / ag-kpi-card   │
├─────────────────────────────────────────────────────┤
│  3. PRIMARY WORKSPACE                               │
│     Core operational content — tables, workbenches  │
├─────────────────────────────────────────────────────┤
│  4. SECONDARY WORKSPACE (optional)                  │
│     Supporting detail, filters, configuration       │
├─────────────────────────────────────────────────────┤
│  5. SESSIONS / RESULTS / RUNS (optional)            │
│     Historical runs, session list, result workbench │
├─────────────────────────────────────────────────────┤
│  6. ATTENTION LAYER (conditional)                   │
│     Exception list, alerts, requires-review items   │
├─────────────────────────────────────────────────────┤
│  7. COPILOT SLOT (progressive)                      │
│     AI synthesis — dashed separator above           │
├─────────────────────────────────────────────────────┤
│  8. ACTIVITY / AUDIT LAYER (optional)               │
│     Recent events, audit trail, run history         │
└─────────────────────────────────────────────────────┘
```

### Layer rules

**Layer 1 — Module Pulse Header** (REQUIRED)
- Always use `OperationalWorkspaceHeader` from `components/workspace/operational-workspace-header.tsx`
- Breadcrumbs reflect the OS navigation path
- Status signal: ok / warning / critical / neutral
- Never use a generic H1 + subtitle without the workspace header

**Layer 2 — Operational Summary Strip** (REQUIRED when module has KPIs)
- Use `ag-signal-strip` container with `ag-kpi-card` children
- Max 4 cards per strip in a standard row
- Each card: primary number + label + optional sublabel + optional source tag
- Never use Tailwind `grid` for KPI cards — use the ag-signal-strip pattern

**Layer 3 — Primary Workspace** (REQUIRED)
- Operational table (ag-op-table + ag-op-row) or specialized workbench
- Always includes: filter/search bar + table + pagination or empty state
- No generic `<table>` HTML. Always `ag-op-table` class with `ag-op-row` rows

**Layer 6 — Attention Layer** (only when exceptions exist)
- Exceptions, alerts, differences that require operator action
- Never shown when count = 0. Show an empty operational state instead.
- Uses `ag-op-row--critical` or `ag-op-row--warning` row modifiers

**Layer 7 — Copilot Slot** (progressive — not required for MVP)
- Separated from operational layers by `ag-copilot-zone` (dashed top border)
- AI-dark surface (`ag-surface-ai` or `ag-level-context`)
- Never mixed into the operational data layers

---

## PART IV — OPERATIONAL PRIMITIVES (Task 3)

### Existing Primitives (do not recreate)

| Primitive | File | Status |
|---|---|---|
| `Badge` | `components/shell/primitives.tsx` | Stable |
| `SectionLabel` | `components/shell/primitives.tsx` | Stable |
| `Panel` | `components/shell/primitives.tsx` | Stable |
| `PanelHeader` | `components/shell/primitives.tsx` | Stable |
| `EmptyState` | `components/shell/primitives.tsx` | Stable (basic) |
| `KpiCard` | `components/shell/primitives.tsx` | Stable |
| `DataSourceTag` | `components/shell/primitives.tsx` | Stable |
| `OperationalWorkspaceHeader` | `components/workspace/operational-workspace-header.tsx` | Stable |

### New Primitives (created this sprint)

File: `components/shell/operational-primitives.tsx`

| Primitive | Purpose |
|---|---|
| `StatusChip` | Inline operational status (uses ag-op-status CSS classes) |
| `AttentionBadge` | Count badge for exceptions/alerts requiring review |
| `WorkspaceSection` | Section container with title, action slot, and divider |
| `EmptyOperationalState` | Full-surface empty state with operational context |
| `OperationalMetric` | Compact metric row (label + value + optional delta) |
| `CopilotReadinessSlot` | Placeholder for AI suggestion slot (progressive) |
| `ModulePulseHeader` | Convenience wrapper over OperationalWorkspaceHeader + summary strip |

### CSS-level Primitives (use via className — no React wrapper needed)

| Class | Purpose | Section |
|---|---|---|
| `ag-op-table` | Operational table container | §13 |
| `ag-op-table-head` | Table header zone | §13 |
| `ag-op-row` | Interactive table row with left-bar hover | §13 |
| `ag-op-row--critical` | Critical row (red left bar + tinted bg) | §13 |
| `ag-op-row--warning` | Warning row (amber left bar + tinted bg) | §13 |
| `ag-op-row--passive` | Passive/closed row (70% opacity) | §13 |
| `ag-op-status` | Status badge base | §13 |
| `ag-op-status--ok/pending/warning/critical/info` | Status badge variants | §13 |
| `ag-intel-tag` | Inline relationship/context tag | §14 |
| `ag-intel-tag--warn/critical/ok` | Semantic variants | §14 |
| `ag-action-primary` | Primary execution button | §15 |
| `ag-action-secondary` | Operational action button | §15 |
| `ag-action-ghost` | Contextual/ghost link | §15 |
| `ag-action-tray` | Grouped action container | §15 |
| `ag-kpi-card` | KPI signal card | §7 |
| `ag-kpi-card.ag-urgent` | Critical KPI card | §12 |
| `ag-kpi-card.ag-warning` | Warning KPI card | §12 |
| `ag-signal-strip` | 3–4 column KPI strip wrapper | §12 |
| `ag-op-pulse` | One-line situation bar | §18 |
| `ag-copilot-zone` | AI section dashed separator | §18 |
| `ag-kpi-number--xl/lg/compact` | KPI number containment | §17 |
| `ag-movement-tag--stable/watch/risk` | Temporal movement tag | §19 |

---

## PART V — OPERATIONAL TABLE SYSTEM (Task 5)

### What an Agentik Table Is NOT

- No alternating row stripes (zebra tables = ERP legacy)
- No hard-coded column widths in absolute px without flex
- No actions rendered as icon-dense buttons in every row (use hover-revealed row actions)
- No overflow clipping without ellipsis + title tooltip
- No raw HTML `<table>` tag without `ag-op-table` container wrapper

### What an Agentik Table IS

```tsx
// Standard pattern — copy this for every new table
<div className="ag-op-table">
  {/* Header */}
  <div className="ag-op-table-head" style={{ display: "grid", gridTemplateColumns, padding: "8px 16px" }}>
    {columns.map(col => (
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
                    color: C.inkLight, textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {col.label}
      </div>
    ))}
  </div>
  {/* Rows */}
  {rows.map(row => (
    <div
      className={`ag-op-row ${row.severity === "critical" ? "ag-op-row--critical" : ""}`}
      style={{ display: "grid", gridTemplateColumns, padding: "10px 16px", borderBottom: `1px solid ${C.lineSubtle}` }}
    >
      {/* cells */}
    </div>
  ))}
  {/* Empty state */}
  {rows.length === 0 && <EmptyOperationalState message="Sin registros para este período" />}
</div>
```

### Row Density

| Context | Padding | Font size |
|---|---|---|
| Standard operational table | 10px 16px | T.sz.base (12px) |
| Dense (many rows, analytics) | 7px 16px | T.sz.sm (11px) |
| Relaxed (forms, configuration) | 14px 16px | T.sz.md (13px) |

### Status columns

Always use `ag-op-status` classes for status cells. Never use custom inline background colors.

```tsx
<span className={`ag-op-status ${statusClass}`}>{label}</span>
// statusClass: ag-op-status--ok | --pending | --warning | --critical | --info
```

---

## PART VI — SIDEBAR OS STANDARD (Task 7)

The left navigation rail is the **Agentik OS Rail** — it is NOT a menu.

### Architecture (4 levels)

```
Level 1 — System Rail (64px, navy gradient, persistent)
  Icons only + micro-labels
  Left-bar active indicator (3px, domain accent color)
  Domain grouping dividers

Level 2 — Context Sidebar (220px, white, collapsible)
  Domain title + accent dot
  Section headers (non-interactive, uppercase mono)
  Nav items (mono, left-accent-bar on active, hover tint)
  Role badge footer

Level 3 — Operational Canvas (1fr, white)
  Module content

Level 4 — Right Ops Rail (264px, surface, collapsible)
  AI insights, alerts, quick actions
```

### System Rail Rules

1. Icon + 8px mono label, uppercase, ≤8px tracking
2. Active state: left-bar indicator (3px, domain accent), subtle gradient background
3. Hover: opacity 88% on icon, rgba background
4. Rest: opacity 52% on icon, transparent background
5. No tooltip popups on hover — label is visible in button
6. Grouping dividers between Gestión and operational domains, and before Internal

### Domain Accent Colors (RAIL_ACCENTS)
```
gestion:   #94a3b8  (slate-400 — executive authority)
finanzas:  #60a5fa  (blue-400 — financial clarity)
cobranza:  #a78bfa  (violet-400 — collections identity)
comercial: #93c5fd  (blue-300 — commercial presence)
marketing: #c084fc  (purple-400 — creative/AI studio)
internal:  #818cf8  (indigo-400 — system console)
```

### Context Sidebar Rules

1. Section headers are non-interactive (isSectionHeader: true)
2. Nav items use persistent left border (2px transparent → accent color on active)
3. Hover: brand-50 background tint
4. Active: accent color (domain), accent-12% background
5. Indent levels: 0 = primary (font sm 600), 1 = sub (font xs 500), 2 = deep (font xs 500)
6. Disabled items: opacity 0.4, cursor default, no hover effect

---

## PART VII — MODULE STATE SYSTEM (Task 8)

Every module/workspace must handle these states consistently:

| State | Visual | When |
|---|---|---|
| `loading` | Skeleton pulses or spinner in panel content area | Data fetch in progress |
| `empty` | `EmptyOperationalState` with contextual message | Zero records, first-time setup |
| `ready` | Normal operational content | Data loaded, no issues |
| `blocked` | `BlockedView` (module not enabled) | Module access denied |
| `syncing` | Pulse dot animation + "Sincronizando..." label | Background sync in progress |
| `stale` | `ag-movement-tag--watch` + "Datos desactualizados" | Last sync > threshold |
| `degraded` | `ag-op-pulse--warn` | Partial data, some sources down |
| `requires_review` | `ag-op-pulse--warn` + attention layer visible | Exceptions require action |
| `unsupported` | `EmptyOperationalState` variant | Source combination not yet supported |

### State Implementation

```tsx
// Loading: skeleton rows
{loading && (
  <div className="ag-op-table">
    {[...Array(5)].map((_, i) => (
      <div key={i} style={{ padding: "10px 16px", borderBottom: `1px solid ${C.lineSubtle}`,
                             background: C.surfaceAlt, animation: "pulse 1.5s infinite" }} />
    ))}
  </div>
)}

// Empty operational state — see EmptyOperationalState primitive
{!loading && data.length === 0 && (
  <EmptyOperationalState
    message="Sin movimientos para este período"
    action={{ label: "Cambiar período", onClick: () => {} }}
  />
)}

// Pulse header states
<div className={`ag-op-pulse ag-op-pulse--${pulse}`}>...</div>
// pulse: "ok" | "warn" | "critical"
```

---

## PART VIII — CLAUDE DEVELOPMENT RULES (Task 9)

### Mandatory Pre-Build Checklist

Before implementing any new module or page, answer:

**1. Which blueprint layers apply?**
List which of the 8 blueprint layers this module needs.
Example: "Layers 1 (header), 2 (KPI strip), 3 (table), 6 (attention layer)"

**2. Which existing primitives will be reused?**
Explicitly name them: `OperationalWorkspaceHeader`, `ag-kpi-card`, `ag-op-table`, etc.
Never describe what you'll build — describe what you'll compose.

**3. What components already exist and should NOT be recreated?**
Check `components/shell/primitives.tsx`, `components/workspace/`, and `components/shell/workspace-shell-client.tsx` first.

**4. What logic will NOT be touched?**
State: "This UI change touches no Prisma queries / no SAG adapters / no engine logic."

**5. What data is real vs placeholder?**
Label every data prop as: `// REAL — from Prisma` or `// PLACEHOLDER — replace before ship`.

**6. How will generic UI be avoided?**
Name the ag-* classes you'll use. If you can't name them, stop and re-read this document.

**7. What operational states does this module need?**
From the state list: loading, empty, ready, blocked, syncing, stale, degraded, requires_review, unsupported.

### Mandatory Rules

- `T.mono` for ALL data values, KPIs, labels, status text, table cells
- `T.sans` ONLY for descriptive prose (longer than one sentence)
- `C.blueDark` for primary brand actions (never `C.brand` which is legacy purple)
- Never hardcode hex values — always use `C.*`, `--ag-*`, or `T.*`
- Never use Tailwind `text-*`, `bg-*`, `border-*` color classes inside the enterprise shell
- Never create a new card style — use `ag-kpi-card`, `ag-tcard`, `ag-rail-card`, or `Panel`
- Never use `box-shadow` inline — use `E.sm`, `E.md`, `E.lg`, or `--ag-shadow-*`
- Never add a new radius value — use `R.*` or `--ag-radius-*`
- Status badges must use `ag-op-status--*` classes, not custom inline colors
- Tables must use `ag-op-table` + `ag-op-row` structure
- Every page must start with `OperationalWorkspaceHeader` (or `ModulePulseHeader`)
- Every empty state must use `EmptyOperationalState`, not a plain `<div>No hay datos</div>`

### Anti-Patterns (PROHIBITED)

```tsx
// WRONG — generic card
<div className="rounded-lg border p-4 shadow">...</div>

// RIGHT
<div className="ag-kpi-card" style={{ padding: S[4] }}>...</div>

// WRONG — inline hex
<span style={{ color: "#22c55e" }}>Conciliado</span>

// RIGHT
<span className="ag-op-status ag-op-status--ok">Conciliado</span>

// WRONG — generic table
<table className="w-full border-collapse">...</table>

// RIGHT
<div className="ag-op-table">
  <div className="ag-op-table-head">...</div>
  <div className="ag-op-row">...</div>
</div>

// WRONG — generic heading
<h1 className="text-2xl font-bold mb-4">Conciliación</h1>

// RIGHT
<OperationalWorkspaceHeader
  breadcrumbs={[{ label: "Finanzas", href }, { label: "Conciliación" }]}
  title="Conciliación Inteligente"
  status="ready"
/>

// WRONG — ERP-style status
<span style={{ color: "green" }}>OK</span>

// RIGHT
<span className="ag-op-status ag-op-status--ok">OK</span>
```

---

## PART IX — MIGRATION STRATEGY (Task 10)

### Status by Module

#### Fully aligned (do not touch)
- Torre de Control (`/finanzas/torre-control/*`) — reference implementation
- Workspace Shell (`workspace-shell-client.tsx`) — fully formalized
- Reconciliation Sessions UI (`recon-client.tsx`) — follows blueprint

#### Partially aligned (migrate on next feature touch)
- Dashboard (`/dashboard/page.tsx`) — uses some ag-* classes, inconsistent cards
- Executive Page (`/executive/page.tsx`) — operational but uses inline styles extensively
- Alertas (`/alerts/page.tsx`) — table needs ag-op-table migration
- Colecciones (`/collections/page.tsx`) — basic layout, no blueprint structure

#### Legacy / not yet aligned (defer — migrate when redesigned)
- Pipeline (`/pipeline/`) — own data model, complex client state
- Reports (`/reports/`) — scheduled/generated reports, output-focused
- Integrations (`/integrations/`) — configuration-heavy, different UX pattern

#### Marketing Studio (special case)
- Has its own visual language (creative/generative AI)
- Inherits shell structure but workspace content is intentionally different
- Use ag-* primitives for chrome; marketing canvas is exempt from operational table rules

### Migration Principle

Migrate a module when:
1. You're already touching that page for a feature
2. The change takes < 30 min to apply the blueprint
3. No risk to existing data flow

Do NOT migrate speculatively. Only migrate on feature touch.

---

## PART X — FUTURE MODULE READINESS (Task 11)

The system is designed to support the following future modules without new primitives.
All are achievable by composing existing blueprint layers.

### Copilot Global
- Uses `ag-copilot-zone` separator + `ag-surface-ai` surface
- Events emitted to audit trail with `actorType: "agent"`
- Slot already defined as `CopilotReadinessSlot` in operational-primitives.tsx

### Agentes por módulo
- Each module's Layer 7 (Copilot Slot) becomes the agent's working zone
- Agent suggestions use `ag-ai-card` surfaces
- Agent actions require operator confirmation before applying

### Mobile-first Executive Layer
- `.mob-exec` / `.dsk-exec` responsive system already in design-system.css §10
- KPI containment system (`ag-kpi-number--*`) already responsive
- Executive mobile components exist in `components/executive/`

### Activity Streams
- Use `ag-op-table` with `ag-op-row--passive` for historical rows
- Timestamp as `ag-temporal-ctx` mono micro-label
- Actor + event as primary cell content

### Attention Routing
- `ag-op-pulse` as module-level signal (ok/warn/critical)
- Severity from `ag-op-row--critical/warning` in exception tables
- Count badges in nav items (item.badge in module-nav-config.ts)

### Reconciliation Workbench
- Layer 5 (Sessions/Results/Runs) is built for this
- ReconciliationExceptionSummary maps to `ag-op-status` badges
- Engine audit events map to Activity Layer

### Treasury Operations
- Torre de Control treasury cards = `ag-tcard` + `ag-tcard-bar`
- AP/AR drilldowns use standard operational table system

---

## PART XI — SURFACE SYSTEM REFERENCE

Every background in the product must match one of these 8 surfaces:

| Surface | Class | Color | Use |
|---|---|---|---|
| Shell | `ag-surface-shell` | navy gradient `#001E4A→#003A8A` | Primary nav rail |
| Workspace | `ag-surface-workspace` | `#ffffff` | Main page canvas |
| Elevated | `ag-surface-elevated` | white/F7F9FF gradient + border | Standard cards |
| Floating | `ag-surface-floating` | white + floating shadow | Modals, popovers |
| AI | `ag-surface-ai` | dark navy `#001E4A→#003A8A` | Copilot, AI panels |
| Subtle | `ag-surface-subtle` | `#EEF5FF` + border | Secondary zones, rail footers |
| Danger | `ag-surface-danger` | `#fff0f0` + red border | Error states, critical alerts |
| Insight | `ag-surface-insight` | white + left 4px brand bar | Data insight cards |

---

## PART XII — ACCEPTANCE CRITERIA (verified)

1. UX manifesto exists — this document
2. Standard blueprint defined — Part III
3. Operational primitives extracted — `components/shell/operational-primitives.tsx`
4. New modules inherit this system — Part VIII (Claude dev rules)
5. Calm operational philosophy documented — Part II
6. Module state system defined — Part VII
7. Migration strategy documented — Part IX
8. Sidebar formalized — Part VI
9. No existing modules broken — zero TypeScript regressions
10. No new TypeScript errors — verified with `npx tsc --noEmit`

---

## APPENDIX — Quick Reference Card

```
SURFACE     → ag-surface-{shell|workspace|elevated|floating|ai|subtle|danger|insight}
CARD        → ag-kpi-card [ag-urgent|ag-warning] | ag-tcard | ag-rail-card | Panel
TABLE       → ag-op-table → ag-op-table-head + ag-op-row [--critical|--warning|--passive]
STATUS      → ag-op-status ag-op-status--{ok|pending|warning|critical|info}
ACTION      → ag-action-{primary|secondary|ghost|danger} inside ag-action-tray
SHADOW      → E.sm | E.md | E.lg | E.focus  (never inline box-shadow)
RADIUS      → R.{xs|sm|md|lg|xl|card|pill}  (never inline border-radius)
COLORS      → C.{ink*|blueDark|green|amber|red|surface*}  (never raw hex)
TYPOGRAPHY  → T.mono for ALL data  |  T.sans for prose only
SPACING     → S[1|2|3|4|5|6|8|10]  (never inline px numbers)
HEADER      → OperationalWorkspaceHeader (breadcrumbs + title + status)
EMPTY       → EmptyOperationalState (never plain "No hay datos")
STATES      → loading|empty|ready|blocked|syncing|stale|degraded|requires_review|unsupported
```
