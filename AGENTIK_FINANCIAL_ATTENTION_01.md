# AGENTIK-FINANCIAL-ATTENTION-01
## Financial Observation Priority + Attention Routing

**Sprint closed:** 2026-05-10
**Files created:** 1 (`lib/financial/attention-router.ts`)
**Files modified:** 2 (`app/(app)/[orgSlug]/reconciliation/page.tsx`, `app/(app)/[orgSlug]/reconciliation/recon-client.tsx`)
**TypeScript errors before:** 162 | **after:** 162 — no regressions

---

## Sprint Objective

Transform "list of signals" into "what deserves attention first."

OBSERVATIONS-01 built the engine that generates observations per stream.
ATTENTION-01 routes those observations: one primary, grouped supporting signals, no noise.

```
OBSERVATIONS-01:  generateAllObservations() → flat sorted CopilotObservation[]
ATTENTION-01:     routeAttention() → primaryObservation + groupedSignals + attentionSummary
```

---

## Audit Summary (Mandatory First Step)

Files audited before implementation:

| File | Finding |
|------|---------|
| `lib/financial/observation-engine.ts` | `generateAllObservations()` returns a flat sorted list. With 10 streams × multiple rules = potentially 30+ observations. No grouping. No cap. This is the raw material that the attention router must organize. |
| `lib/financial/memory-model.ts` | `CopilotObservation` has `severity`, `observationType`, `streamId`, `relatedWorkspace`, `basedOnSnapshots`. All available for routing decisions. |
| `reconciliation/recon-client.tsx` | `ObservationStrip` was rendering `observations[0]` as primary + unlimited `rest` list. 7 `integration_missing` observations = 7 individual lines. No grouping. No executive summary. |
| `reconciliation/page.tsx` | Observations were passed raw. No routing layer. |

**Key noise sources identified:**
1. `integration_missing` — emitted per unlinked stream (up to 5-7 observations of same type)
2. `memory_building` — emitted per stream with <3 snapshots (up to 10 if freshly deployed)
3. `first_observation` — baseline state, one per nominal stream
4. Unlimited `rest` list in `ObservationStrip` — potential 20+ lines for a 10-stream org

---

## Attention Routing Philosophy

### The executive view

The operator arriving at Conciliación Inteligente has 30 seconds.
They need to know:
1. **Is there something critical right now?** → headline + primary signal
2. **What else needs attention?** → 3 grouped signals at most
3. **Is there background noise?** → "+N señales adicionales en segundo plano"

The router enforces this view. The engine generates everything. The router selects.

### What gets suppressed

Low-value observations are moved to `quietCount` (not shown individually):
- `integration_missing` — structural config state, not operational urgency
- `memory_building` — honest baseline; one grouped mention is enough
- `first_observation` — nominal; should never compete with real signals
- Excess signals beyond 4 total (1 primary + 3 grouped)

---

## Priority Rules (Task 2)

All rules are deterministic and documented:

| Rule | Logic |
|------|-------|
| P1 | `critical > elevated > watch > ok > info` (SEVERITY_RANK) |
| P2 | Among same severity: more `basedOnSnapshots` wins (stronger evidence) |
| P3 | Among same severity + snapshots: `relatedWorkspace != null` wins (actionable > informational) |
| P4 | `ok` observations always below actionable signals (positive ≠ urgent) |
| P5 | `memory_building` / `first_observation` / `integration_missing` always last (background types) |

### Primary observation selection

```
sorted = actionable observations sorted by P1→P2→P3
primary = sorted[0]   // highest-priority actionable signal
```

If no actionable observations exist, `primaryObservation` is null and the strip shows a calm state message.

---

## Grouping Strategy (Task 3)

### Grouping unit

A group is formed when ≥1 observations share the same `observationType`. The router always groups them — even single observations of background types.

### Synthesized messages

Each `observationType` has a template for N=1 and N>1:

