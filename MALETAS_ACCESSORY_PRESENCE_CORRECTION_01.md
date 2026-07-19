# MALETAS ACCESSORY PRESENCE CORRECTION — Sprint Report

**Sprint:** MALETAS-ACCESSORY-PRESENCE-CORRECTION-01
**Generated:** 2026-07-03
**Tenant:** Castillitos
**TSC Baseline:** 160 (maintained)

---

## Objective

Correct the accessory data model in Maletas so that:
1. Accessories (productLine=5) are recognized as present in each vendor's maleta (bodegas 45-50) via F34 transfers — same as textil.
2. Central availability for accessories comes from B36+B37 (import source warehouses), NOT B01 (CommercialCoverageSnapshot.disponible).
3. Accessories never show as "Reemplazar" — they use a scarcity model (Saludable/Escasez) with riesgo signaling.

---

## Previous Model (INCORRECT)

| Aspect | Previous Behavior | Problem |
|---|---|---|
| F34 presence | Engine queries all refs (correct) but comments said "Accessories don't use F34" | Misleading documentation |
| centralAvailable | All refs used `CommercialCoverageSnapshot.disponible` (B01) | B01 is textil bodega principal. Accessories have no B01 data — always 0 |
| state derivation | `deriveState(centralAvailable, minimum)` for all refs | Accessories with centralAvailable=0 always showed "reemplazar" |
| replaceRefs count | Counted all refs with state="reemplazar" including accessories | Inflated replacement count with accessories that can't be replaced |
| riesgoAgotamiento | Only true when state="saludable" AND close to minimum | Never triggered for accessories (state was always "reemplazar") |

---

## Corrected Model

| Aspect | New Behavior | Rationale |
|---|---|---|
| F34 presence | Same — engine queries all refs, no productLine filter | Accessories DO transfer via F34 to vendor bodegas 45-50 |
| centralAvailable | Accessories: `importAvailMap.get(ref)` (B36+B37). Textil: `coverage.disponible` (B01) | B36+B37 are the import source warehouses for accessories |
| state derivation | Accessories: always "saludable" (never "reemplazar"). Textil: unchanged | Accessories use scarcity model, not replacement model |
| replaceRefs count | Naturally excludes accessories (state never "reemplazar") | Replacement intelligence only applies to LT/CS textil |
| riesgoAgotamiento | Accessories: true when `centralAvailable <= IMPORT_SCARCITY_MINIMUM (10)` | Matches escasez threshold, signals low stock in vendor cards |

---

## Data Flow (Corrected)

```
ProductEntity (productLine=5)
  → importRefSet (Set<sku>)
  → isAccessory = importRefSet.has(ref)

ProductInventoryLevel (warehouseId IN ["36","37"])
  → importAvailMap (Map<sku, totalAvailable>)
  → centralAvailable for accessories

F34 movimientos_traslados (bodega 45-50)
  → VendorPresenceItem[] (ALL refs, including accessories)
  → present = netQty > 0

State derivation:
  Textil:  centralAvailable (B01) vs minimum (LT=30, CS=20)  → "saludable" | "reemplazar"
  Accessory: centralAvailable (B36+B37) vs minimum (IMPORT=10) → always "saludable"
             riesgoAgotamiento = centralAvailable <= 10
             accessoryScarcityState = centralAvailable > 10 ? "saludable" : "escasez"
```

---

## Files Modified

| File | Change |
|---|---|
| `lib/comercial/maletas/vendor-sample-loader.ts` | Phase 4: centralAvailable for accessories from importAvailMap (B36+B37). Phase 5: state always "saludable" for accessories, riesgoAgotamiento from IMPORT_SCARCITY_MINIMUM. Fixed 2 misleading comments. |
| `lib/comercial/maletas/vendor-sample-types.ts` | Fixed `centralAvailable` JSDoc (was "B01", now "textil: B01, accessories: B36+B37"). Fixed AccessorySummary comment (was "do NOT use F34", now "DO appear in F34"). |
| `app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx` | Fixed 2 misleading comments about accessories not using F34. |

---

## What Was NOT Changed (Correct As-Is)

| Component | Status | Why |
|---|---|---|
| Presence engine (`vendor-sample-presence-engine.ts`) | Correct | Already queries ALL refs from F34 — no productLine filter |
| `applyReplacements()` | Correct | Already skips accessories (line 534) |
| Production suggestions | Correct | Only LT/CS (line 622) |
| `AccessoryScarcityPanel` (UI) | Correct | Already shows B36+B37 data for accessories |
| `StateBadge` (UI) | Correct | Already checks accessoryScarcity first, overrides state display |
| `buildAccessorySummary()` | Correct | Uses importRefSet + importAvailMap |
| Commercial intelligence | Correct | Already excludes accessories from at-risk refs |
| Drawer routing | Correct | Accessories → AccessoryScarcityPanel, textil → ReplacementDetailPanel |

---

## Impact

| Metric | Before | After |
|---|---|---|
| centralAvailable for accessories | 0 (B01 has no accessory data) | Real B36+B37 stock |
| Accessories in replaceRefs | All of them (state always "reemplazar") | 0 (state always "saludable") |
| Accessories in riesgoAgotamiento | 0 (never triggered) | Those with B36+B37 <= 10 |
| Vendor health derivation | Inflated by accessory "reemplazar" count | Accurate — only textil replacements |

---

## Limitations

1. **0 accessories in F34 transfers currently** — vendor presence for accessories may return empty if no F34 transfers exist for productLine=5 refs to bodegas 45-50. This is a data state, not a code issue.
2. **accessorySummary is global** — all vendors share the same B36+B37 pool. Per-vendor accessory availability is not differentiated.
3. **No recompra automation** — future sprint ACCESSORY-REPLENISHMENT-INTELLIGENCE-01.
