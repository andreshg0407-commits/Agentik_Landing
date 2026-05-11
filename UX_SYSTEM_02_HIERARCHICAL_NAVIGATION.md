# UX-SYSTEM-02 — Hierarchical Workspace Navigation
## STATUS: COMPLETE
## DATE: 2026-05-08

---

## Hierarchy Model

```
LEVEL 1 — System Rail (56px, persistent, OS-layer)
  Each icon = one activated business system (Gestión, Finanzas, etc.)
  Signals:  left-bar active indicator (3px, domain.accent color)
  Behavior: click to activate system + show its sidebar
            click active system to toggle sidebar collapse
  Rule:     NEVER contains subpages or operational detail routes

LEVEL 2 — Context Sidebar (220px, workspace layer)
  Shows workspaces + tools for the currently active system
  Signals:  active item = tinted background + 2px left accent border + domain color text
  Grouping: section headers separate workspace roots from tools from future items
  Rule:     shows workspace ROOTS and TOOLS only — not operational detail pages

LEVEL 3 — Operational Canvas (breadcrumbs + workspace header)
  Handled by OperationalWorkspaceHeader component (UX-SYSTEM-01)
  Signals:  breadcrumbs show Finanzas › Torre de Control › [page]
  Rule:     only place operational detail routes appear in navigation
```

---

## Shell Behavior

### System switching (Level 1)
- Clicking a different system icon activates it and opens its context sidebar
- Clicking the currently active system icon toggles sidebar collapse
- Active domain syncs automatically when user navigates via Links (`useEffect` on `pathname`)
- Entering a different system feels like "entering another operational world" — entire sidebar replaces

### Active state strategy

| Level | What it signals | How |
|-------|----------------|-----|
| System (L1) | Active system | 3px left-bar indicator, height 28px, animated `height 0.15s ease`, domain.accent color |
| System (L1) | Hover preview | Subtle tinted background `${accent}14`, text lightens to `#cbd5e1` |
| Workspace (L2) | Active workspace | `${domainAccent}15` tinted bg + `2px solid domainAccent` left border + domain accent text |
| Workspace (L2) | Hover | `C.surfaceAlt` bg + brand color text |
| Workspace (L2) | Section header | Non-interactive, `C.inkGhost` uppercase label, `T.sz["2xs"]` |
| Workspace (L2) | Disabled item | `opacity: 0.4`, no pointer, no hover effects |

### Torre de Control active state on detail pages

Previously: "Torre de Control" was NOT highlighted when user was on `/cobros-hoy`, `/consignaciones`, etc.

Fix: `pathMatches: ["executive", "finanzas/torre-control"]` on the Torre de Control nav item.

Now: navigating to any `/finanzas/torre-control/*` workspace correctly highlights "Torre de Control" in the sidebar, showing the user they are inside that workspace.

---

## Navigation Architecture

### Files changed

| File | Change |
|------|--------|
| `components/shell/workspace-shell-client.tsx` | Left-bar rail indicator, active route detection, section header support, `useEffect` domain sync |
| `components/shell/module-nav-config.ts` | `isSectionHeader`, `pathMatches` added to NavItem; section headers in all domains; Torre de Control pathMatches |

### New NavItem fields

```typescript
isSectionHeader?: boolean
// Renders as a non-clickable group label (uppercase, ghost color)
// Use href: "#" for config simplicity
// Example: { label: "Operaciones", href: "#", isSectionHeader: true }

pathMatches?: string[]
// Extra pathname substrings that trigger active state for this item
// Example: Torre de Control → pathMatches: ["executive", "finanzas/torre-control"]
// This makes the item highlight when on any torre-control/* workspace
```

### Section headers added per domain

| Domain | Sections |
|--------|---------|
| Gestión | Estrategia · IA & Decisiones |
| Finanzas | Operaciones · Próximamente |
| Cobranza | Operaciones · IA & Automatización |
| Comercial | Análisis |
| Marketing | Creación · Distribución · IA & Pauta · Administración (admin) |
| Operaciones | Próximamente |
| Consola | Integraciones · Sistema |

---

## Active State Strategy (Detail)

### Primary Rail — Left-bar indicator

```
Before: border + background rectangle on active button
After:  3px vertical bar at left edge of rail, height 28px animated, domain.accent color
        icon button background: ${accent}22 when active (vs ${accent}14 on hover)
        no border on the button itself — cleaner, OS-native feel
```

The left-bar indicator pattern is used by Linear, VS Code, Figma, Stripe Dashboard.
It signals "you are here" without competing with the icon.

### Context Sidebar — Active workspace item

```
Before: no active state — nothing highlighted when on /cobros-hoy or any nav target
After:
  - background: ${domainAccent}15  (subtle system-colored tint)
  - borderLeft: 2px solid domainAccent  (persistent, transparent when inactive)
  - color: domainAccent  (matches system identity)
  - fontWeight: semibold  (always semibold for active, weight doesn't change)

borderLeft is always present (transparent) to prevent layout shift on activation.
paddingLeft reduced by 2px to compensate for border width.
```

---

## Future Extensibility

### Module activation
The shell naturally supports tenant-specific systems via `NavBuildOptions` flags:

```typescript
// Tenant A (Finanzas + Marketing only):
buildNavDomains({ hasFinance: true, hasMarketing: true, ...rest: false })
→ domains: [finanzas, marketing]

// Tenant B (all modules):
buildNavDomains({ ...allTrue })
→ domains: [gestion, finanzas, cobranza, comercial, marketing, ops, internal]
```

No shell code changes needed for new tenants — only `getEnabledModules()` configuration.

### Feature flags / role-aware navigation
Already supported via `showInternal`, `showPlatformAdmin`, individual module flags.
Admin-only items (Presets, Tenants, Platform Admin) gated by `opts.showInternal`.

### New workspace roots
To add a new workspace to a domain (e.g., "Cobros → Deudores"):
1. Add `NavItem` to the domain's `items[]` in `module-nav-config.ts`
2. Add `pathMatches` if it should also be active on sub-pages
3. Add section header if it starts a new group

No shell code changes needed.

### ⌘K command palette (future sprint)
The config-driven structure makes this straightforward:
```typescript
// All navigable items are in domains[].items[]
// Filter: !item.disabled && !item.isSectionHeader && item.href !== "#"
// Then render in a palette with domain label as group header
```

---

## TypeScript Status

Zero errors introduced. Verified:
```
npx tsc --noEmit | grep "workspace-shell|module-nav-config|layout.tsx"
→ (no output — clean)
```

---

## Remaining UX Debt

| Item | Priority | Notes |
|------|----------|-------|
| Sidebar items have no icons — text-only | Medium | Text-only nav is readable but all-monospace makes workspaces feel undifferentiated. Small dot/icon prefix per workspace root would help L2 clarity |
| Right ops rail content is generic | Medium | Rail should show workspace-aware context (last sync, quick metrics). Proposed in UX-SYSTEM-01 as next sprint |
| Mobile nav (≤768px) has no sidebar | Low | Currently hidden via CSS. Mobile needs a bottom-tab system for L1 + sheet for L2 |
| `useEffect` domain sync not debounced | Low | Effect fires on every pathname change. Negligible performance cost but worth memoizing if domains array grows |
| Torre de Control sidebar item doesn't show sub-workspace count | Low | "Torre de Control · 3 workspaces" as a badge would reinforce hierarchy |
| ⌘K palette not yet implemented | Backlog | High UX value for power users; config-ready |
