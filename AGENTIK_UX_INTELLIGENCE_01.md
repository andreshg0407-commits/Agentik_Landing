# AGENTIK-UX-INTELLIGENCE-01 — Contextual Operational Intelligence
**Sprint:** AGENTIK-UX-INTELLIGENCE-01
**Depends on:** AGENTIK-UX-FOUNDATION-01, AGENTIK-UX-SHELL-01, AGENTIK-UX-OPS-01, AGENTIK-UX-TABLES-01

---

## Audit Summary

Before writing any code, a full audit of the existing intelligence system was performed.

### What already existed and was NOT recreated:

| Primitive | Location | Status |
|-----------|----------|--------|
| `.ag-surface-ai` | design-system.css §5 | Fully functional — dark navy AI surface |
| `.ag-ai-strip` | design-system.css §6 | Fully functional — full-width AI band |
| `.ag-ai-card` | design-system.css §6 | Fully functional — contextual AI card with left bar |
| `.ag-copilot-surface` | design-system.css §6 | Fully functional — copilot rail container |
| `.ag-intelligence-ctx` | design-system.css §6 | Fully functional — subtle AI attribution |
| `.ag-intel-header` | design-system.css §12 | Fully functional — brand-50 section header |
| `.ag-insight-card` | design-system.css §12 | Fully functional — brand-tinted white card |
| `.ag-level-context` | design-system.css §12 | Fully functional — dark intelligence panel |
| `.ag-kpi-card` + severity modifiers | design-system.css §7 + §12 | Fully functional |
| `CopilotRail` component | copilot-rail.tsx | Fully functional — module-contextual AI rail |
| `RightOpsRail` component | right-ops-rail.tsx | Functional — needed targeted fixes |
| `ModuleContext` system | copilot-context.ts | Fully functional — 13+ module contexts |

---

## Files Modified

| File | Changes |
|------|---------|
| `app/design-system.css` | Added §14 — Intelligence Connection System |
| `components/layout/right-ops-rail.tsx` | 3 targeted changes |
| `components/layout/copilot-rail.tsx` | 5 targeted changes |

---

## §14 New CSS (design-system.css)

### Classes Added

| Class | Purpose |
|-------|---------|
| `.ag-intel-tag` | Inline operational context chip — brand-50 bg, brand border, mono uppercase |
| `.ag-intel-tag--warn` | Amber variant — "requiere atención", "en revisión" |
| `.ag-intel-tag--critical` | Red variant — "señales activas", "requiere acción" |
| `.ag-intel-tag--ok` | Green variant — "sin urgencias", "operación normal" |
| `.ag-copilot-thinking` | Subtle 1.6s opacity pulse applied to the "Analizando…" bubble |

### Design Logic

**`.ag-intel-tag`** fills a gap that existed throughout the system: there was no semantic way to display inline operational relationship labels ("impacta flujo", "en seguimiento", "señales activas"). The `ag-op-status` badge (§13) serves table row states. The `ag-intel-tag` serves inline contextual hints in rail sections and context bridges. Different semantic role — not duplicated.

**`.ag-copilot-thinking`** is the first and only animation in the system. It is intentionally subtle (opacity 0.45 → 1.0 at 1.6s) — slow enough to read as "thinking", not fast enough to feel like notification spam. It uses `ease-in-out` for a natural breathing rhythm.

---

## right-ops-rail.tsx — 3 Changes

### 1. Fix C.brand → C.blueDark in RailSection CTA

```tsx
// Before (purple leak — every non-urgent CTA was rendered in #7c3aed purple)
color: urgent ? countColor : C.brand,

// After
color: urgent ? countColor : C.blueDark,
```

This was the last remaining purple color leak in the rail. Every CTA link (when not urgent) was rendering in `#7c3aed` violet — breaking the brand blue system.

### 2. Context Bridge — Operational Memory + Linked Signal

Added a thin context bridge row between the operational signal sections (Alertas/Tareas) and the Copilot intelligence surface:

```tsx
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ... }}>
  <span style={{ ... }}>{moduleContext.moduleLabel}</span>
  <span className="ag-intel-tag ag-intel-tag--critical|ag-intel-tag|ag-intel-tag--ok">
    {hasAlerts ? "señales activas" : hasTasks ? "en seguimiento" : "sin urgencias"}
  </span>
</div>
```

**Effect:**
- Left side: shows the current module label (e.g., "Torre de Control") — creating the "operational memory" feel. The rail knows where you are.
- Right side: a single semantic state tag reflecting live data — critical when there are alerts, neutral blue when there are tasks, green when clean.
- Positioned immediately above the copilot — the transition from "operational signals" to "intelligence layer" now has a deliberate visual bridge.
- Uses real data (`hasAlerts`, `hasTasks`, `moduleContext`) — zero fake information.

### 3. Footer — Module Context Label

The footer previously showed only "Agentik Enterprise" as a static string. Enhanced with a second line showing the current module label:

```tsx
<div>Agentik Enterprise</div>
<div style={{ color: C.inkGhost }}>{moduleContext.moduleLabel}</div>
```

