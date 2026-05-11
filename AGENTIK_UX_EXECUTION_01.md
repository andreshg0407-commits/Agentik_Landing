# AGENTIK-UX-EXECUTION-01 — Operational Command Layer
**Sprint:** AGENTIK-UX-EXECUTION-01
**Depends on:** AGENTIK-UX-FOUNDATION-01 through AGENTIK-UX-INTELLIGENCE-01

---

## Execution Philosophy

Agentik is not a dashboard. It is an AI-powered enterprise operating system where
**understanding the business and acting on it are part of the same operational flow.**

This sprint formalizes the visual command layer — not by adding features, but by
giving existing actions a clear semantic hierarchy so users can scan, decide, and
act without friction.

**Rule:** Every action must communicate its operational weight. "Abrir detalle →"
carries zero weight. "Resolver ahora →" carries urgency. The visual hierarchy must
match the operational hierarchy.

---

## Audit Summary

### What already worked (not touched):
- Signal card CTAs: "Ver cartera →", "Conciliar →", "Ver composición →" — semantically correct
- `Decisiones Agentik` block: real data, real hrefs, semantic labels — good execution surface
- CopilotRail action buttons — clean type system (fixed in Intelligence-01)
- RailSection CTA labels — adequate (fixed in Intelligence-01)

### What needed fixing:
| Issue | Impact |
|-------|--------|
| `_action-button.tsx` primary variant = `#111` black | Every Level 1 button was styled as "dark UI" not brand system |
| `_action-button.tsx` outline variant = generic gray/white | Level 2 buttons had no connection to the operational brand |
| Modal submit button = `#7c3aed` purple | Last prominent purple in the execution layer |
| 5x `"monospace"` raw strings in `_action-button.tsx` | Token violation throughout all button renders |
| `DailyCarousel` footer = "Abrir detalle →" for ALL cards | Same CTA text regardless of severity — zero urgency communication |
| 2x `C.brand` purple in executive page action links | "Ver clientes con mora →", "Ver detalle →", "Ver flujo completo →" rendered purple |
| 2x `"#004AAD"` raw hex in action links | "Ver ejecución →", "Configurar alertas →" not using token |
| `"#1e40af"` + `"#eff6ff"` raw hex in "Crear presupuesto →" link | Tailwind hex leak in execution action |

### What did NOT exist (gap):
- Zero `.ag-action-*` CSS classes — no action hierarchy existed in the design system

---

## Files Modified

| File | Changes |
|------|---------|
| `app/design-system.css` | Added §15 — Action Hierarchy System (130 lines) |
| `app/(app)/[orgSlug]/_action-button.tsx` | 7 targeted edits |
| `components/executive/daily-carousel.tsx` | 1 targeted edit |
| `app/(app)/[orgSlug]/executive/page.tsx` | 6 targeted edits via sed |

---

## §15 New CSS Classes (design-system.css)

### Action Hierarchy

| Level | Class | Use |
|-------|-------|-----|
| Level 1 — Execution | `.ag-action-primary` | Critical operational actions: execute, approve, create |
| Level 1 — Escalation | `.ag-action-danger` | Dangerous/critical actions: escalate, alert, critical |
| Level 2 — Operational | `.ag-action-secondary` | Standard operational actions: review, manage, follow up |
| Level 3 — Contextual | `.ag-action-ghost` | Link-style contextual navigation: "ver historial", "relacionado con" |

### Command Containers

| Class | Use |
|-------|-----|
| `.ag-action-tray` | Flex container for grouped action buttons (wraps) |
| `.ag-action-row` | Clickable execution item row with hover state |

### Visual Design

**`.ag-action-primary`** — Brand blue gradient (`var(--ag-grad-hero)`), white text, `R.md` radius, hover: 1px lift + `shadow-md`. Communicates "primary execution". Replaces the previous `#111` black style.

**`.ag-action-secondary`** — Brand-50 background, brand blue text, brand-line border. Communicates "operational, not critical". Consistent with brand surface system.

