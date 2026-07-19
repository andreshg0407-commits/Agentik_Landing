# VENDOR-SAMPLE-TEXTILE-PRODUCTION-SUGGESTIONS-01

**Sprint:** VENDOR-SAMPLE-TEXTILE-PRODUCTION-SUGGESTIONS-01
**Module:** Comercial > Maletas
**Status:** COMPLETE
**TSC Baseline:** 160 (maintained)

---

## Problem

After PRODUCTION-FILTER-01, the production suggestions section disappeared because the condition was too restrictive — it required `centralAvailable <= 0` OR state `critica`/`sugerir_op`. Many textile refs have low but non-zero central stock (e.g., 2–5 units vs minimum 30) and were excluded.

## Change

`lib/comercial/maletas/vendor-sample-loader.ts` — simplified the production suggestion condition:

**Before:**
```typescript
if (ref.centralAvailable > ref.minimumRequired) continue;
if (ref.centralAvailable <= 0 || ref.state === "critica" || ref.state === "sugerir_op") {
```

**After:**
```typescript
if (ref.line !== "LT" && ref.line !== "CS") continue;
if (ref.centralAvailable >= ref.minimumRequired) continue;
// (all qualifying refs enter the map — no extra state gate)
```

## Rules

| Line | Minimum | Condition for suggestion |
|---|---|---|
| LT | 30 | centralAvailable < 30 |
| CS | 20 | centralAvailable < 20 |
| IMPORT | — | Never (future recompra alert) |

## Validated

Real data from B39 (Carlos Villa) confirms textile refs below minimum:
- L-3306 PIJAMA NIÑO CC 10-16 — central: 2 (min 30)
- L-1159 PIJAMA NIÑA CL 2-8 — central: 3 (min 30)
- L-3333 PIJAMA NIÑO CL 10-16 — central: 3 (min 30)

No accessories/imports appear in the list.