**Effect:** The bottom of the rail now reads as contextually aware. A user scrolling to the bottom sees "Agentik Enterprise / Torre de Control" — the system remembers where they are. Uses already-available `moduleContext` prop — zero new data fetching.

---

## copilot-rail.tsx — 5 Changes

### 1–3. C.sidebarLine → var(--ag-line)

Three `borderBottom` uses of `C.sidebarLine` (a token whose value wasn't aligned with the brand-tinted line system from AGENTIK-UX-SHELL-01):

| Location | Element |
|----------|---------|
| Module description section | Bottom separator |
| Suggested actions container | Bottom separator |
| Suggested prompt buttons | Row separator |

All three changed to `"1px solid var(--ag-line, rgba(0,74,173,.12))"`.

**Effect:** All separator lines inside the copilot are now brand-tinted and consistent with the rest of the shell. Previously they were rendering with the legacy sidebar line color, which appeared subtly "heavier" and more neutral than the brand system specifies.

### 4. Submit button gradient → CSS var

```tsx
// Before (raw hex inline gradient)
"linear-gradient(135deg, #004AAD, #1E63D8)"

// After (CSS var with resilient fallback)
"var(--ag-grad-hero, linear-gradient(135deg, #004AAD, #1E63D8))"
```

The submit button now references the canonical gradient token. If the token is ever updated centrally, the copilot button updates automatically.

### 5. Thinking indicator — ag-copilot-thinking animation

```tsx
// Before: static "Analizando…" bubble
<div style={{ ... }}>Analizando…</div>

// After: pulsing thinking state
<div className="ag-copilot-thinking" style={{ ... }}>Analizando…</div>
```

The "Analizando…" bubble now pulses at 1.6s — communicating an active thinking state without aggressive animation. This is the only animation in the entire product: intentional, purposeful, minimal.

---

## What Was NOT Changed

- All copilot conversation logic, state management, action execution
- All `ModuleContext` definitions in `copilot-context.ts`
- All `RailSection` rendering logic and data queries
- All KPI cards, signal cards, DailyCarousel
- All executive page sections
- All table files
- All routing and navigation
- All Prisma queries and API routes
- All module access/permission logic

---

## Foundation Compliance Audit

| Pattern | Before | After |
|---------|--------|-------|
| `C.brand` (purple) in CTA link | 1 occurrence — right-ops-rail.tsx:311 | Fixed → `C.blueDark` |
| `C.sidebarLine` in copilot-rail | 3 occurrences | Fixed → `var(--ag-line)` |
| Inline raw hex gradient in submit button | 1 occurrence | Fixed → `var(--ag-grad-hero, ...)` |
| New raw hex values introduced | None | — |
| New inline gradients introduced | None | — |
| New inline shadows introduced | None | — |
| New inline border-radius values | None | — |

---

## TypeScript Validation

```
npx tsc --noEmit 2>&1 | grep -E "right-ops-rail|copilot-rail"
→ (no output) — zero new errors
```

---

## Duplications Eliminated

| Before | After |
|--------|-------|
| `C.sidebarLine` and `var(--ag-line)` both used for the same semantic role (separator borders inside the copilot) | Unified to `var(--ag-line)` throughout |
| `C.brand` (purple) and `C.blueDark` (brand blue) both used for CTA links | CTA links now uniformly `C.blueDark` |

---

## System Connection Map (Post-Sprint)

```
[Operational Signals]        [Intelligence Layer]
  Alertas (CRITICAL count)  →
  Tareas  (PENDING count)   →  [Context Bridge]  →  [Copilot Rail]
  Module Context            →  moduleLabel tag        module-aware
                            →  state tag              conversation
                                                      thinking pulse
```

The context bridge is the new visual connector. It makes the relationship between "what's happening" and "the AI that knows about it" spatially explicit and readable.

---

## Known Risks / Remaining Debt

| Area | Note |
|------|------|
| `C.brand` in `primitives.tsx` | `BADGE_STYLES.brand` still uses `C.brand` — this is intentional, Badge `variant="brand"` is a UI primitive that might legitimately use purple. Not touched. |
| `C.sidebarLine` in other files | Likely appears in other components not audited in this sprint (workspace-shell-client, etc.) — these would be candidates for AGENTIK-UX-FOUNDATION-02 cleanup |
| `ag-intel-tag` usage | Currently only wired in the context bridge. Can be extended to executive page signal cards (Radar Comercial, Decisiones Agentik) to show linkage labels like "relacionado con cartera" |
| Intelligence tags on KPI cards | The `ag-kpi-card` and `ag-tcard` primitives could benefit from an optional `ag-intel-tag` in their corner — "observado recientemente", "actividad vinculada" — but this requires executive page edits in a future sprint |

---

## Recommendation for Next Sprint

**AGENTIK-UX-INTELLIGENCE-02** — Deepen intelligence expression:
- Apply `ag-intel-tag` to executive page signal cards (Radar Comercial strip, Cartera KPIs)
- Add relational context hints to high-value KPIs: "relacionado con cartera", "impacta flujo de caja"
- Upgrade the DailyCarousel card footer from "Abrir detalle →" to module-specific action phrases
- Audit remaining `C.sidebarLine` usages in workspace-shell-client and other shell components
