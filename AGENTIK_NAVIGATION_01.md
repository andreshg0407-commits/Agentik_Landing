# AGENTIK-NAVIGATION-01 — Operational Navigation System
**Sprint:** AGENTIK-NAVIGATION-01
**Depends on:** AGENTIK-UX-FOUNDATION-01 through AGENTIK-UX-FLOW-01

---

## Navigation Philosophy

Agentik is an AI Enterprise Operating System. Its navigation must feel like
a cockpit — not a SaaS sidebar. The user should be able to look at the left
rail and immediately know where they are, what modules exist, and how to get
to any operational surface in under 2 seconds.

**Before:** The primary rail showed cryptic 1–2 char badges ("G", "Fn", "C",
"Cm", "Mk", "Op", "∷"). No icons, no visual identity, no scanning rhythm.

**After:** Each domain is represented by a recognizable lucide icon with a
short label below. The rail is an icon-first, label-confirmed navigation system
consistent with enterprise OS patterns.

**Rule:** The navigation does not need to be "beautiful". It needs to be
**immediately understood**. Icon + label = no ambiguity. No shorthand.

---

## Audit Findings

### What already worked (not touched):
- `inferActiveDomain()` — correct longest-match logic, no change needed
- `NavItemLink` active state system — left-bar indicator + brand-50 tint — correct
- `ContextPanel` structure — tenant header + domain header + nav items — correct
- All section header (`isSectionHeader`) rendering logic
- All `pathMatches[]` active state extension logic
- Right Ops Rail — untouched
- All business logic, data queries, KPIs, metrics

### What needed fixing:
| Issue | Impact |
|-------|--------|
| `shortIcon: "G"`, `"Fn"`, `"C"`, `"Cm"`, `"Mk"`, `"Op"`, `"∷"` | Zero visual identity — cryptic, unrecognizable in dark rail |
| No icon system in primary rail | Rail felt like a shorthand tab strip, not an OS navigation layer |
| `PRIMARY_W = 56` | Too narrow for icon + label format — buttons were 36×36 |
| `"Embudo Comercial"` in Comercial domain | Sprint requirement: replaced with `"Pedidos"` |
| `"Operaciones"` domain (docs + knowledge) | Not in new taxonomy — removed entirely |
| WhatsApp missing from Marketing sidebar | Sprint taxonomy: WhatsApp must appear (as disabled) |
| `"Alertas Estratégicas"` label | Renamed to `"Alertas y Tareas"` per new taxonomy |
| `"Informes Ejecutivos"` label | Renamed to `"Informes Inteligentes"` per new taxonomy |
| `"Cola de Cobranza"` label | Renamed to `"Cobranza"` per new taxonomy |
| `"Campañas"` label | Renamed to `"Campañas de Cobro"` per new taxonomy |

### Castillitos — Operaciones domain:
The `ops` domain was gated on `hasDocuments || hasKnowledge`. Both modules are
enabled by default (open-by-default, no explicit disable row needed). This means
Operaciones was showing for Castillitos. **The domain is now removed entirely**
from `buildNavDomains` — it does not appear for any tenant. The `hasDocuments`
and `hasKnowledge` options are retained in `NavBuildOptions` for backward
compatibility with `layout.tsx` but are no longer used to build any nav domain.

---

## Files Modified

| File | Changes |
|------|---------|
| `components/shell/module-nav-config.ts` | Full restructure: new `iconKey` field, new taxonomy, removed Ops domain |
| `components/shell/workspace-shell-client.tsx` | 4 targeted changes: lucide imports, DOMAIN_ICONS registry, PRIMARY_W, DomainButton |

---

## module-nav-config.ts Changes

### New `iconKey` field on `DomainDef`

```typescript
// BEFORE
export type DomainDef = {
  id:        string;
  label:     string;
  shortIcon: string;   // 1-2 chars: "G", "Fn", "C", "Cm", "Mk", "Op"
  accent:    string;
  pathKeys:  string[];
  items:     NavItem[];
};

// AFTER
export type DomainDef = {
  id:        string;
  label:     string;
  shortIcon: string;   // retained for tooltip/aria fallback
  iconKey:   string;   // serializable key → resolved to LucideIcon in client shell
  accent:    string;
  pathKeys:  string[];
  items:     NavItem[];
};
```