| Type | N=1 | N>1 |
|------|-----|-----|
| `consecutive_increase` | "{name}: consignaciones en aumento consecutivo" | "{N} fuentes con consignaciones en aumento" |
| `integration_missing` | "{name}: sin lectura bancaria configurada" | "{N} fuentes sin lectura bancaria configurada" |
| `memory_building` | "{name}: historial acumulándose" | "{N} fuentes acumulando historial operacional" |
| `pending_resolved` | "{name}: consignaciones resueltas" | "{N} fuentes resolvieron consignaciones" |
| `stale_stream` | "{name}: sin captura de datos reciente" | "{N} fuentes sin capturas recientes" |
| (etc.) | Stream-specific | Group summary |

Stream names: up to 3 names shown directly; when >3 use "{N} fuentes".

### Always-grouped types

These types are always collapsed into groups (never shown individually in the additional list):
- `integration_missing` — shown as one line: "7 fuentes sin lectura bancaria configurada"
- `memory_building` — shown as one quiet-count entry if actionable signals exist
- `first_observation` — collapsed into quietCount

---

## Escalation Levels (Task 4)

| Level | Condition | Headline |
|-------|-----------|----------|
| `urgent` | Any `critical` observation | "Atención principal" |
| `elevated` | Any `elevated`, OR 3+ watch observations | "Atención principal" |
| `watch` | Any `watch` observation | "Seguimiento recomendado" |
| `positive` | Only `ok` observations | "Sin acción requerida" |
| `building` | Only `memory_building`/`first_observation` | "Memoria acumulándose" |
| `quiet` | No observations | "Sin señales financieras relevantes" |

### Context generation

The `attentionSummary.context` field provides one-line context:
- Actionable levels: describes the most common actionable type ("2 fuentes con consignaciones en aumento")
- Positive: "N fuentes en estado positivo"
- Building: "N fuentes acumulando historial"
- Quiet: "todas las fuentes en estado nominal"

---

## Noise Reduction (Task 6)

### Maximum UI surface

```
1 primary observation (full detail)
+ up to 3 grouped signals (compact list)
= 4 total visible items
```

Everything else → `quietCount` displayed as "+N señales adicionales en segundo plano"

### What collapses

| What | Where it goes |
|------|--------------|
| `integration_missing` observations | Grouped into one signal at end of list, or quietCount if no space |
| `memory_building` observations | Grouped into quietCount |
| `first_observation` observations | Collapsed into quietCount |
| Excess groups (>3 additional) | Counted in quietCount |

### Before vs After

```
Before (10-stream org, freshly deployed):
  "BNC AHO: primera observación — sin historial"
  "BNC CRT: primera observación — sin historial"
  "Occidente: primera observación — sin historial"
  "Caja Social: primera observación — sin historial"
  ... (10 lines)

After:
  [Memoria acumulándose · sin historial operacional suficiente]
  (quiet state, no list)

Before (active org, 3 banks with consecutive_increase):
  "BNC AHO: consignaciones en aumento por 3 días"
  "BNC CRT: consignaciones en aumento por 4 días"  ← gets buried
  "Banco Bogotá: consignaciones en aumento por 2 días"
  "TC Bogotá: sin lectura bancaria"
  "TC Occidente: sin lectura bancaria"
  ... (8 more lines)

After:
  [Atención principal · 3 fuentes con consignaciones en aumento]
  Primary: "BNC CRT: consignaciones en aumento por 4 días consecutivos — ahora 18 entradas"
  → Revisar
  Grouped: "BNC AHO, Banco Bogotá: consignaciones en aumento consecutivo"
  Grouped: "2 fuentes sin lectura bancaria configurada"
  +N señales adicionales en segundo plano
```

---

## ObservationStrip Evolution (Task 5)

### New props

```typescript
// Before:
<ObservationStrip observations={CopilotObservation[]} memoryTier={string} />

// After:
<ObservationStrip attentionPlan={AttentionRouterResult} />
```

### New layout