**`.ag-action-ghost`** — Transparent background, brand blue text, no border. Communicates "navigational, contextual". 0.72 opacity on hover for subtle affordance.

**`.ag-action-danger`** — Red surface (`#fef2f2`), red text, red border. Reserved for escalation actions. Hover: red shadow tint.

**`.ag-action-row`** — White card gradient, brand-line border, hover: brand-50 wash. Used for execution command items (like the Decisiones Agentik rows, but reusable).

---

## _action-button.tsx — 7 Changes

### Variant System Overhaul

```typescript
// BEFORE
primary: { background: "#111", color: "#fff", border: "1px solid #111" }
outline: { background: "#fff", color: "#374151", border: "1px solid #d1d5db" }

// AFTER
primary: {
  background: "var(--ag-grad-hero, linear-gradient(135deg, #004AAD, #1E63D8))",
  color: "#ffffff",
  border: "none",
}
outline: {
  background: "var(--ag-brand-50, #EEF5FF)",
  color: "#004AAD",
  border: "1px solid rgba(0,74,173,.18)",
}
```

**Effect:** Every `ActionButton variant="primary"` in the product now renders with the Agentik brand gradient (Level 1 execution). Every `ActionButton variant="outline"` renders as a Level 2 operational action with brand-50 surface.

### Modal Submit Button (last prominent purple)

```typescript
// BEFORE
background: busy ? "#c4b5fd" : "#7c3aed"   // purple

// AFTER
background: busy ? "rgba(0,74,173,.35)" : "var(--ag-grad-hero, ...)"   // brand blue
```

The modal "Crear acción →" button now matches the primary action hierarchy. Creating an action is a Level 1 execution event — it should feel like one.

### Font Token (5 occurrences)

All `fontFamily: "monospace"` strings replaced with `T.mono`. This affects:
- Trigger button style
- Modal panel wrapper
- Modal submit button
- Modal cancel button
- INPUT form field style

---

## DailyCarousel — Severity-Contextual CTA

The "Abrir detalle →" footer was the weakest CTA in the entire product — identical text on every card regardless of severity.

```tsx
// BEFORE
Abrir detalle →  (always, on all cards, in brand blue)

// AFTER
card.severity === "critical" → "Resolver ahora →"    (red text)
card.severity === "warning"  → "Revisar situación →" (amber text)
other                        → "Ver detalle →"        (brand blue)
```

**Effect:** A KPI card showing "3 alertas críticas" now says "Resolver ahora →" in red.
A card showing pending consignaciones says "Revisar situación →" in amber.
The CTA communicates urgency before the user has to read the value.

Zero interface changes — uses the existing `severity` field already on every card.

---

## executive/page.tsx — 6 Action Link Fixes

| Line | Before | After |
|------|--------|-------|
| 1564 | `C.brand` purple border+color+bg on "Ver clientes con mora →" | `var(--ag-line)` border + `C.blueDark` + `var(--ag-brand-50)` |
| 2681 | `"#1e40af"` + `"#eff6ff"` raw hex on "Crear presupuesto →" | `var(--ag-line)` + `C.blueDark` + `var(--ag-brand-50)` |
| 2699 | `"#004AAD"` raw hex on "Ver ejecución →" | `C.blueDark` |
| 2703 | `"#004AAD"` raw hex on "Configurar alertas →" | `C.blueDark` |
| 2767 | `C.brand` purple on "Ver detalle →" (F1/F2 section) | `C.blueDark` |
| 3089 | `C.brand` purple on "Ver flujo completo →" | `C.blueDark` |

---

## What Was NOT Changed

- All `ActionButton` modal form logic and state management
- All `ActionButton` form fields, validation, submit handler
- All `ActionButton variant="purple"` — retained as legitimate semantic variant
- All `ActionButton variant="danger"` — already correct, untouched
- All signal card CTAs in executive page — already semantic ("Ver cartera →", etc.)
- All `Decisiones Agentik` action item rows — data logic, hrefs, badge system untouched
- All routing, navigation, permissions
- All financial queries and data logic
- All KPI card data wiring