**Why `iconKey: string` not `icon: LucideIcon`?**
`buildNavDomains()` is called from `layout.tsx` (Server Component) and the
result is passed as a prop to `WorkspaceShellClient` (Client Component). React
component functions cannot cross the RSC boundary — they are not serializable.
`iconKey` is a plain string that the client component resolves to the correct
lucide icon via the `DOMAIN_ICONS` registry.

### Domain icon assignments

| Domain | `iconKey` | Lucide Icon | Rationale |
|--------|-----------|-------------|-----------|
| Gestión | `"gestion"` | `LayoutDashboard` | Executive overview — dashboard pattern |
| Finanzas | `"finanzas"` | `TrendingUp` | Financial performance — trend line |
| Cobranza | `"cobranza"` | `CircleDollarSign` | AR collections — currency focus |
| Comercial | `"comercial"` | `Users` | Customer/commercial relationships |
| Marketing | `"marketing"` | `Sparkles` | Creative/AI studio — spark pattern |
| Consola | `"internal"` | `Terminal` | Internal dev console — terminal pattern |

### Taxonomy Changes

| Before | After | Location |
|--------|-------|----------|
| `"Informes Ejecutivos"` | `"Informes Inteligentes"` | Gestión |
| `"Alertas Estratégicas"` | `"Alertas y Tareas"` | Gestión |
| `"Embudo Comercial"` | `"Pedidos"` | Comercial → Análisis |
| `"Cola de Cobranza"` | `"Cobranza"` | Cobranza → Operaciones |
| `"Campañas"` | `"Campañas de Cobro"` | Cobranza → Operaciones |
| Marketing: no WhatsApp | WhatsApp (disabled) added | Marketing → Distribución |
| `ops` domain ("Operaciones") | **Removed** | — |

### Operaciones domain — removed

The `ops` domain only held `documents` and `knowledge` module links (both
disabled future items). It is not part of the new operational taxonomy. Removed.
`hasDocuments` / `hasKnowledge` flags retained in `NavBuildOptions` for
compatibility with `layout.tsx` — no layout changes needed.

---

## workspace-shell-client.tsx Changes

### 1. Lucide imports + DOMAIN_ICONS registry

```typescript
import {
  LayoutDashboard, TrendingUp, CircleDollarSign,
  Users, Sparkles, Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const DOMAIN_ICONS: Record<string, LucideIcon> = {
  gestion:   LayoutDashboard,
  finanzas:  TrendingUp,
  cobranza:  CircleDollarSign,
  comercial: Users,
  marketing: Sparkles,
  internal:  Terminal,
};
```

### 2. PRIMARY_W: 56 → 64

The rail was too narrow for icon + label. 64px gives 52px button width with
comfortable horizontal padding.

### 3. Left-bar indicator height: 28 → 36

Scaled to match the taller DomainButton (was 36×36, now 52×52).

### 4. DomainButton — icon + label layout

```tsx
// BEFORE: single character text in 36×36 square button
<button style={{ width: 36, height: 36, ... }}>
  {domain.shortIcon}   // "G", "Fn", "C", "Cm", "Mk", "Op", "∷"
</button>

// AFTER: icon + label in 52×52 column layout
const Icon = DOMAIN_ICONS[domain.iconKey] ?? LayoutDashboard;
<button style={{ width: 52, height: 52, flexDirection: "column", gap: 4, ... }}>
  <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
  <span style={{ fontSize: 8, fontWeight: bold, uppercase, maxWidth: 48, ... }}>
    {domain.label}
  </span>
</button>
```

**Active state distinction:** `strokeWidth={isActive ? 2 : 1.5}` — active icons
are slightly bolder. Inactive icons are lighter weight. Communicates state via
the icon itself, not just color.

**Label**: uses `domain.label` directly ("Gestión", "Finanzas", "Cobranza",
"Comercial", "Marketing", "Consola") — all 7–9 chars, readable at 8px mono.

---

## Module Hierarchy (Post-Sprint)

