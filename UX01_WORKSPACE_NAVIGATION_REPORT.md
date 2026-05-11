# UX-01 — Agentik Workspace Navigation Architecture
## STATUS: COMPLETE
## DATE: 2026-05-07

---

## Problem Statement

The legacy shell (`app/(app)/[orgSlug]/layout.tsx`) used a single static 272px sidebar with
~350 lines of hardcoded JSX menu items. Issues:

- No domain separation — all modules in one scrollable column
- No collapse — canvas width was always 272px + 240px smaller
- Nav logic was in the server layout — impossible to animate or make interactive
- `inferActiveDomain()` didn't exist — no concept of active domain
- Adding a new module required touching the 420-line layout file

---

## Architecture

### 4-Panel Workspace Shell

```
┌──────┬──────────────────┬─────────────────────────┬──────────┐
│  52  │      220px       │           1fr           │  264px   │
│      │                  │                         │          │
│ Prim │  Context Panel   │   Operational Canvas    │ Ops Rail │
│ Rail │  (collapsible)   │   (expands on collapse) │ (compact)│
│      │                  │                         │          │
└──────┴──────────────────┴─────────────────────────┴──────────┘
```

- **Primary Rail (52px)** — persistent dark navy strip, domain icon badges
- **Context Sidebar (220px)** — active domain nav items, collapses to 0
- **Canvas (1fr)** — always gets remaining space; transitions with sidebar
- **Right Rail (264px)** — collapses to 40px (toggle-only strip)

All panels push the canvas — no overlays. Width transitions at `0.18s ease`.

---

## Files Created / Modified

### New Files

| File | Purpose |
|------|---------|
| `components/shell/module-nav-config.ts` | Config types + `buildNavDomains()` + `inferActiveDomain()` |
| `components/shell/workspace-shell-client.tsx` | `"use client"` 4-panel shell component |

### Modified Files

| File | Change |
|------|--------|
| `app/(app)/[orgSlug]/layout.tsx` | Reduced from 422 → 93 lines; uses WorkspaceShellClient |

---

## module-nav-config.ts

Exports:
- `NavItem` — `{ label, href, indent?, accent?, badge?, disabled? }`
- `DomainDef` — `{ id, label, shortIcon, accent, pathKeys, items }`
- `NavBuildOptions` — 16 boolean flags + `orgSlug`
- `buildNavDomains(opts)` — returns 6 domains: `gestion`, `cobranza`, `comercial`, `marketing`, `ops`, `internal`
- `inferActiveDomain(pathname, domains)` — longest-pathKey match (handles "agentik/marketing-studio" > "agentik" specificity)

---

## workspace-shell-client.tsx

### Props

```typescript
interface WorkspaceShellClientProps {
  domains:      DomainDef[];      // from buildNavDomains()
  tenantHeader: ReactNode;        // <TenantSwitcher> server component slot
  roleBadge:    { label: string; accent: string };
  railContent:  ReactNode;        // <RightOpsRail> server component slot
  isBlocked:    boolean;
  children:     ReactNode;
}
```

### Behavior

- `usePathname()` → initial active domain via `inferActiveDomain()`
- Clicking a domain icon in Primary Rail → switches active domain
- Clicking the **already-active** domain icon → toggles context sidebar collapse
- Context sidebar `‹` button → collapses sidebar
- Right rail `‹` / `›` button → toggles rail between 264px and 40px

### Sub-components

| Component | Role |
|-----------|------|
| `PrimaryRail` | Dark navy strip with Agentik logo + domain buttons |
| `DomainButton` | Individual domain icon with hover/active states |
| `ContextPanel` | Active domain nav + tenantHeader slot + role badge |
| `NavItemLink` | Individual nav item with hover state, disabled/indent variants |
| `BlockedView` | "Módulo no habilitado" shown when `isBlocked=true` |

---

## layout.tsx Changes

Before: 422 lines of inline JSX navigation.

After: 93 lines. Responsibilities:
1. Auth + feature flag resolution (unchanged)
2. Route guard (unchanged)
3. `buildNavDomains()` — builds domain config from resolved flags
4. Renders `<WorkspaceShellClient>` with server-component slots

### Server → Client Composition

`TenantSwitcher` and `RightOpsRail` are both server components. They are rendered
at the server layout level and passed as `ReactNode` props (slots) to the client
WorkspaceShellClient. This preserves server-side data fetching without converting
either component to client.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| 52px primary rail (not icon-only sidebar) | Enough space for 1-2 char shortIcons; matches Notion/Linear aesthetic |
| `inferActiveDomain` uses longest-match | Prevents "marketing" domain activating for "agentik/marketing-studio" |
| Hover state via `useState` in `DomainButton` | Avoids global CSS; keeps styles co-located in client component |
| Right rail collapses to 40px (not 0) | Preserves the toggle button; user can re-expand without a separate gesture |
| TenantSwitcher/RightOpsRail as ReactNode slots | Preserves server component boundaries; no data fetching moved to client |

---

## TypeScript Status

Zero errors introduced. Zero pre-existing errors affected.
Verified with `npx tsc --noEmit | grep workspace-shell\|module-nav-config\|layout`.

---

## Sprint Status

| Sprint | Status |
|--------|--------|
| FIN-01 | COMPLETE |
| FIN-02 | COMPLETE — Financial Source Registry |
| FIN-03 | COMPLETE — Torre de Control Registry Migration |
| FIN-03.5 | COMPLETE — AP / Treasury Activation |
| TC-04 | COMPLETE — Operational Drilldown Correction |
| UX-01 | **COMPLETE** — Agentik Workspace Navigation Architecture |