1. **Header row**: "Agentik observa · [headline] · [context]"
2. **Primary block**: message + suggestedAction + RULE_BASED provenance + "Revisar →" button
3. **Grouped signals list**: max 3, compact with severity dots and links
4. **Footer**: "+N señales adicionales en segundo plano" when quietCount > 0

Calm states (quiet/building/positive) show a single compact bar — no list, no noise.

---

## `AttentionRouterResult` Type

```typescript
interface AttentionRouterResult {
  primaryObservation:  CopilotObservation | null;
  groupedSignals:      ObservationGroup[];    // max 3
  attentionSummary:    AttentionSummary;      // headline + context + level
  affectedStreams:     number;                // distinct stream IDs with actionable obs
  recommendedFocus:    string | null;         // primary.suggestedAction
  quietCount:          number;               // collapsed observation count
  escalationLevel:     EscalationLevel;       // urgent/elevated/watch/positive/building/quiet
}
```

All fields are JSON-serializable. Safe as RSC → client props.

---

## What Was NOT Touched

- SAG integration, sync engine, adapters — zero modifications
- Prisma schema, migrations — zero modifications
- `getCobrosBreakdown()`, any existing financial calculations — zero modifications
- Reconciliation engine, dry runs, auto-reconciliation — zero modifications
- Executive dashboard, Torre de Control workspace pages — zero modifications
- `generateObservations()` / `generateAllObservations()` — unchanged
- Shell, routing, navigation — zero modifications

---

## Financial Copilot Readiness

The attention router is the final layer before the Financial Copilot:

```
generateAllObservations()  — RULE_BASED observations from snapshots
       ↓
routeAttention()           — Priority, grouping, executive summary
       ↓
ObservationStrip           — Renders attention plan to operator
       ↓
[Future] FinancialCopilot  — Enriches primary.message with natural language
                              Preserves escalationLevel and grouping structure
```

The Copilot's job: receive `AttentionRouterResult` + snapshot history → enrich `message` strings → same structure, better communication. The routing and severity remain deterministic.

---

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Observations are prioritized | ✅ `routeAttention()` applies P1–P5 rules |
| 2 | One clear primary observation | ✅ `primaryObservation` is the single highest-priority signal |
| 3 | Related signals grouped | ✅ `groupedSignals` groups by `observationType` with synthesized messages |
| 4 | Noise reduced | ✅ Max 4 visible items; excess → `quietCount` |
| 5 | Executive sees what matters first | ✅ Headline + context in header; primary observation prominent |
| 6 | No invented priorities | ✅ All rules documented; deterministic; traceable to severity + snapshots |
| 7 | No generative AI | ✅ `confidence: "RULE_BASED"` throughout |
| 8 | SAG not touched | ✅ Zero SAG changes |
| 9 | Reconciliation not broken | ✅ Zero reconciliation changes |
| 10 | TypeScript zero regressions | ✅ 162 → 162 |

---

## Next Sprint Recommendation

**AGENTIK-FINANCIAL-ATTENTION-02 — Stream Trend Indicators in FinancialStreamsPanel**

Now that attention routing is live, surface the same priority signal inline on each stream row:

1. Add `streamTrend` to each `StreamRow` — tiny indicator derived from `AttentionRouterResult`
   - `▲ +3d` (amber) when `consecutive_increase` in groupedSignals for this stream
   - `▼ −2d` (green) when `consecutive_decrease` active for this stream
   - `!` (red) when this stream is the `primaryObservation.streamId`

2. Add `escalationBadge` to `FinancialStreamsPanel` header
   - "2 fuentes requieren atención" when `affectedStreams > 0`
   - "Sistema en estado operativo nominal" when `escalationLevel === "quiet"`

3. Wire `attentionPlan` prop from ReconClient → FinancialStreamsPanel → StreamRow
   — No new data fetching; derives from already-computed `attentionPlan`

This makes the streams table + the observation strip tell the same story in two different levels of detail.