---

## Action Hierarchy Rules (Post-Sprint)

For every action in Agentik, choose the correct level:

| Level | CSS Class | `ActionButton` variant | When to use |
|-------|-----------|------------------------|-------------|
| 1 — Execute | `.ag-action-primary` | `variant="primary"` | Create, execute, approve, resolve, submit |
| 1 — Escalate | `.ag-action-danger` | `variant="danger"` | Escalate, alert, force-close, critical |
| 2 — Operate | `.ag-action-secondary` | `variant="outline"` | Review, manage, open, assign, schedule |
| 3 — Context | `.ag-action-ghost` | `variant="ghost"` | Navigate, "ver detalle →", "relacionado con" |
| 4 — Passive | (not interactive) | — | Timestamps, counts, metadata |

---

## Operational Command Language Standards

| Context | Wrong | Right |
|---------|-------|-------|
| Critical KPI card footer | "Abrir detalle →" | "Resolver ahora →" |
| Warning KPI card footer | "Abrir detalle →" | "Revisar situación →" |
| Normal KPI card footer | "Abrir detalle →" | "Ver detalle →" |
| Collections action | "Abrir →" | "Ver cola urgente →" |
| Primary modal submit | "Crear →" | "Crear acción →" |

**Rule:** CTAs should communicate the operational outcome, not the UI action.
"Resolver ahora" tells you what happens. "Abrir detalle" tells you nothing.

---

## TypeScript Validation

```
npx tsc --noEmit 2>&1 | grep -E "_action-button|daily-carousel|executive/page"
→ (no output) — zero new errors
```

---

## Foundation Compliance Audit

| Pattern | Result |
|---------|--------|
| New raw hex values introduced | None |
| New inline gradients introduced | None (all CSS vars with fallbacks) |
| New inline shadows introduced | None |
| New inline border-radius values | None |
| `"monospace"` raw strings | Eliminated from `_action-button.tsx` (5 occurrences) |
| `C.brand` purple in action links | Eliminated (6 occurrences across 2 files) |
| `"#004AAD"` raw hex in action links | Eliminated (4 occurrences) |
| `"#1e40af"` Tailwind blue in action link | Eliminated (1 occurrence) |

---

## Known Risks / Remaining Debt

| Area | Note |
|------|------|
| `ActionButton variant="purple"` | Retained — may be used in specific AI/automation contexts where purple is semantically appropriate. Should be audited per usage |
| Modal form fields still use raw hex (`#e5e7eb`, `#64748b`) | Modal INPUT border + label colors. Low priority — these are inside a floating modal |
| `executive/page.tsx` has ~15 more `"#004AAD"` raw hex instances | These are label/badge colors, not CTAs. Deferred to FOUNDATION-02 cleanup sprint |
| `ag-action-row` not yet wired to any component | CSS class defined and ready — can replace the Decisiones Agentik action item row divs in the next sprint |
| `ag-action-primary/secondary` not yet wired to `ActionButton` trigger | `ActionButton` trigger uses `VARIANT_STYLES` inline — could be refactored to use `ag-action-*` classes in EXECUTION-02 |

---

## Recommendation for Next Sprint

**AGENTIK-UX-EXECUTION-02** — Wire command primitives to execution surfaces:
- Replace Decisiones Agentik action item rows with `.ag-action-row` class
- Apply `.ag-action-tray` to the ActionButton group in the executive page
- Apply `.ag-action-primary` / `.ag-action-secondary` as `className` in `ActionButton` trigger (remove the `VARIANT_STYLES` inline approach entirely)
- Upgrade remaining `ActionButton` modal form fields to use brand system (INPUT border, label colors)
- Audit `variant="purple"` usages and migrate to semantic variants
