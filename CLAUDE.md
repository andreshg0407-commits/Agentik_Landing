# Agentik Enterprise OS — Claude Development Rules

**Enforced by:** AGENTIK-UX-SYSTEM-LOCK-01
**Full manifesto:** `AGENTIK_UX_SYSTEM_LOCK_01.md`

---

## What this project is

Agentik is an **operational enterprise OS** — not a dashboard collection.
Every module is a workspace inside one coherent system.
Building a new module means composing from existing primitives, not inventing layouts.

---

## Mandatory pre-build checklist (Task 9)

Before implementing any new page or module, answer these 7 questions:

1. **Which blueprint layers apply?**
   Choose from: Module Pulse Header / Operational Summary Strip / Primary Workspace /
   Secondary Workspace / Sessions-Results-Runs / Attention Layer / Copilot Slot / Activity Layer

2. **Which existing primitives will be reused?**
   Check `components/shell/primitives.tsx`, `components/shell/operational-primitives.tsx`,
   `components/workspace/operational-workspace-header.tsx` before writing any UI.

3. **What components already exist and must NOT be recreated?**
   Badge, Panel, PanelHeader, KpiCard, DataSourceTag, EmptyState, OperationalWorkspaceHeader,
   StatusChip, AttentionBadge, WorkspaceSection, EmptyOperationalState, CopilotReadinessSlot

4. **What logic will NOT be touched?**
   State explicitly: "No Prisma changes / no SAG adapter changes / no engine changes."

5. **What data is real vs placeholder?**
   Label every data prop: `// REAL — from Prisma` or `// PLACEHOLDER — replace before ship`

6. **How will generic UI be avoided?**
   Name the ag-* classes and primitives. If you can't name them, re-read the manifesto.

7. **What operational states does this module need?**
   loading | empty | ready | blocked | syncing | stale | degraded | requires_review | unsupported

---

## Token usage rules

| Resource | Correct import | Never do |
|---|---|---|
| Colors | `C.*` from `lib/ui/tokens` | Raw hex values |
| Spacing | `S[n]` from `lib/ui/tokens` | `padding: "16px"` inline |
| Typography | `T.mono` / `T.sans` / `T.sz.*` | `font-family: monospace` inline |
| Radius | `R.*` from `lib/ui/tokens` | `borderRadius: 8` inline |
| Shadow | `E.*` from `lib/ui/tokens` | `boxShadow: "0 2px 8px..."` inline |

**Critical:** `C.brand` = legacy purple. Use `C.blueDark` (#004AAD) for brand blue actions.

---

## Component usage rules

- `T.mono` for ALL operational data — KPIs, table cells, labels, status badges, actions
- `T.sans` ONLY for prose (multi-sentence descriptions)
- Every page MUST start with `OperationalWorkspaceHeader` or `ModulePulseHeader`
- Every empty table state MUST use `EmptyOperationalState` — never plain text
- Status badges MUST use `ag-op-status ag-op-status--{variant}` classes
- Tables MUST use `ag-op-table` container + `ag-op-row` rows
- Cards MUST use `ag-kpi-card`, `ag-tcard`, `ag-rail-card`, or `Panel`
- Actions MUST use `ag-action-primary/secondary/ghost` classes or `ag-action-tray`
- No Tailwind `text-*`, `bg-*`, `border-*` color classes inside the enterprise shell

---

## Prohibited patterns

```tsx
// PROHIBITED — generic card
<div className="rounded-lg border p-4 shadow">

// PROHIBITED — raw hex
<span style={{ color: "#22c55e" }}>OK</span>

// PROHIBITED — raw HTML table
<table className="w-full">

// PROHIBITED — generic H1
<h1 className="text-2xl font-bold">Module Title</h1>

// PROHIBITED — plain empty state
<div>No hay datos disponibles</div>

// PROHIBITED — arbitrary colors
<div style={{ background: "#f8faff", borderColor: "#dbeafe" }}>

// PROHIBITED — Tailwind colors in shell
<div className="text-blue-600 bg-blue-50 border-blue-200">
```

---

## Architecture boundaries (never cross)

- No client component imports in Server Components (use ReactNode slot pattern)
- No Prisma imports in client components (use server → props pattern)
- No engine logic (recon-engine, scoring, normalization) in UI layers
- No SAG adapter changes from UX sprints
- No DIAN calls from UI
- No financial side effects from display components

---

## After every code change

```bash
npx tsc --noEmit
```

Acceptable: 162 pre-existing errors.
Unacceptable: any new error introduced by your change.

---

## Current system files

| File | Purpose |
|---|---|
| `app/design-system.css` | Single source of truth for CSS variables and ag-* classes |
| `app/globals.css` | Global stylesheet (imports design-system.css) |
| `lib/ui/tokens.ts` | JS constants: C, T, S, R, E |
| `lib/ui/surfaces.ts` | Surface style helpers |
| `components/shell/workspace-shell-client.tsx` | 4-panel OS shell |
| `components/shell/primitives.tsx` | Core presentational primitives |
| `components/shell/operational-primitives.tsx` | Operational UX primitives (LOCK-01) |
| `components/workspace/operational-workspace-header.tsx` | Standard workspace header |
| `components/shell/module-nav-config.ts` | Navigation domain definitions |

---

## Current active tenant

CURRENT_ACTIVE_TENANT = castillitos
All SAG data lives in castillitos only.