```
GESTIÓN          LayoutDashboard  #1e1e2e
  Gerencia →
  — Estrategia —
  Informes Inteligentes ✨
  Alertas y Tareas
  — IA & Decisiones —
  Decisiones IA  [próx.]
  Tareas Gerenciales  [próx.]

FINANZAS         TrendingUp  #1e40af
  Torre de Control →
  — Operaciones —
  Tesorería
  Conciliación Inteligente
  — Próximamente —
  Flujo de Caja  [próx.]
  Presupuestos   [próx.]
  Bancos y Créditos  [próx.]
  Forecast  [próx.]

COBRANZA         CircleDollarSign  #7c3aed
  Cartera →
  — Operaciones —
  Cobranza
  Campañas de Cobro
  Rendimiento
  Clientes Críticos
  — IA & Automatización —
  IA Cobranza  [próx.]

COMERCIAL        Users  #0369a1
  Cliente 360 →
  — Análisis —
  Pedidos
  Vendedores
  Canales
  Sucursales
  Líneas
  Control Comercial

MARKETING        Sparkles  #7c2d92
  Hub →
  — Creación —
  Foto Estudio ✨
  Biblioteca
  — Distribución —
  Redes Sociales
  WhatsApp  [próx.]
  Shopify
  — IA & Pauta —
  AI Ads  [próx.]
  IA Marketing  [próx.]

CONSOLA          Terminal  #4f46e5   [SUPER_ADMIN / AGENTIK_ADMIN only]
  Agentik →
  Ejecuciones
  — Integraciones —
  Conectores
  Aprobaciones SAG
  — Sistema —
  Configuración
```

---

## Tenant Rules

| Tenant | Operaciones domain | Result |
|--------|-------------------|--------|
| Castillitos | N/A — domain removed | Does not appear |
| All tenants | N/A — domain removed | Does not appear |

---

## What Was NOT Changed

- All Torres de Control pages, KPIs, metric cards, operational data
- All financial queries, Prisma models, API routes
- `ContextPanel` visual rendering (structure, footer, collapse button)
- `NavItemLink` active state logic and visual system
- `inferActiveDomain()` matching logic
- `WorkspaceShellClient` panel layout (CTX_W, RAIL_W, transitions)
- `layout.tsx` — no changes needed
- All module-access.ts role definitions
- All responsive logic (`.org-rail` hide at ≤1024px)
- Right Ops Rail

---

## Foundation Compliance

| Pattern | Result |
|---------|--------|
| New raw hex values introduced | None |
| New inline gradients | None |
| New inline shadows | None |
| New icon system dependencies | `lucide-react` — already in package.json |
| RSC boundary respected | Yes — `iconKey: string` (not React component) in DomainDef |

---

## TypeScript Validation

```
npx tsc --noEmit 2>&1 | grep -E "module-nav-config|workspace-shell-client|layout\.tsx"
→ (no output) — zero new errors in touched files
```

Pre-existing errors in codebase: 162 (unrelated to this sprint).

---

## Responsive Validation

| State | Behavior |
|-------|----------|
| Rail full | 64px primary + 220px ctx sidebar (was 56px) — 8px wider, canvas absorbs via `flex: 1 1 0` |
| Rail at ≤1024px | `.org-rail { display: none }` — right ops rail hides, primary rail + ctx sidebar remain |
| Context sidebar collapsed | `width: 0` CSS transition — unchanged |
| DomainButton hover | `rgba(255,255,255,.07)` background — unchanged logic |

---

## Known Risks / Remaining Debt

| Area | Note |
|------|------|
| `shortIcon` field retained | No longer rendered visually in the rail. Could be removed in a cleanup sprint. |
| `hasDocuments` / `hasKnowledge` in NavBuildOptions | No longer used by any domain builder. Could be removed in a cleanup sprint alongside `layout.tsx` update. |
| `strokeWidth` JSX prop on LucideIcon | Uses default lucide prop type — works but linting may flag in strict configs. |
| Consola domain `iconKey: "internal"` | The domain id is `"internal"` but the iconKey is also `"internal"` — intentional match. |

---

## Recommendation for Next Sprint

**AGENTIK-NAVIGATION-02** — Navigation depth and discoverability:
- Apply `ag-intel-tag` operational status hints to primary domain buttons (e.g., alert count badge on Cobranza)
- Add `title` tooltip on rail with domain description (not just label)
- Audit `ContextPanel` for section header visual weight — current section headers are very light
- Consider adding `LayoutGroup` framer-motion animation to the active indicator for smoother domain transitions
- Evaluate whether Consola should be shown at bottom of rail (pinned) vs. in the normal flow
